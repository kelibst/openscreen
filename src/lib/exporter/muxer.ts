import {
	BufferTarget,
	EncodedAudioPacketSource,
	EncodedPacket,
	EncodedVideoPacketSource,
	Mp4OutputFormat,
	Output,
	WebMOutputFormat,
} from "mediabunny";
import type { ExportConfig } from "./types";

export class VideoMuxer {
	private output: Output | null = null;
	private videoSource: EncodedVideoPacketSource | null = null;
	private audioSource: EncodedAudioPacketSource | null = null;
	private hasAudio: boolean;
	private target: BufferTarget | null = null;
	private config: ExportConfig;
	private isWebM: boolean;

	constructor(config: ExportConfig, hasAudio = false) {
		this.config = config;
		this.hasAudio = hasAudio;
		this.isWebM = (config as { format?: string }).format === "webm";
	}

	async initialize(): Promise<void> {
		this.target = new BufferTarget();

		this.output = new Output({
			format: this.isWebM
				? new WebMOutputFormat()
				: new Mp4OutputFormat({ fastStart: "in-memory" }),
			target: this.target,
		});

		// VP9 for WebM, AVC for MP4
		const videoCodec = this.isWebM ? "vp9" : "avc";
		this.videoSource = new EncodedVideoPacketSource(videoCodec as "avc");
		this.output.addVideoTrack(this.videoSource, {
			frameRate: this.config.frameRate,
		});

		if (this.hasAudio) {
			this.audioSource = new EncodedAudioPacketSource("opus");
			this.output.addAudioTrack(this.audioSource);
		}

		await this.output.start();
	}

	async addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): Promise<void> {
		if (!this.videoSource) {
			throw new Error("Muxer not initialized");
		}

		// Convert WebCodecs chunk to Mediabunny packet
		const packet = EncodedPacket.fromEncodedChunk(chunk);

		// Add metadata with the first chunk
		await this.videoSource.add(packet, meta);
	}

	async addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): Promise<void> {
		if (!this.audioSource) {
			throw new Error("Audio not configured for this muxer");
		}

		// Convert WebCodecs chunk to Mediabunny packet
		const packet = EncodedPacket.fromEncodedChunk(chunk);

		// Add metadata with the first chunk
		await this.audioSource.add(packet, meta);
	}

	async finalize(): Promise<Blob> {
		if (!this.output || !this.target) {
			throw new Error("Muxer not initialized");
		}

		await this.output.finalize();
		const buffer = this.target.buffer;

		if (!buffer) {
			throw new Error("Failed to finalize output");
		}

		return new Blob([buffer], { type: this.isWebM ? "video/webm" : "video/mp4" });
	}
}
