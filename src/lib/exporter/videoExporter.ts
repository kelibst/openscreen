import type {
	AnnotationRegion,
	AudioRegion,
	ClipRegion,
	ColorGrading,
	CropRegion,
	SpeedRegion,
	TrimRegion,
	WebcamLayoutPreset,
	WebcamSizePreset,
	ZoomRegion,
} from "@/components/video-editor/types";
import { toFileUrl } from "@/components/video-editor/projectPersistence";
import { AsyncVideoFrameQueue } from "./asyncVideoFrameQueue";
import { AudioProcessor } from "./audioEncoder";
import { FrameRenderer } from "./frameRenderer";
import { VideoMuxer } from "./muxer";
import { StreamingVideoDecoder } from "./streamingDecoder";
import type { ExportConfig, ExportProgress, ExportResult } from "./types";

const ENCODER_STALL_TIMEOUT_MS = 15_000;
const ENCODER_FLUSH_TIMEOUT_MS = 20_000;

interface VideoExporterConfig extends ExportConfig {
	videoUrl: string;
	webcamVideoUrl?: string;
	wallpaper: string;
	zoomRegions: ZoomRegion[];
	trimRegions?: TrimRegion[];
	speedRegions?: SpeedRegion[];
	showShadow: boolean;
	shadowIntensity: number;
	showBlur: boolean;
	motionBlurAmount?: number;
	borderRadius?: number;
	padding?: number;
	videoPadding?: number;
	cropRegion: CropRegion;
	webcamLayoutPreset?: WebcamLayoutPreset;
	webcamMaskShape?: import("@/components/video-editor/types").WebcamMaskShape;
	webcamSizePreset?: WebcamSizePreset;
	webcamPosition?: { cx: number; cy: number } | null;
	annotationRegions?: AnnotationRegion[];
	audioRegions?: AudioRegion[];
	clipRegions?: ClipRegion[];
	colorGrading?: ColorGrading;
	primaryAudioVolume?: number;
	primaryAudioMuted?: boolean;
	previewWidth?: number;
	previewHeight?: number;
	cursorTelemetry?: import("@/components/video-editor/types").CursorTelemetryPoint[];
	onProgress?: (progress: ExportProgress) => void;
	format?: string;
}

export class VideoExporter {
	private config: VideoExporterConfig;
	private streamingDecoder: StreamingVideoDecoder | null = null;
	private renderer: FrameRenderer | null = null;
	private encoder: VideoEncoder | null = null;
	private muxer: VideoMuxer | null = null;
	private audioProcessor: AudioProcessor | null = null;
	private webcamDecoder: StreamingVideoDecoder | null = null;
	private cancelled = false;
	private encodeQueue = 0;
	// Keep a smaller queue for software encoding so Windows does not balloon memory.
	private readonly MAX_ENCODE_QUEUE = 120;
	private videoDescription: Uint8Array | undefined;
	private videoColorSpace: VideoColorSpaceInit | undefined;
	private muxingPromises: Promise<void>[] = [];
	private chunkCount = 0;
	private lastEncoderOutputAt = 0;
	private fatalEncoderError: Error | null = null;

	constructor(config: VideoExporterConfig) {
		this.config = config;
	}

	async export(): Promise<ExportResult> {
		const encoderPreferences = this.getEncoderPreferences();
		let lastError: Error | null = null;

		for (const encoderPreference of encoderPreferences) {
			try {
				return await this.exportWithEncoderPreference(encoderPreference);
			} catch (error) {
				const normalizedError = error instanceof Error ? error : new Error(String(error));
				lastError = normalizedError;

				if (this.cancelled) {
					return { success: false, error: "Export cancelled" };
				}

				if (encoderPreferences.length > 1) {
					console.warn(
						`[VideoExporter] ${encoderPreference} export attempt failed:`,
						normalizedError,
					);
				}
			} finally {
				this.cleanup();
			}
		}

		return {
			success: false,
			error: lastError?.message || "Export failed",
		};
	}

	private async exportWithEncoderPreference(
		encoderPreference: HardwareAcceleration,
	): Promise<ExportResult> {
		const sortedClips = this.config.clipRegions
			? [...this.config.clipRegions].sort((a, b) => a.startMs - b.startMs)
			: [];
		if (sortedClips.length > 0) {
			return this.exportWithClips(encoderPreference, sortedClips);
		}

		let webcamFrameQueue: AsyncVideoFrameQueue | null = null;
		let stopWebcamDecode = false;
		let webcamDecodeError: Error | null = null;
		let webcamDecodePromise: Promise<void> | null = null;
		let webcamDecoder: StreamingVideoDecoder | null = null;

		this.cleanup();
		this.cancelled = false;
		this.fatalEncoderError = null;

		try {
			const streamingDecoder = new StreamingVideoDecoder();
			this.streamingDecoder = streamingDecoder;
			const videoInfo = await streamingDecoder.loadMetadata(this.config.videoUrl);
			let webcamInfo: Awaited<ReturnType<StreamingVideoDecoder["loadMetadata"]>> | null = null;
			if (this.config.webcamVideoUrl) {
				webcamDecoder = new StreamingVideoDecoder();
				this.webcamDecoder = webcamDecoder;
				webcamInfo = await webcamDecoder.loadMetadata(this.config.webcamVideoUrl);
			}

			const renderer = new FrameRenderer({
				width: this.config.width,
				height: this.config.height,
				wallpaper: this.config.wallpaper,
				zoomRegions: this.config.zoomRegions,
				showShadow: this.config.showShadow,
				shadowIntensity: this.config.shadowIntensity,
				showBlur: this.config.showBlur,
				motionBlurAmount: this.config.motionBlurAmount,
				borderRadius: this.config.borderRadius,
				padding: this.config.padding,
				cropRegion: this.config.cropRegion,
				videoWidth: videoInfo.width,
				videoHeight: videoInfo.height,
				webcamSize: webcamInfo ? { width: webcamInfo.width, height: webcamInfo.height } : null,
				webcamLayoutPreset: this.config.webcamLayoutPreset,
				webcamMaskShape: this.config.webcamMaskShape,
				webcamSizePreset: this.config.webcamSizePreset,
				webcamPosition: this.config.webcamPosition,
				annotationRegions: this.config.annotationRegions,
				speedRegions: this.config.speedRegions,
				previewWidth: this.config.previewWidth,
				previewHeight: this.config.previewHeight,
				cursorTelemetry: this.config.cursorTelemetry,
				colorGrading: this.config.colorGrading,
			});
			this.renderer = renderer;
			await renderer.initialize();

			await this.initializeEncoder(encoderPreference);

			const hasAudio = videoInfo.hasAudio;
			const muxer = new VideoMuxer(this.config, hasAudio);
			this.muxer = muxer;
			await muxer.initialize();

			const { effectiveDuration, totalFrames } = streamingDecoder.getExportMetrics(
				this.config.frameRate,
				this.config.trimRegions,
				this.config.speedRegions,
			);
			const readEndSec = Math.max(videoInfo.duration, videoInfo.streamDuration ?? 0) + 0.5;

			console.log("[VideoExporter] Original duration:", videoInfo.duration, "s");
			console.log("[VideoExporter] Effective duration:", effectiveDuration, "s");
			console.log("[VideoExporter] Total frames to export:", totalFrames);
			console.log("[VideoExporter] Using streaming decode (web-demuxer + VideoDecoder)");

			const frameDuration = 1_000_000 / this.config.frameRate;
			let frameIndex = 0;
			const maxEncodeQueue =
				encoderPreference === "prefer-software"
					? Math.min(this.MAX_ENCODE_QUEUE, 32)
					: this.MAX_ENCODE_QUEUE;

			webcamFrameQueue = this.config.webcamVideoUrl ? new AsyncVideoFrameQueue() : null;
			webcamDecodePromise =
				webcamDecoder && webcamFrameQueue
					? (() => {
							const queue = webcamFrameQueue;
							return webcamDecoder
								.decodeAll(
									this.config.frameRate,
									this.config.trimRegions,
									this.config.speedRegions,
									async (webcamFrame) => {
										while (queue.length >= 12 && !this.cancelled && !stopWebcamDecode) {
											await new Promise((resolve) => setTimeout(resolve, 2));
										}
										if (this.cancelled || stopWebcamDecode) {
											webcamFrame.close();
											return;
										}
										queue.enqueue(webcamFrame);
									},
								)
								.catch((error) => {
									webcamDecodeError = error instanceof Error ? error : new Error(String(error));
									throw webcamDecodeError;
								})
								.finally(() => {
									if (webcamDecodeError) {
										queue.fail(webcamDecodeError);
									} else {
										queue.close();
									}
								});
						})()
					: null;

			await streamingDecoder.decodeAll(
				this.config.frameRate,
				this.config.trimRegions,
				this.config.speedRegions,
				async (videoFrame, _exportTimestampUs, sourceTimestampMs) => {
					let webcamFrame: VideoFrame | null = null;
					try {
						if (this.cancelled) {
							return;
						}

						if (this.fatalEncoderError) {
							throw this.fatalEncoderError;
						}

						const timestamp = frameIndex * frameDuration;
						webcamFrame = webcamFrameQueue ? await webcamFrameQueue.dequeue() : null;
						if (this.cancelled) {
							return;
						}

						const sourceTimestampUs = sourceTimestampMs * 1000;
						await renderer.renderFrame(videoFrame, sourceTimestampUs, webcamFrame);

						const canvas = renderer.getCanvas();

						// Read raw pixels from the canvas instead of passing
						// the canvas directly to VideoFrame. On some Linux
						// systems the GPU shared-image path (EGL/Ozone) fails
						// silently, producing empty frames.
						const canvasCtx = canvas.getContext("2d")!;
						const imageData = canvasCtx.getImageData(0, 0, canvas.width, canvas.height);
						const exportFrame = new VideoFrame(imageData.data.buffer, {
							format: "RGBA",
							codedWidth: canvas.width,
							codedHeight: canvas.height,
							timestamp,
							duration: frameDuration,
							colorSpace: {
								primaries: "bt709",
								transfer: "iec61966-2-1",
								matrix: "rgb",
								fullRange: true,
							},
						});

						while (
							this.encoder &&
							this.encoder.encodeQueueSize >= maxEncodeQueue &&
							!this.cancelled
						) {
							if (Date.now() - this.lastEncoderOutputAt > ENCODER_STALL_TIMEOUT_MS) {
								exportFrame.close();
								throw new Error(
									encoderPreference === "prefer-hardware"
										? "The hardware video encoder stopped responding. Retrying with a safer encoder."
										: "The video encoder stopped responding during export.",
								);
							}
							await new Promise((resolve) => setTimeout(resolve, 5));
						}

						if (this.encoder && this.encoder.state === "configured") {
							this.encodeQueue++;
							this.encoder.encode(exportFrame, { keyFrame: frameIndex % 150 === 0 });
						} else {
							console.warn(
								`[Frame ${frameIndex}] Encoder not ready! State: ${this.encoder?.state}`,
							);
						}

						exportFrame.close();
						frameIndex++;

						this.reportProgress({
							currentFrame: frameIndex,
							totalFrames,
							percentage: (frameIndex / totalFrames) * 100,
							estimatedTimeRemaining: 0,
						});
					} finally {
						videoFrame.close();
						webcamFrame?.close();
					}
				},
			);

			if (this.cancelled) {
				return { success: false, error: "Export cancelled" };
			}

			if (this.fatalEncoderError) {
				throw this.fatalEncoderError;
			}

			stopWebcamDecode = true;
			webcamFrameQueue?.destroy();
			webcamDecoder?.cancel();
			await webcamDecodePromise;

			if (this.encoder && this.encoder.state === "configured") {
				await this.withTimeout(
					this.encoder.flush(),
					ENCODER_FLUSH_TIMEOUT_MS,
					encoderPreference === "prefer-hardware"
						? "The hardware video encoder stopped responding while finalizing the export."
						: "The video encoder stopped responding while finalizing the export.",
				);
			}

			if (this.fatalEncoderError) {
				throw this.fatalEncoderError;
			}

			await Promise.all(this.muxingPromises);

			this.reportProgress({
				currentFrame: totalFrames,
				totalFrames,
				percentage: 100,
				estimatedTimeRemaining: 0,
				phase: "finalizing",
			});

			if (hasAudio && !this.cancelled) {
				const demuxer = streamingDecoder.getDemuxer();
				if (demuxer) {
					console.log("[VideoExporter] Processing audio track...");
					this.audioProcessor = new AudioProcessor();
					await this.audioProcessor.process(
						demuxer,
						muxer,
						this.config.videoUrl,
						this.config.trimRegions,
						this.config.speedRegions,
						readEndSec,
						this.config.audioRegions,
						readEndSec !== undefined ? readEndSec * 1000 : undefined,
						this.config.primaryAudioVolume,
						this.config.primaryAudioMuted,
					);
				}
			}

			const blob = await muxer.finalize();
			return { success: true, blob };
		} finally {
			stopWebcamDecode = true;
			webcamFrameQueue?.destroy();
			webcamDecoder?.cancel();
			if (webcamDecodePromise) {
				await webcamDecodePromise.catch(() => undefined);
			}
		}
	}

	private async exportWithClips(
		encoderPreference: HardwareAcceleration,
		sortedClips: ClipRegion[],
	): Promise<ExportResult> {
		this.cleanup();
		this.cancelled = false;
		this.fatalEncoderError = null;

		try {
			// Load metadata for all clips to compute total frame count and get primary info
			const clipDecoders: StreamingVideoDecoder[] = [];
			const clipMetas: Awaited<ReturnType<StreamingVideoDecoder["loadMetadata"]>>[] = [];
			for (const clip of sortedClips) {
				const clipUrl = clip.sourcePath.startsWith("file://")
					? clip.sourcePath
					: toFileUrl(clip.sourcePath);
				const decoder = new StreamingVideoDecoder();
				const meta = await decoder.loadMetadata(clipUrl);
				clipDecoders.push(decoder);
				clipMetas.push(meta);
			}

			const primaryMeta = clipMetas[0];
			const frameDuration = 1_000_000 / this.config.frameRate;

			// Compute total frames across all clips
			let totalFrames = 0;
			for (let i = 0; i < sortedClips.length; i++) {
				const clip = sortedClips[i];
				const clipDurationMs = clip.endMs - clip.startMs;
				totalFrames += Math.ceil((clipDurationMs / 1000) * this.config.frameRate);
			}

			const renderer = new FrameRenderer({
				width: this.config.width,
				height: this.config.height,
				wallpaper: this.config.wallpaper,
				zoomRegions: this.config.zoomRegions,
				showShadow: this.config.showShadow,
				shadowIntensity: this.config.shadowIntensity,
				showBlur: this.config.showBlur,
				motionBlurAmount: this.config.motionBlurAmount,
				borderRadius: this.config.borderRadius,
				padding: this.config.padding,
				cropRegion: this.config.cropRegion,
				videoWidth: primaryMeta.width,
				videoHeight: primaryMeta.height,
				webcamSize: null,
				webcamLayoutPreset: this.config.webcamLayoutPreset,
				webcamMaskShape: this.config.webcamMaskShape,
				webcamSizePreset: this.config.webcamSizePreset,
				webcamPosition: this.config.webcamPosition,
				annotationRegions: this.config.annotationRegions,
				speedRegions: this.config.speedRegions,
				previewWidth: this.config.previewWidth,
				previewHeight: this.config.previewHeight,
				cursorTelemetry: this.config.cursorTelemetry,
				colorGrading: this.config.colorGrading,
			});
			this.renderer = renderer;
			await renderer.initialize();

			await this.initializeEncoder(encoderPreference);

			const hasAudio = primaryMeta.hasAudio;
			const totalOutputDurationMs = sortedClips[sortedClips.length - 1].endMs;
			const muxer = new VideoMuxer(this.config, hasAudio);
			this.muxer = muxer;
			await muxer.initialize();

			const maxEncodeQueue =
				encoderPreference === "prefer-software"
					? Math.min(this.MAX_ENCODE_QUEUE, 32)
					: this.MAX_ENCODE_QUEUE;

			let frameIndex = 0;
			// Buffered rendered frames (as ImageData) from the tail of the previous clip,
			// used to supply the outgoing frame during a transition window.
			let prevClipTailFrames: ImageData[] = [];

			for (let clipIdx = 0; clipIdx < sortedClips.length; clipIdx++) {
				if (this.cancelled) break;
				const clip = sortedClips[clipIdx];
				const clipDecoder = clipDecoders[clipIdx];
				const clipDurationMs = clip.endMs - clip.startMs;

				// Determine if this clip has a non-cut transition and how many frames that spans
				const hasTransition =
					clipIdx > 0 &&
					clip.transitionIn &&
					clip.transitionIn !== "cut" &&
					(clip.transitionInDurationMs ?? 0) > 0;
				const transitionFrameCount = hasTransition
					? Math.ceil(((clip.transitionInDurationMs ?? 0) / 1000) * this.config.frameRate)
					: 0;

				// If the NEXT clip has a transition, we need to buffer its tail frames during this clip.
				const nextClip = sortedClips[clipIdx + 1];
				const nextHasTransition =
					nextClip &&
					nextClip.transitionIn &&
					nextClip.transitionIn !== "cut" &&
					(nextClip.transitionInDurationMs ?? 0) > 0;
				const nextTransitionFrameCount = nextHasTransition
					? Math.ceil(((nextClip.transitionInDurationMs ?? 0) / 1000) * this.config.frameRate)
					: 0;

				// Build trim regions that exclude everything outside [sourceOffsetMs, sourceOffsetMs + clipDurationMs].
				// TrimRegion means "skip this range", so we skip the prefix and the suffix.
				const clipTrimRegions: TrimRegion[] = [];
				if (clip.sourceOffsetMs > 0) {
					clipTrimRegions.push({
						id: `clip-${clipIdx}-prefix`,
						startMs: 0,
						endMs: clip.sourceOffsetMs,
					});
				}
				clipTrimRegions.push({
					id: `clip-${clipIdx}-suffix`,
					startMs: clip.sourceOffsetMs + clipDurationMs,
					endMs: Number.MAX_SAFE_INTEGER,
				});

				let localFrameIndex = 0;
				const clipTotalFrames = Math.ceil((clipDurationMs / 1000) * this.config.frameRate);
				// Rolling buffer of rendered ImageData for the tail of this clip (used by next clip's transition)
				const tailBuffer: ImageData[] = [];
				// Snapshot of previous clip's tail to use during this clip's transition
				const outgoingTailFrames = prevClipTailFrames;

				const MAX_LOOP_ITERATIONS = 100;
				let loopIteration = 0;
				let loopDecoder: StreamingVideoDecoder = clipDecoder;

				do {
					if (loopIteration > 0) {
						// For subsequent loop iterations, create a fresh decoder from the same URL
						const clipUrl = clip.sourcePath.startsWith("file://")
							? clip.sourcePath
							: toFileUrl(clip.sourcePath);
						loopDecoder = new StreamingVideoDecoder();
						await loopDecoder.loadMetadata(clipUrl);
					}

				await loopDecoder.decodeAll(
					this.config.frameRate,
					clipTrimRegions,
					undefined,
					async (videoFrame, _exportTimestampUs, _sourceTimestampMs) => {
						try {
							if (this.cancelled) return;
							if (this.fatalEncoderError) throw this.fatalEncoderError;
							if (localFrameIndex >= clipTotalFrames) {
								videoFrame.close();
								return;
							}

							// Place this frame at its correct position in the output timeline
							const outputTimestamp =
								clip.startMs * 1000 + localFrameIndex * frameDuration;

							// Determine if we are inside this clip's transition window
							const inTransitionWindow =
								hasTransition &&
								localFrameIndex < transitionFrameCount &&
								outgoingTailFrames.length > 0;

							if (inTransitionWindow) {
								// Map localFrameIndex into the tail buffer from the previous clip.
								// tailBuffer was filled from the end of the previous clip; index 0 = earliest tail frame.
								const tailOffset = outgoingTailFrames.length - transitionFrameCount;
								const tailIdx = Math.max(0, tailOffset) + localFrameIndex;
								const outgoingImageData = outgoingTailFrames[Math.min(tailIdx, outgoingTailFrames.length - 1)];

								const transitionProgress = localFrameIndex / transitionFrameCount;

								// Build a VideoFrame from the outgoing ImageData so we can pass it to the renderer
								const outgoingFrame = new VideoFrame(outgoingImageData.data.buffer, {
									format: "RGBA",
									codedWidth: outgoingImageData.width,
									codedHeight: outgoingImageData.height,
									timestamp: outputTimestamp,
									duration: frameDuration,
									colorSpace: {
										primaries: "bt709",
										transfer: "iec61966-2-1",
										matrix: "rgb",
										fullRange: true,
									},
								});

								try {
									await renderer.renderTransitionFrame(
										outgoingFrame,
										videoFrame,
										outputTimestamp,
										clip.transitionIn!,
										transitionProgress,
									);
								} finally {
									outgoingFrame.close();
								}
							} else {
								await renderer.renderFrame(videoFrame, outputTimestamp, null);
							}

							const canvas = renderer.getCanvas();
							const canvasCtx = canvas.getContext("2d")!;
							const imageData = canvasCtx.getImageData(0, 0, canvas.width, canvas.height);

							// Buffer the tail frames of this clip for the next clip's transition
							if (nextHasTransition) {
								const firstTailFrameIndex = clipTotalFrames - nextTransitionFrameCount;
								if (localFrameIndex >= firstTailFrameIndex) {
									tailBuffer.push(imageData);
								}
							}

							const exportFrame = new VideoFrame(imageData.data.buffer, {
								format: "RGBA",
								codedWidth: canvas.width,
								codedHeight: canvas.height,
								timestamp: outputTimestamp,
								duration: frameDuration,
								colorSpace: {
									primaries: "bt709",
									transfer: "iec61966-2-1",
									matrix: "rgb",
									fullRange: true,
								},
							});

							while (
								this.encoder &&
								this.encoder.encodeQueueSize >= maxEncodeQueue &&
								!this.cancelled
							) {
								if (Date.now() - this.lastEncoderOutputAt > ENCODER_STALL_TIMEOUT_MS) {
									exportFrame.close();
									throw new Error("The video encoder stopped responding during export.");
								}
								await new Promise((resolve) => setTimeout(resolve, 5));
							}

							if (this.encoder && this.encoder.state === "configured") {
								this.encodeQueue++;
								this.encoder.encode(exportFrame, {
									keyFrame: frameIndex % 150 === 0,
								});
							}

							exportFrame.close();
							localFrameIndex++;
							frameIndex++;

							this.reportProgress({
								currentFrame: frameIndex,
								totalFrames,
								percentage: (frameIndex / totalFrames) * 100,
								estimatedTimeRemaining: 0,
							});
						} finally {
							videoFrame.close();
						}
					},
				);

				if (loopIteration > 0) {
					try { loopDecoder.destroy(); } catch { /* no-op */ }
				}
				loopIteration++;
				} while (clip.loop && localFrameIndex < clipTotalFrames && loopIteration < MAX_LOOP_ITERATIONS && !this.cancelled);

				// Save tail frames from this clip so the next clip's transition can use them
				prevClipTailFrames = tailBuffer;
			}

			if (this.cancelled) return { success: false, error: "Export cancelled" };
			if (this.fatalEncoderError) throw this.fatalEncoderError;

			if (this.encoder && this.encoder.state === "configured") {
				await this.withTimeout(
					this.encoder.flush(),
					ENCODER_FLUSH_TIMEOUT_MS,
					"The video encoder stopped responding while finalizing the export.",
				);
			}

			if (this.fatalEncoderError) throw this.fatalEncoderError;

			await Promise.all(this.muxingPromises);

			this.reportProgress({
				currentFrame: totalFrames,
				totalFrames,
				percentage: 100,
				estimatedTimeRemaining: 0,
				phase: "finalizing",
			});

			// Process audio from primary clip + any external AudioRegions
			if (hasAudio && !this.cancelled) {
				const demuxer = clipDecoders[0].getDemuxer();
				if (demuxer) {
					this.audioProcessor = new AudioProcessor();
					const primaryClipMuted = sortedClips[0].audioMuted === true;
					await this.audioProcessor.process(
						demuxer,
						muxer,
						sortedClips[0].sourcePath.startsWith("file://")
							? sortedClips[0].sourcePath
							: toFileUrl(sortedClips[0].sourcePath),
						undefined,
						undefined,
						undefined,
						this.config.audioRegions,
						totalOutputDurationMs,
						this.config.primaryAudioVolume,
						(this.config.primaryAudioMuted ?? false) || primaryClipMuted,
					);
				}
			}

			const blob = await muxer.finalize();
			return { success: true, blob };
		} finally {
			// nothing to clean up here beyond what cleanup() handles
		}
	}

	private async initializeEncoder(hardwareAcceleration: HardwareAcceleration): Promise<void> {
		this.encodeQueue = 0;
		this.muxingPromises = [];
		this.chunkCount = 0;
		this.lastEncoderOutputAt = Date.now();
		this.fatalEncoderError = null;
		let videoDescription: Uint8Array | undefined;

		this.encoder = new VideoEncoder({
			output: (chunk, meta) => {
				this.lastEncoderOutputAt = Date.now();

				if (meta?.decoderConfig?.description && !videoDescription) {
					const desc = meta.decoderConfig.description;
					if (desc instanceof ArrayBuffer || desc instanceof SharedArrayBuffer) {
						videoDescription = new Uint8Array(desc);
					} else if (ArrayBuffer.isView(desc)) {
						videoDescription = new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength);
					}
					this.videoDescription = videoDescription;
				}

				if (meta?.decoderConfig?.colorSpace && !this.videoColorSpace) {
					this.videoColorSpace = meta.decoderConfig.colorSpace;
				}

				const isFirstChunk = this.chunkCount === 0;
				this.chunkCount++;

				const muxingPromise = (async () => {
					try {
						if (isFirstChunk && this.videoDescription) {
							const colorSpace = this.videoColorSpace || {
								primaries: "bt709",
								transfer: "iec61966-2-1",
								matrix: "rgb",
								fullRange: true,
							};

							const metadata: EncodedVideoChunkMetadata = {
								decoderConfig: {
									codec: this.config.codec || "avc1.640033",
									codedWidth: this.config.width,
									codedHeight: this.config.height,
									description: this.videoDescription,
									colorSpace,
								},
							};

							await this.muxer!.addVideoChunk(chunk, metadata);
						} else {
							await this.muxer!.addVideoChunk(chunk, meta);
						}
					} catch (error) {
						console.error("Muxing error:", error);
					}
				})();

				this.muxingPromises.push(muxingPromise);
				this.encodeQueue--;
			},
			error: (error) => {
				console.error("[VideoExporter] Encoder error:", error);
				this.fatalEncoderError =
					error instanceof Error ? error : new Error(`Video encoder error: ${String(error)}`);
				this.streamingDecoder?.cancel();
				this.webcamDecoder?.cancel();
			},
		});

		const encoderConfig: VideoEncoderConfig = {
			codec: this.config.codec || "avc1.640033",
			width: this.config.width,
			height: this.config.height,
			bitrate: this.config.bitrate,
			framerate: this.config.frameRate,
			latencyMode: "quality",
			bitrateMode: "variable",
			hardwareAcceleration,
		};

		const support = await VideoEncoder.isConfigSupported(encoderConfig);
		if (!support.supported) {
			throw new Error(
				hardwareAcceleration === "prefer-hardware"
					? "Hardware video encoding is not supported on this system."
					: "Software video encoding is not supported on this system.",
			);
		}

		console.log(
			`[VideoExporter] Using ${hardwareAcceleration === "prefer-hardware" ? "hardware" : "software"} acceleration`,
		);
		this.encoder.configure(encoderConfig);
	}

	cancel(): void {
		this.cancelled = true;
		if (this.streamingDecoder) {
			this.streamingDecoder.cancel();
		}
		if (this.webcamDecoder) {
			this.webcamDecoder.cancel();
		}
		if (this.audioProcessor) {
			this.audioProcessor.cancel();
		}
		this.cleanup();
	}

	private cleanup(): void {
		if (this.encoder) {
			try {
				if (this.encoder.state === "configured") {
					this.encoder.close();
				}
			} catch (e) {
				console.warn("Error closing encoder:", e);
			}
			this.encoder = null;
		}

		if (this.streamingDecoder) {
			try {
				this.streamingDecoder.destroy();
			} catch (e) {
				console.warn("Error destroying streaming decoder:", e);
			}
			this.streamingDecoder = null;
		}

		if (this.webcamDecoder) {
			try {
				this.webcamDecoder.destroy();
			} catch (e) {
				console.warn("Error destroying webcam decoder:", e);
			}
			this.webcamDecoder = null;
		}

		if (this.renderer) {
			try {
				this.renderer.destroy();
			} catch (e) {
				console.warn("Error destroying renderer:", e);
			}
			this.renderer = null;
		}

		this.audioProcessor = null;
		this.muxer = null;
		this.encodeQueue = 0;
		this.muxingPromises = [];
		this.chunkCount = 0;
		this.videoDescription = undefined;
		this.videoColorSpace = undefined;
		this.lastEncoderOutputAt = 0;
		this.fatalEncoderError = null;
	}

	private getEncoderPreferences(): HardwareAcceleration[] {
		if (typeof navigator !== "undefined" && /\bWindows\b/i.test(navigator.userAgent)) {
			return ["prefer-software", "prefer-hardware"];
		}
		return ["prefer-hardware", "prefer-software"];
	}

	private reportProgress(progress: ExportProgress): void {
		this.config.onProgress?.(progress);
	}

	private withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
			promise.then(
				(value) => {
					window.clearTimeout(timer);
					resolve(value);
				},
				(error) => {
					window.clearTimeout(timer);
					reject(error);
				},
			);
		});
	}
}
