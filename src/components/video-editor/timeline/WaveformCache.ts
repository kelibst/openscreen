const PEAKS_PER_SECOND = 200;

class WaveformCache {
	private cache = new Map<string, Float32Array>();
	private pending = new Map<string, Promise<Float32Array>>();

	get(sourcePath: string): Float32Array | null {
		return this.cache.get(sourcePath) ?? null;
	}

	async load(sourcePath: string, durationSec: number): Promise<Float32Array> {
		const existing = this.cache.get(sourcePath);
		if (existing) return existing;

		const inFlight = this.pending.get(sourcePath);
		if (inFlight) return inFlight;

		const promise = this.decode(sourcePath, durationSec).then((peaks) => {
			this.cache.set(sourcePath, peaks);
			this.pending.delete(sourcePath);
			return peaks;
		}).catch(() => {
			this.pending.delete(sourcePath);
			return new Float32Array(0);
		});

		this.pending.set(sourcePath, promise);
		return promise;
	}

	private async decode(sourcePath: string, durationSec: number): Promise<Float32Array> {
		const safeUrl = sourcePath.startsWith("file://")
			? sourcePath
			: `file://${encodeURIComponent(sourcePath).replace(/%2F/g, "/")}`;

		const response = await fetch(safeUrl);
		const arrayBuffer = await response.arrayBuffer();

		const totalPeaks = Math.max(1, Math.ceil(durationSec * PEAKS_PER_SECOND));
		const sampleRate = 22050;
		const totalSamples = Math.ceil(durationSec * sampleRate);

		const offlineCtx = new OfflineAudioContext(1, Math.max(1, totalSamples), sampleRate);
		const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);

		const channelData = audioBuffer.getChannelData(0);
		const peaks = new Float32Array(totalPeaks);
		const samplesPerPeak = Math.max(1, Math.floor(channelData.length / totalPeaks));

		for (let i = 0; i < totalPeaks; i++) {
			const start = i * samplesPerPeak;
			const end = Math.min(start + samplesPerPeak, channelData.length);
			let max = 0;
			for (let j = start; j < end; j++) {
				const abs = Math.abs(channelData[j]);
				if (abs > max) max = abs;
			}
			peaks[i] = max;
		}

		return peaks;
	}
}

export const waveformCache = new WaveformCache();
