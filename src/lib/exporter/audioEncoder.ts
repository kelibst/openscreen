import { WebDemuxer } from "web-demuxer";
import type { AudioRegion, SpeedRegion, TrimRegion } from "@/components/video-editor/types";
import { toFileUrl } from "@/components/video-editor/projectPersistence";
import type { VideoMuxer } from "./muxer";

const AUDIO_BITRATE = 128_000;
const DECODE_BACKPRESSURE_LIMIT = 20;
const MIN_SPEED_REGION_DELTA_MS = 0.0001;

export class AudioProcessor {
	private cancelled = false;

	/**
	 * Audio export has two modes:
	 * 1) no speed regions -> fast WebCodecs trim-only pipeline
	 * 2) speed regions present -> pitch-preserving rendered timeline pipeline
	 *
	 * When audioRegions are provided, the primary audio and all imported audio
	 * tracks are mixed down via OfflineAudioContext before encoding.
	 */
	async process(
		demuxer: WebDemuxer,
		muxer: VideoMuxer,
		videoUrl: string,
		trimRegions?: TrimRegion[],
		speedRegions?: SpeedRegion[],
		readEndSec?: number,
		audioRegions?: AudioRegion[],
		totalOutputDurationMs?: number,
		primaryAudioVolume?: number,
		primaryAudioMuted?: boolean,
	): Promise<void> {
		const sortedTrims = trimRegions ? [...trimRegions].sort((a, b) => a.startMs - b.startMs) : [];
		const sortedSpeedRegions = speedRegions
			? [...speedRegions]
					.filter((region) => region.endMs - region.startMs > MIN_SPEED_REGION_DELTA_MS)
					.sort((a, b) => a.startMs - b.startMs)
			: [];

		const validAudioRegions = (audioRegions ?? []).filter((r) => r.sourcePath && r.endMs > r.startMs);

		if (validAudioRegions.length > 0 && totalOutputDurationMs && totalOutputDurationMs > 0) {
			const primaryBlob = primaryAudioMuted
				? null
				: await this.renderPrimaryAudioBlob(videoUrl, sortedTrims, sortedSpeedRegions, totalOutputDurationMs);
			if (this.cancelled) return;
			const mixed = await this.mixAudioRegions(primaryBlob, validAudioRegions, totalOutputDurationMs, primaryAudioVolume ?? 1.0);
			if (this.cancelled) return;
			await this.muxRenderedAudioBlob(mixed, muxer);
			return;
		}

		if (primaryAudioMuted) return;

		// Speed edits must use timeline playback to preserve pitch
		if (sortedSpeedRegions.length > 0) {
			const renderedAudioBlob = await this.renderPitchPreservedTimelineAudio(
				videoUrl,
				sortedTrims,
				sortedSpeedRegions,
			);
			if (!this.cancelled) {
				await this.muxRenderedAudioBlob(renderedAudioBlob, muxer);
				return;
			}
		}

		// No speed edits: keep the original demux/decode/encode path with trim timestamp remap.
		await this.processTrimOnlyAudio(demuxer, muxer, sortedTrims, readEndSec);
	}

	// Legacy trim-only path. This is still used for projects without speed regions.
	private async processTrimOnlyAudio(
		demuxer: WebDemuxer,
		muxer: VideoMuxer,
		sortedTrims: TrimRegion[],
		readEndSec?: number,
	): Promise<void> {
		let audioConfig: AudioDecoderConfig;
		try {
			audioConfig = (await demuxer.getDecoderConfig("audio")) as AudioDecoderConfig;
		} catch {
			console.warn("[AudioProcessor] No audio track found, skipping");
			return;
		}

		const codecCheck = await AudioDecoder.isConfigSupported(audioConfig);
		if (!codecCheck.supported) {
			console.warn("[AudioProcessor] Audio codec not supported:", audioConfig.codec);
			return;
		}

		// Phase 1: Decode audio from source, skipping trimmed regions
		const decodedFrames: AudioData[] = [];

		const decoder = new AudioDecoder({
			output: (data: AudioData) => decodedFrames.push(data),
			error: (e: DOMException) => console.error("[AudioProcessor] Decode error:", e),
		});
		decoder.configure(audioConfig);

		const safeReadEndSec =
			typeof readEndSec === "number" && Number.isFinite(readEndSec)
				? Math.max(0, readEndSec)
				: undefined;
		const audioStream = (
			safeReadEndSec !== undefined
				? demuxer.read("audio", 0, safeReadEndSec)
				: demuxer.read("audio")
		) as ReadableStream<EncodedAudioChunk>;
		const reader = audioStream.getReader();

		try {
			while (!this.cancelled) {
				const { done, value: chunk } = await reader.read();
				if (done || !chunk) break;

				const timestampMs = chunk.timestamp / 1000;
				if (this.isInTrimRegion(timestampMs, sortedTrims)) continue;

				decoder.decode(chunk);

				while (decoder.decodeQueueSize > DECODE_BACKPRESSURE_LIMIT && !this.cancelled) {
					await new Promise((resolve) => setTimeout(resolve, 1));
				}
			}
		} finally {
			try {
				await reader.cancel();
			} catch {
				/* reader already closed */
			}
		}

		if (decoder.state === "configured") {
			await decoder.flush();
			decoder.close();
		}

		if (this.cancelled || decodedFrames.length === 0) {
			for (const frame of decodedFrames) frame.close();
			return;
		}

		// Phase 2: Re-encode with timestamps adjusted for trim gaps
		const encodedChunks: { chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }[] = [];

		const encoder = new AudioEncoder({
			output: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => {
				encodedChunks.push({ chunk, meta });
			},
			error: (e: DOMException) => console.error("[AudioProcessor] Encode error:", e),
		});

		const sampleRate = audioConfig.sampleRate || 48000;
		const channels = audioConfig.numberOfChannels || 2;

		const encodeConfig: AudioEncoderConfig = {
			codec: "opus",
			sampleRate,
			numberOfChannels: channels,
			bitrate: AUDIO_BITRATE,
		};

		const encodeSupport = await AudioEncoder.isConfigSupported(encodeConfig);
		if (!encodeSupport.supported) {
			console.warn("[AudioProcessor] Opus encoding not supported, skipping audio");
			for (const frame of decodedFrames) frame.close();
			return;
		}

		encoder.configure(encodeConfig);

		for (const audioData of decodedFrames) {
			if (this.cancelled) {
				audioData.close();
				continue;
			}

			const timestampMs = audioData.timestamp / 1000;
			const trimOffsetMs = this.computeTrimOffset(timestampMs, sortedTrims);
			const adjustedTimestampUs = audioData.timestamp - trimOffsetMs * 1000;

			const adjusted = this.cloneWithTimestamp(audioData, Math.max(0, adjustedTimestampUs));
			audioData.close();

			encoder.encode(adjusted);
			adjusted.close();
		}

		if (encoder.state === "configured") {
			await encoder.flush();
			encoder.close();
		}

		// Phase 3: Flush encoded chunks to muxer
		for (const { chunk, meta } of encodedChunks) {
			if (this.cancelled) break;
			await muxer.addAudioChunk(chunk, meta);
		}

		console.log(
			`[AudioProcessor] Processed ${decodedFrames.length} audio frames, encoded ${encodedChunks.length} chunks`,
		);
	}

	// Speed-aware path that mirrors preview semantics (trim skipping + playbackRate regions)
	// preserve pitch through browser media playback behavior to avoid chipmunk effect.
	private async renderPitchPreservedTimelineAudio(
		videoUrl: string,
		trimRegions: TrimRegion[],
		speedRegions: SpeedRegion[],
	): Promise<Blob> {
		const media = document.createElement("audio");
		media.src = videoUrl;
		media.preload = "auto";

		const pitchMedia = media as HTMLMediaElement & {
			preservesPitch?: boolean;
			mozPreservesPitch?: boolean;
			webkitPreservesPitch?: boolean;
		};
		pitchMedia.preservesPitch = true;
		pitchMedia.mozPreservesPitch = true;
		pitchMedia.webkitPreservesPitch = true;

		await this.waitForLoadedMetadata(media);
		if (this.cancelled) {
			throw new Error("Export cancelled");
		}

		const audioContext = new AudioContext();
		const sourceNode = audioContext.createMediaElementSource(media);
		const destinationNode = audioContext.createMediaStreamDestination();
		sourceNode.connect(destinationNode);

		const { recorder, recordedBlobPromise } = this.startAudioRecording(destinationNode.stream);
		let rafId: number | null = null;

		try {
			if (audioContext.state === "suspended") {
				await audioContext.resume();
			}

			await this.seekTo(media, 0);
			await media.play();

			await new Promise<void>((resolve, reject) => {
				const cleanup = () => {
					if (rafId !== null) {
						cancelAnimationFrame(rafId);
						rafId = null;
					}
					media.removeEventListener("error", onError);
					media.removeEventListener("ended", onEnded);
				};

				const onError = () => {
					cleanup();
					reject(new Error("Failed while rendering speed-adjusted audio timeline"));
				};

				const onEnded = () => {
					cleanup();
					resolve();
				};

				const tick = () => {
					if (this.cancelled) {
						cleanup();
						resolve();
						return;
					}

					const currentTimeMs = media.currentTime * 1000;
					const activeTrimRegion = this.findActiveTrimRegion(currentTimeMs, trimRegions);

					if (activeTrimRegion && !media.paused && !media.ended) {
						const skipToTime = activeTrimRegion.endMs / 1000;
						if (skipToTime >= media.duration) {
							media.pause();
							cleanup();
							resolve();
							return;
						}
						media.currentTime = skipToTime;
					} else {
						const activeSpeedRegion = this.findActiveSpeedRegion(currentTimeMs, speedRegions);
						const playbackRate = activeSpeedRegion ? activeSpeedRegion.speed : 1;
						if (Math.abs(media.playbackRate - playbackRate) > 0.0001) {
							media.playbackRate = playbackRate;
						}
					}

					if (!media.paused && !media.ended) {
						rafId = requestAnimationFrame(tick);
					} else {
						cleanup();
						resolve();
					}
				};

				media.addEventListener("error", onError, { once: true });
				media.addEventListener("ended", onEnded, { once: true });
				rafId = requestAnimationFrame(tick);
			});
		} finally {
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
			}
			media.pause();
			if (recorder.state !== "inactive") {
				recorder.stop();
			}
			destinationNode.stream.getTracks().forEach((track) => track.stop());
			sourceNode.disconnect();
			destinationNode.disconnect();
			await audioContext.close();
			media.src = "";
			media.load();
		}

		const recordedBlob = await recordedBlobPromise;
		if (this.cancelled) {
			throw new Error("Export cancelled");
		}
		return recordedBlob;
	}

	// Demuxes the rendered speed-adjusted blob and feeds encoded chunks into the MP4 muxer.
	private async muxRenderedAudioBlob(blob: Blob, muxer: VideoMuxer): Promise<void> {
		if (this.cancelled) return;

		const file = new File([blob], "speed-audio.webm", { type: blob.type || "audio/webm" });
		const wasmUrl = new URL("./wasm/web-demuxer.wasm", window.location.href).href;
		const demuxer = new WebDemuxer({ wasmFilePath: wasmUrl });

		try {
			await demuxer.load(file);
			const audioConfig = (await demuxer.getDecoderConfig("audio")) as AudioDecoderConfig;
			const reader = (demuxer.read("audio") as ReadableStream<EncodedAudioChunk>).getReader();
			let isFirstChunk = true;

			try {
				while (!this.cancelled) {
					const { done, value: chunk } = await reader.read();
					if (done || !chunk) break;
					if (isFirstChunk) {
						await muxer.addAudioChunk(chunk, { decoderConfig: audioConfig });
						isFirstChunk = false;
					} else {
						await muxer.addAudioChunk(chunk);
					}
				}
			} finally {
				try {
					await reader.cancel();
				} catch {
					/* reader already closed */
				}
			}
		} finally {
			try {
				demuxer.destroy();
			} catch {
				/* ignore */
			}
		}
	}

	private startAudioRecording(stream: MediaStream): {
		recorder: MediaRecorder;
		recordedBlobPromise: Promise<Blob>;
	} {
		const mimeType = this.getSupportedAudioMimeType();
		const options: MediaRecorderOptions = {
			audioBitsPerSecond: AUDIO_BITRATE,
			...(mimeType ? { mimeType } : {}),
		};

		const recorder = new MediaRecorder(stream, options);
		const chunks: Blob[] = [];

		const recordedBlobPromise = new Promise<Blob>((resolve, reject) => {
			recorder.ondataavailable = (event: BlobEvent) => {
				if (event.data && event.data.size > 0) {
					chunks.push(event.data);
				}
			};
			recorder.onerror = () => {
				reject(new Error("MediaRecorder failed while capturing speed-adjusted audio"));
			};
			recorder.onstop = () => {
				const type = mimeType || chunks[0]?.type || "audio/webm";
				resolve(new Blob(chunks, { type }));
			};
		});

		recorder.start();
		return { recorder, recordedBlobPromise };
	}

	private getSupportedAudioMimeType(): string | undefined {
		const candidates = ["audio/webm;codecs=opus", "audio/webm"];
		for (const candidate of candidates) {
			if (MediaRecorder.isTypeSupported(candidate)) {
				return candidate;
			}
		}
		return undefined;
	}

	private waitForLoadedMetadata(media: HTMLMediaElement): Promise<void> {
		if (Number.isFinite(media.duration) && media.readyState >= HTMLMediaElement.HAVE_METADATA) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve, reject) => {
			const onLoaded = () => {
				cleanup();
				resolve();
			};
			const onError = () => {
				cleanup();
				reject(new Error("Failed to load media metadata for speed-adjusted audio"));
			};
			const cleanup = () => {
				media.removeEventListener("loadedmetadata", onLoaded);
				media.removeEventListener("error", onError);
			};

			media.addEventListener("loadedmetadata", onLoaded);
			media.addEventListener("error", onError, { once: true });
		});
	}

	private seekTo(media: HTMLMediaElement, targetSec: number): Promise<void> {
		if (Math.abs(media.currentTime - targetSec) < 0.0001) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve, reject) => {
			const onSeeked = () => {
				cleanup();
				resolve();
			};
			const onError = () => {
				cleanup();
				reject(new Error("Failed to seek media for speed-adjusted audio"));
			};
			const cleanup = () => {
				media.removeEventListener("seeked", onSeeked);
				media.removeEventListener("error", onError);
			};

			media.addEventListener("seeked", onSeeked, { once: true });
			media.addEventListener("error", onError, { once: true });
			media.currentTime = targetSec;
		});
	}

	private findActiveTrimRegion(
		currentTimeMs: number,
		trimRegions: TrimRegion[],
	): TrimRegion | null {
		return (
			trimRegions.find(
				(region) => currentTimeMs >= region.startMs && currentTimeMs < region.endMs,
			) || null
		);
	}

	private findActiveSpeedRegion(
		currentTimeMs: number,
		speedRegions: SpeedRegion[],
	): SpeedRegion | null {
		return (
			speedRegions.find(
				(region) => currentTimeMs >= region.startMs && currentTimeMs < region.endMs,
			) || null
		);
	}

	private cloneWithTimestamp(src: AudioData, newTimestamp: number): AudioData {
		const isPlanar = src.format?.includes("planar") ?? false;
		const numPlanes = isPlanar ? src.numberOfChannels : 1;

		let totalSize = 0;
		for (let planeIndex = 0; planeIndex < numPlanes; planeIndex++) {
			totalSize += src.allocationSize({ planeIndex });
		}

		const buffer = new ArrayBuffer(totalSize);
		let offset = 0;
		for (let planeIndex = 0; planeIndex < numPlanes; planeIndex++) {
			const planeSize = src.allocationSize({ planeIndex });
			src.copyTo(new Uint8Array(buffer, offset, planeSize), { planeIndex });
			offset += planeSize;
		}

		return new AudioData({
			format: src.format!,
			sampleRate: src.sampleRate,
			numberOfFrames: src.numberOfFrames,
			numberOfChannels: src.numberOfChannels,
			timestamp: newTimestamp,
			data: buffer,
		});
	}

	private isInTrimRegion(timestampMs: number, trims: TrimRegion[]): boolean {
		return trims.some((trim) => timestampMs >= trim.startMs && timestampMs < trim.endMs);
	}

	private computeTrimOffset(timestampMs: number, trims: TrimRegion[]): number {
		let offset = 0;
		for (const trim of trims) {
			if (trim.endMs <= timestampMs) {
				offset += trim.endMs - trim.startMs;
			}
		}
		return offset;
	}

	// Renders the primary video audio (with trims + speed) to a Blob.
	private async renderPrimaryAudioBlob(
		videoUrl: string,
		sortedTrims: TrimRegion[],
		sortedSpeedRegions: SpeedRegion[],
		_totalOutputDurationMs: number,
	): Promise<Blob | null> {
		if (sortedSpeedRegions.length > 0) {
			return this.renderPitchPreservedTimelineAudio(videoUrl, sortedTrims, sortedSpeedRegions);
		}

		// No speed regions: render primary audio via AudioContext capture
		const media = document.createElement("audio");
		media.src = videoUrl;
		media.preload = "auto";

		await this.waitForLoadedMetadata(media);
		if (this.cancelled) return null;

		const audioContext = new AudioContext();
		const sourceNode = audioContext.createMediaElementSource(media);
		const destinationNode = audioContext.createMediaStreamDestination();
		sourceNode.connect(destinationNode);

		const { recorder, recordedBlobPromise } = this.startAudioRecording(destinationNode.stream);

		try {
			if (audioContext.state === "suspended") await audioContext.resume();
			await this.seekTo(media, 0);
			await media.play();

			await new Promise<void>((resolve) => {
				const cleanup = () => {
					media.removeEventListener("ended", onEnded);
				};
				const onEnded = () => { cleanup(); resolve(); };
				media.addEventListener("ended", onEnded, { once: true });
			});
		} finally {
			media.pause();
			if (recorder.state !== "inactive") recorder.stop();
			destinationNode.stream.getTracks().forEach((t) => t.stop());
			sourceNode.disconnect();
			destinationNode.disconnect();
			await audioContext.close();
			media.src = "";
			media.load();
		}

		return recordedBlobPromise;
	}

	// Mixes the primary audio blob with imported AudioRegions using OfflineAudioContext.
	private async mixAudioRegions(
		primaryBlob: Blob | null,
		audioRegions: AudioRegion[],
		totalOutputDurationMs: number,
		primaryAudioVolume = 1.0,
	): Promise<Blob> {
		const sampleRate = 48000;
		const channels = 2;
		const totalSamples = Math.ceil((totalOutputDurationMs / 1000) * sampleRate);
		const offlineCtx = new OfflineAudioContext(channels, totalSamples, sampleRate);

		const decodeBlob = async (blob: Blob): Promise<AudioBuffer | null> => {
			const arrayBuffer = await blob.arrayBuffer();
			try {
				const decodeCtx = new AudioContext({ sampleRate });
				const buffer = await decodeCtx.decodeAudioData(arrayBuffer);
				await decodeCtx.close();
				return buffer;
			} catch {
				return null;
			}
		};

		const decodeUrl = async (url: string): Promise<AudioBuffer | null> => {
			try {
				const response = await fetch(url);
				const arrayBuffer = await response.arrayBuffer();
				const decodeCtx = new AudioContext({ sampleRate });
				const buffer = await decodeCtx.decodeAudioData(arrayBuffer);
				await decodeCtx.close();
				return buffer;
			} catch {
				return null;
			}
		};

		// Place primary audio at time 0
		if (primaryBlob) {
			const primaryBuffer = await decodeBlob(primaryBlob);
			if (primaryBuffer) {
				const primaryGain = offlineCtx.createGain();
				primaryGain.gain.value = Math.max(0, Math.min(1, primaryAudioVolume));
				primaryGain.connect(offlineCtx.destination);
				const source = offlineCtx.createBufferSource();
				source.buffer = primaryBuffer;
				source.connect(primaryGain);
				source.start(0);
			}
		}

		// Place each imported audio region
		for (const region of audioRegions) {
			if (this.cancelled) break;
			const fileUrl = region.sourcePath.startsWith("file://")
				? region.sourcePath
				: toFileUrl(region.sourcePath);
			const buffer = await decodeUrl(fileUrl);
			if (!buffer) continue;

			const gainNode = offlineCtx.createGain();
			gainNode.gain.value = Math.max(0, Math.min(1, region.volume));

			const startTimeSec = region.startMs / 1000;
			const endTimeSec = region.endMs / 1000;

			if (region.fadeInMs && region.fadeInMs > 0) {
				gainNode.gain.setValueAtTime(0, startTimeSec);
				gainNode.gain.linearRampToValueAtTime(region.volume, startTimeSec + region.fadeInMs / 1000);
			}
			if (region.fadeOutMs && region.fadeOutMs > 0) {
				gainNode.gain.setValueAtTime(region.volume, endTimeSec - region.fadeOutMs / 1000);
				gainNode.gain.linearRampToValueAtTime(0, endTimeSec);
			}

			let lastNode: AudioNode = gainNode;

			if (region.equalizer) {
				const eq = region.equalizer;

				const lowShelf = offlineCtx.createBiquadFilter();
				lowShelf.type = "lowshelf";
				lowShelf.frequency.value = 200;
				lowShelf.gain.value = eq.low;
				gainNode.connect(lowShelf);

				const peaking = offlineCtx.createBiquadFilter();
				peaking.type = "peaking";
				peaking.frequency.value = 1000;
				peaking.Q.value = 1;
				peaking.gain.value = eq.mid;
				lowShelf.connect(peaking);

				const highShelf = offlineCtx.createBiquadFilter();
				highShelf.type = "highshelf";
				highShelf.frequency.value = 4000;
				highShelf.gain.value = eq.high;
				peaking.connect(highShelf);

				lastNode = highShelf;
			}

			lastNode.connect(offlineCtx.destination);

			const source = offlineCtx.createBufferSource();
			source.buffer = buffer;
			source.connect(gainNode);

			const startOffsetSec = region.sourceOffsetMs / 1000;
			const durationSec = (region.endMs - region.startMs) / 1000;
			source.start(startTimeSec, startOffsetSec, durationSec);
		}

		const renderedBuffer = await offlineCtx.startRendering();

		// Convert AudioBuffer to WAV Blob
		const wavBlob = this.audioBufferToWavBlob(renderedBuffer);
		return wavBlob;
	}

	private audioBufferToWavBlob(buffer: AudioBuffer): Blob {
		const numChannels = buffer.numberOfChannels;
		const sampleRate = buffer.sampleRate;
		const numSamples = buffer.length;
		const bytesPerSample = 2; // 16-bit PCM
		const dataSize = numSamples * numChannels * bytesPerSample;
		const fileSize = 44 + dataSize;

		const arrayBuffer = new ArrayBuffer(fileSize);
		const view = new DataView(arrayBuffer);

		const writeStr = (offset: number, str: string) => {
			for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
		};

		writeStr(0, "RIFF");
		view.setUint32(4, fileSize - 8, true);
		writeStr(8, "WAVE");
		writeStr(12, "fmt ");
		view.setUint32(16, 16, true);
		view.setUint16(20, 1, true); // PCM
		view.setUint16(22, numChannels, true);
		view.setUint32(24, sampleRate, true);
		view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
		view.setUint16(32, numChannels * bytesPerSample, true);
		view.setUint16(34, 16, true);
		writeStr(36, "data");
		view.setUint32(40, dataSize, true);

		let offset = 44;
		for (let i = 0; i < numSamples; i++) {
			for (let ch = 0; ch < numChannels; ch++) {
				const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
				view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
				offset += 2;
			}
		}

		return new Blob([arrayBuffer], { type: "audio/wav" });
	}

	cancel(): void {
		this.cancelled = true;
	}
}
