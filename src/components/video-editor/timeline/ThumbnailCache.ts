class ThumbnailCache {
	private cache = new Map<string, string[]>();
	private pending = new Map<string, Promise<string[]>>();

	get(sourcePath: string, index: number): string | null {
		const frames = this.cache.get(sourcePath);
		if (!frames) return null;
		return frames[index] ?? null;
	}

	async load(sourcePath: string, count: number): Promise<string[]> {
		const existing = this.cache.get(sourcePath);
		if (existing) return existing;

		const inFlight = this.pending.get(sourcePath);
		if (inFlight) return inFlight;

		const promise = this.extract(sourcePath, count).then((frames) => {
			this.cache.set(sourcePath, frames);
			this.pending.delete(sourcePath);
			return frames;
		}).catch(() => {
			this.pending.delete(sourcePath);
			return [] as string[];
		});

		this.pending.set(sourcePath, promise);
		return promise;
	}

	private async extract(sourcePath: string, count: number): Promise<string[]> {
		if (!window.electronAPI || typeof (window.electronAPI as Record<string, unknown>).extractThumbnails !== "function") {
			return [];
		}

		const result = await (window.electronAPI as unknown as {
			extractThumbnails: (args: { sourcePath: string; count: number }) => Promise<{ success: boolean; frames?: string[]; error?: string }>;
		}).extractThumbnails({ sourcePath, count });

		if (result.success && Array.isArray(result.frames)) {
			return result.frames;
		}
		return [];
	}
}

export const thumbnailCache = new ThumbnailCache();
