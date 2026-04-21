import { useCallback } from "react";
import type { Span } from "dnd-timeline";
import type { EditorState } from "@/hooks/useEditorHistory";
import {
	type AnnotationRegion,
	type AudioRegion,
	type ClipRegion,
	type SpeedRegion,
	type TrimRegion,
	type ZoomRegion,
	type ZoomFocus,
	type ZoomFocusMode,
	type ZoomDepth,
	type PlaybackSpeed,
	type TransitionType,
	clampFocusToDepth,
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
	DEFAULT_AUDIO_VOLUME,
	DEFAULT_BLUR_DATA,
	DEFAULT_PLAYBACK_SPEED,
	DEFAULT_ZOOM_DEPTH,
} from "../types";

interface UseRegionHandlersParams {
	pushState: (update: Partial<EditorState> | ((prev: EditorState) => Partial<EditorState>)) => void;
	updateState: (update: Partial<EditorState> | ((prev: EditorState) => Partial<EditorState>)) => void;
	// Selection state
	selectedZoomId: string | null;
	setSelectedZoomId: (v: string | null) => void;
	selectedTrimId: string | null;
	setSelectedTrimId: (v: string | null) => void;
	selectedSpeedId: string | null;
	setSelectedSpeedId: (v: string | null) => void;
	selectedAnnotationId: string | null;
	setSelectedAnnotationId: (v: string | null) => void;
	selectedBlurId: string | null;
	setSelectedBlurId: (v: string | null) => void;
	selectedAudioId: string | null;
	setSelectedAudioId: (v: string | null) => void;
	selectedClipId: string | null;
	setSelectedClipId: (v: string | null) => void;
	// ID refs
	nextZoomIdRef: React.MutableRefObject<number>;
	nextTrimIdRef: React.MutableRefObject<number>;
	nextSpeedIdRef: React.MutableRefObject<number>;
	nextAnnotationIdRef: React.MutableRefObject<number>;
	nextAnnotationZIndexRef: React.MutableRefObject<number>;
	nextAudioIdRef: React.MutableRefObject<number>;
	nextClipIdRef: React.MutableRefObject<number>;
	currentTimeRef: React.MutableRefObject<number>;
}

export interface UseRegionHandlersResult {
	handleSelectZoom: (id: string | null) => void;
	handleSelectTrim: (id: string | null) => void;
	handleSelectAnnotation: (id: string | null) => void;
	handleSelectBlur: (id: string | null) => void;
	handleSelectSpeed: (id: string | null) => void;
	handleSelectAudio: (id: string | null) => void;
	handleSelectClip: (id: string | null) => void;
	handleZoomAdded: (span: Span) => void;
	handleZoomSuggested: (span: Span, focus: ZoomFocus) => void;
	handleTrimAdded: (span: Span) => void;
	handleZoomSpanChange: (id: string, span: Span) => void;
	handleTrimSpanChange: (id: string, span: Span) => void;
	handleZoomFocusChange: (id: string, focus: ZoomFocus) => void;
	handleZoomDepthChange: (depth: ZoomDepth) => void;
	handleZoomFocusModeChange: (focusMode: ZoomFocusMode) => void;
	handleZoomDelete: (id: string) => void;
	handleTrimDelete: (id: string) => void;
	handleSpeedAdded: (span: Span) => void;
	handleSpeedSpanChange: (id: string, span: Span) => void;
	handleSpeedDelete: (id: string) => void;
	handleSpeedChange: (speed: PlaybackSpeed) => void;
	handleAudioAdded: (_span: Span, sourcePath: string, label: string) => void;
	handleAudioSpanChange: (id: string, span: Span) => void;
	handleAudioDelete: (id: string) => void;
	handleAudioVolumeChange: (id: string, volume: number) => void;
	handleAudioLabelChange: (id: string, label: string) => void;
	handleAudioEqualizerChange: (id: string, equalizer: import("../types").AudioEqualizer) => void;
	handleAudioFadeChange: (id: string, fadeInMs: number, fadeOutMs: number) => void;
	handleClipAdded: (_span: Span, sourcePath: string, label: string) => void;
	handleClipSpanChange: (id: string, span: Span) => void;
	handleClipDelete: (id: string) => void;
	handleClipLabelChange: (id: string, label: string) => void;
	handleClipTransitionChange: (id: string, transition: TransitionType, durationMs: number) => void;
	handleClipUpdate: (id: string, patch: Partial<ClipRegion>) => void;
	handleExtractAudio: (outputPath: string, startMs: number, sourceOffsetMs: number) => void;
	splitRegionAtPlayhead: () => void;
	handleImageAdded: (sourcePath: string) => Promise<void>;
	handleAnnotationAdded: (span: Span) => void;
	handleBlurAdded: (span: Span) => void;
	handleZoomDurationChange: (id: string, zoomIn: number, zoomOut: number) => void;
	handleAnnotationSpanChange: (id: string, span: Span) => void;
	handleAnnotationDelete: (id: string) => void;
}

export function useRegionHandlers({
	pushState,
	updateState,
	selectedZoomId,
	setSelectedZoomId,
	selectedTrimId,
	setSelectedTrimId,
	selectedSpeedId,
	setSelectedSpeedId,
	selectedAnnotationId,
	setSelectedAnnotationId,
	selectedBlurId,
	setSelectedBlurId,
	selectedAudioId,
	setSelectedAudioId,
	selectedClipId,
	setSelectedClipId,
	nextZoomIdRef,
	nextTrimIdRef,
	nextSpeedIdRef,
	nextAnnotationIdRef,
	nextAnnotationZIndexRef,
	nextAudioIdRef,
	nextClipIdRef,
	currentTimeRef,
}: UseRegionHandlersParams): UseRegionHandlersResult {
	const handleSelectZoom = useCallback((id: string | null) => {
		setSelectedZoomId(id);
		if (id) {
			setSelectedTrimId(null);
			setSelectedAnnotationId(null);
			setSelectedBlurId(null);
			setSelectedAudioId(null);
			setSelectedClipId(null);
		}
	}, [setSelectedZoomId, setSelectedTrimId, setSelectedAnnotationId, setSelectedBlurId, setSelectedAudioId, setSelectedClipId]);

	const handleSelectTrim = useCallback((id: string | null) => {
		setSelectedTrimId(id);
		if (id) {
			setSelectedZoomId(null);
			setSelectedAnnotationId(null);
			setSelectedBlurId(null);
		}
	}, [setSelectedTrimId, setSelectedZoomId, setSelectedAnnotationId, setSelectedBlurId]);

	const handleSelectAnnotation = useCallback((id: string | null) => {
		setSelectedAnnotationId(id);
		if (id) {
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedBlurId(null);
		}
	}, [setSelectedAnnotationId, setSelectedZoomId, setSelectedTrimId, setSelectedBlurId]);

	const handleSelectBlur = useCallback((id: string | null) => {
		setSelectedBlurId(id);
		if (id) {
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedAnnotationId(null);
			setSelectedSpeedId(null);
		}
	}, [setSelectedBlurId, setSelectedZoomId, setSelectedTrimId, setSelectedAnnotationId, setSelectedSpeedId]);

	const handleSelectSpeed = useCallback((id: string | null) => {
		setSelectedSpeedId(id);
		if (id) {
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedAnnotationId(null);
			setSelectedBlurId(null);
		}
	}, [setSelectedSpeedId, setSelectedZoomId, setSelectedTrimId, setSelectedAnnotationId, setSelectedBlurId]);

	const handleSelectAudio = useCallback((id: string | null) => {
		setSelectedAudioId(id);
		if (id) {
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedAnnotationId(null);
			setSelectedBlurId(null);
			setSelectedClipId(null);
		}
	}, [setSelectedAudioId, setSelectedZoomId, setSelectedTrimId, setSelectedAnnotationId, setSelectedBlurId, setSelectedClipId]);

	const handleSelectClip = useCallback((id: string | null) => {
		setSelectedClipId(id);
		if (id) {
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedAnnotationId(null);
			setSelectedAudioId(null);
		}
	}, [setSelectedClipId, setSelectedZoomId, setSelectedTrimId, setSelectedAnnotationId, setSelectedAudioId]);

	const handleZoomAdded = useCallback(
		(span: Span) => {
			const id = `zoom-${nextZoomIdRef.current++}`;
			const newRegion: ZoomRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				depth: DEFAULT_ZOOM_DEPTH,
				focus: { cx: 0.5, cy: 0.5 },
			};
			pushState((prev) => ({ zoomRegions: [...prev.zoomRegions, newRegion] }));
			setSelectedZoomId(id);
			setSelectedTrimId(null);
			setSelectedAnnotationId(null);
			setSelectedBlurId(null);
		},
		[pushState, nextZoomIdRef, setSelectedZoomId, setSelectedTrimId, setSelectedAnnotationId, setSelectedBlurId],
	);

	const handleZoomSuggested = useCallback(
		(span: Span, focus: ZoomFocus) => {
			const id = `zoom-${nextZoomIdRef.current++}`;
			const newRegion: ZoomRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				depth: DEFAULT_ZOOM_DEPTH,
				focus: clampFocusToDepth(focus, DEFAULT_ZOOM_DEPTH),
			};
			pushState((prev) => ({ zoomRegions: [...prev.zoomRegions, newRegion] }));
			setSelectedZoomId(id);
			setSelectedTrimId(null);
			setSelectedAnnotationId(null);
			setSelectedBlurId(null);
		},
		[pushState, nextZoomIdRef, setSelectedZoomId, setSelectedTrimId, setSelectedAnnotationId, setSelectedBlurId],
	);

	const handleTrimAdded = useCallback(
		(span: Span) => {
			const id = `trim-${nextTrimIdRef.current++}`;
			const newRegion: TrimRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
			};
			pushState((prev) => ({ trimRegions: [...prev.trimRegions, newRegion] }));
			setSelectedTrimId(id);
			setSelectedZoomId(null);
			setSelectedAnnotationId(null);
			setSelectedBlurId(null);
		},
		[pushState, nextTrimIdRef, setSelectedTrimId, setSelectedZoomId, setSelectedAnnotationId, setSelectedBlurId],
	);

	const handleZoomSpanChange = useCallback(
		(id: string, span: Span) => {
			pushState((prev) => ({
				zoomRegions: prev.zoomRegions.map((region) =>
					region.id === id
						? {
								...region,
								startMs: Math.round(span.start),
								endMs: Math.round(span.end),
							}
						: region,
				),
			}));
		},
		[pushState],
	);

	const handleTrimSpanChange = useCallback(
		(id: string, span: Span) => {
			pushState((prev) => ({
				trimRegions: prev.trimRegions.map((region) =>
					region.id === id
						? {
								...region,
								startMs: Math.round(span.start),
								endMs: Math.round(span.end),
							}
						: region,
				),
			}));
		},
		[pushState],
	);

	// Focus drag: updateState for live preview, commitState on pointer-up
	const handleZoomFocusChange = useCallback(
		(id: string, focus: ZoomFocus) => {
			updateState((prev) => ({
				zoomRegions: prev.zoomRegions.map((region) =>
					region.id === id ? { ...region, focus: clampFocusToDepth(focus, region.depth) } : region,
				),
			}));
		},
		[updateState],
	);

	const handleZoomDepthChange = useCallback(
		(depth: ZoomDepth) => {
			if (!selectedZoomId) return;
			pushState((prev) => ({
				zoomRegions: prev.zoomRegions.map((region) =>
					region.id === selectedZoomId
						? {
								...region,
								depth,
								focus: clampFocusToDepth(region.focus, depth),
							}
						: region,
				),
			}));
		},
		[selectedZoomId, pushState],
	);

	const handleZoomFocusModeChange = useCallback(
		(focusMode: ZoomFocusMode) => {
			if (!selectedZoomId) return;
			pushState((prev) => ({
				zoomRegions: prev.zoomRegions.map((region) =>
					region.id === selectedZoomId ? { ...region, focusMode } : region,
				),
			}));
		},
		[selectedZoomId, pushState],
	);

	const handleZoomDelete = useCallback(
		(id: string) => {
			pushState((prev) => ({
				zoomRegions: prev.zoomRegions.filter((r) => r.id !== id),
			}));
			if (selectedZoomId === id) {
				setSelectedZoomId(null);
			}
		},
		[selectedZoomId, pushState, setSelectedZoomId],
	);

	const handleTrimDelete = useCallback(
		(id: string) => {
			pushState((prev) => ({
				trimRegions: prev.trimRegions.filter((r) => r.id !== id),
			}));
			if (selectedTrimId === id) {
				setSelectedTrimId(null);
			}
		},
		[selectedTrimId, pushState, setSelectedTrimId],
	);

	const handleSpeedAdded = useCallback(
		(span: Span) => {
			const id = `speed-${nextSpeedIdRef.current++}`;
			const newRegion: SpeedRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				speed: DEFAULT_PLAYBACK_SPEED,
			};
			pushState((prev) => ({
				speedRegions: [...prev.speedRegions, newRegion],
			}));
			setSelectedSpeedId(id);
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedAnnotationId(null);
			setSelectedBlurId(null);
		},
		[pushState, nextSpeedIdRef, setSelectedSpeedId, setSelectedZoomId, setSelectedTrimId, setSelectedAnnotationId, setSelectedBlurId],
	);

	const handleSpeedSpanChange = useCallback(
		(id: string, span: Span) => {
			pushState((prev) => ({
				speedRegions: prev.speedRegions.map((region) =>
					region.id === id
						? {
								...region,
								startMs: Math.round(span.start),
								endMs: Math.round(span.end),
							}
						: region,
				),
			}));
		},
		[pushState],
	);

	const handleSpeedDelete = useCallback(
		(id: string) => {
			pushState((prev) => ({
				speedRegions: prev.speedRegions.filter((region) => region.id !== id),
			}));
			if (selectedSpeedId === id) {
				setSelectedSpeedId(null);
			}
		},
		[selectedSpeedId, pushState, setSelectedSpeedId],
	);

	const handleSpeedChange = useCallback(
		(speed: PlaybackSpeed) => {
			if (!selectedSpeedId) return;
			pushState((prev) => ({
				speedRegions: prev.speedRegions.map((region) =>
					region.id === selectedSpeedId ? { ...region, speed } : region,
				),
			}));
		},
		[selectedSpeedId, pushState],
	);

	function autoAssignTrackIndex(existing: AudioRegion[], newSpan: { startMs: number; endMs: number }): number {
		let idx = 0;
		while (true) {
			const occupied = existing
				.filter((r) => (r.trackIndex ?? 0) === idx)
				.some((r) => newSpan.endMs > r.startMs && newSpan.startMs < r.endMs);
			if (!occupied) return idx;
			idx++;
		}
	}

	const handleAudioAdded = useCallback(
		(_span: Span, sourcePath: string, label: string) => {
			const id = `audio-${nextAudioIdRef.current++}`;
			const startMs = Math.round(_span.start);
			const endMs = Math.round(_span.end);
			pushState((prev) => {
				const trackIndex = autoAssignTrackIndex(prev.audioRegions, { startMs, endMs });
				const newRegion: AudioRegion = {
					id,
					startMs,
					endMs,
					sourceOffsetMs: 0,
					sourcePath,
					volume: DEFAULT_AUDIO_VOLUME,
					label,
					trackIndex,
				};
				return { audioRegions: [...prev.audioRegions, newRegion] };
			});
			setSelectedAudioId(id);
			setSelectedZoomId(null);
			setSelectedAnnotationId(null);
		},
		[pushState, nextAudioIdRef, setSelectedAudioId, setSelectedZoomId, setSelectedAnnotationId],
	);

	const handleAudioSpanChange = useCallback(
		(id: string, span: Span) => {
			pushState((prev) => ({
				audioRegions: prev.audioRegions.map((r) =>
					r.id === id ? { ...r, startMs: Math.round(span.start), endMs: Math.round(span.end) } : r,
				),
			}));
		},
		[pushState],
	);

	const handleAudioDelete = useCallback(
		(id: string) => {
			pushState((prev) => ({ audioRegions: prev.audioRegions.filter((r) => r.id !== id) }));
			if (selectedAudioId === id) setSelectedAudioId(null);
		},
		[selectedAudioId, pushState, setSelectedAudioId],
	);

	const handleAudioVolumeChange = useCallback(
		(id: string, volume: number) => {
			pushState((prev) => ({
				audioRegions: prev.audioRegions.map((r) => (r.id === id ? { ...r, volume } : r)),
			}));
		},
		[pushState],
	);

	const handleAudioLabelChange = useCallback(
		(id: string, label: string) => {
			pushState((prev) => ({
				audioRegions: prev.audioRegions.map((r) => (r.id === id ? { ...r, label } : r)),
			}));
		},
		[pushState],
	);

	const handleAudioEqualizerChange = useCallback(
		(id: string, equalizer: import("../types").AudioEqualizer) => {
			pushState((prev) => ({
				audioRegions: prev.audioRegions.map((r) => (r.id === id ? { ...r, equalizer } : r)),
			}));
		},
		[pushState],
	);

	const handleAudioFadeChange = useCallback(
		(id: string, fadeInMs: number, fadeOutMs: number) => {
			pushState((prev) => ({
				audioRegions: prev.audioRegions.map((r) => (r.id === id ? { ...r, fadeInMs, fadeOutMs } : r)),
			}));
		},
		[pushState],
	);

	const handleClipAdded = useCallback(
		(_span: Span, sourcePath: string, label: string) => {
			const id = `clip-${nextClipIdRef.current++}`;
			const newRegion: ClipRegion = {
				id,
				startMs: Math.round(_span.start),
				endMs: Math.round(_span.end),
				sourceOffsetMs: 0,
				sourcePath,
				label,
			};
			pushState((prev) => ({ clipRegions: [...prev.clipRegions, newRegion] }));
			setSelectedClipId(id);
			setSelectedZoomId(null);
			setSelectedAnnotationId(null);
		},
		[pushState, nextClipIdRef, setSelectedClipId, setSelectedZoomId, setSelectedAnnotationId],
	);

	const handleClipSpanChange = useCallback(
		(id: string, span: Span) => {
			pushState((prev) => ({
				clipRegions: prev.clipRegions.map((r) =>
					r.id === id ? { ...r, startMs: Math.round(span.start), endMs: Math.round(span.end) } : r,
				),
			}));
		},
		[pushState],
	);

	const handleClipDelete = useCallback(
		(id: string) => {
			pushState((prev) => {
				const deleted = prev.clipRegions.find((r) => r.id === id);
				if (!deleted) return {};
				const deletedDuration = deleted.endMs - deleted.startMs;
				return {
					clipRegions: prev.clipRegions
						.filter((r) => r.id !== id)
						.map((r) =>
							r.startMs >= deleted.endMs
								? { ...r, startMs: r.startMs - deletedDuration, endMs: r.endMs - deletedDuration }
								: r,
						),
				};
			});
			if (selectedClipId === id) setSelectedClipId(null);
		},
		[selectedClipId, pushState, setSelectedClipId],
	);

	const handleClipLabelChange = useCallback(
		(id: string, label: string) => {
			pushState((prev) => ({
				clipRegions: prev.clipRegions.map((r) => (r.id === id ? { ...r, label } : r)),
			}));
		},
		[pushState],
	);

	const handleClipTransitionChange = useCallback(
		(id: string, transition: TransitionType, durationMs: number) => {
			pushState((prev) => ({
				clipRegions: prev.clipRegions.map((r) =>
					r.id === id
						? { ...r, transitionIn: transition, transitionInDurationMs: durationMs }
						: r,
				),
			}));
		},
		[pushState],
	);

	const handleClipUpdate = useCallback(
		(id: string, patch: Partial<ClipRegion>) => {
			pushState((prev) => ({
				clipRegions: prev.clipRegions.map((r) => r.id === id ? { ...r, ...patch } : r),
			}));
		},
		[pushState],
	);

	const handleExtractAudio = useCallback(
		(outputPath: string, startMs: number, sourceOffsetMs: number) => {
			const newRegion: AudioRegion = {
				id: `audio-${Date.now()}`,
				startMs,
				endMs: startMs + 5000,
				sourceOffsetMs,
				sourcePath: outputPath,
				volume: 1.0,
			};
			pushState((prev) => ({
				audioRegions: [...prev.audioRegions, newRegion],
			}));
		},
		[pushState],
	);

	const splitRegionAtPlayhead = useCallback(() => {
		const currentTimeMs = currentTimeRef.current * 1000;
		pushState((prev) => {
			function splitRegions<T extends { id: string; startMs: number; endMs: number }>(
				regions: T[],
				makeSecondId: () => string,
				adjustSecond?: (region: T, splitMs: number) => Partial<T>,
			): T[] {
				const next: T[] = [];
				for (const region of regions) {
					if (currentTimeMs > region.startMs && currentTimeMs < region.endMs) {
						const first: T = { ...region, endMs: currentTimeMs };
						const second: T = {
							...region,
							id: makeSecondId(),
							startMs: currentTimeMs,
							...(adjustSecond ? adjustSecond(region, currentTimeMs) : {}),
						};
						next.push(first, second);
					} else {
						next.push(region);
					}
				}
				return next;
			}

			return {
				clipRegions: splitRegions(
					prev.clipRegions,
					() => `clip-${nextClipIdRef.current++}`,
					(region, splitMs) => ({
						sourceOffsetMs: region.sourceOffsetMs + (splitMs - region.startMs),
						transitionIn: undefined,
						transitionInDurationMs: undefined,
					}),
				),
				audioRegions: splitRegions(
					prev.audioRegions,
					() => `audio-${nextAudioIdRef.current++}`,
					(region, splitMs) => ({
						sourceOffsetMs: region.sourceOffsetMs + (splitMs - region.startMs),
					}),
				),
				zoomRegions: splitRegions(
					prev.zoomRegions,
					() => `zoom-${nextZoomIdRef.current++}`,
				),
				trimRegions: splitRegions(
					prev.trimRegions,
					() => `trim-${nextTrimIdRef.current++}`,
				),
				speedRegions: splitRegions(
					prev.speedRegions,
					() => `speed-${nextSpeedIdRef.current++}`,
				),
				annotationRegions: splitRegions(
					prev.annotationRegions,
					() => `annotation-${nextAnnotationIdRef.current++}`,
				),
			};
		});
	}, [pushState, currentTimeRef, nextClipIdRef, nextAudioIdRef, nextZoomIdRef, nextTrimIdRef, nextSpeedIdRef, nextAnnotationIdRef]);

	const handleImageAdded = useCallback(
		async (sourcePath: string) => {
			const id = `annotation-${nextAnnotationIdRef.current++}`;
			const zIndex = nextAnnotationZIndexRef.current++;
			const fileUrl = sourcePath.startsWith("file://") ? sourcePath : `file://${sourcePath}`;
			let dataUrl = fileUrl;
			try {
				const resp = await fetch(fileUrl);
				const blob = await resp.blob();
				dataUrl = await new Promise<string>((res) => {
					const reader = new FileReader();
					reader.onload = (e) => res(e.target!.result as string);
					reader.readAsDataURL(blob);
				});
			} catch {
				dataUrl = fileUrl;
			}
			const startMs = Math.round(currentTimeRef.current * 1000);
			const newRegion: AnnotationRegion = {
				id,
				startMs,
				endMs: startMs + 3000,
				type: "image",
				content: dataUrl,
				imageFullFrame: true,
				imageFit: "cover",
				position: { x: 0, y: 0 },
				size: { ...DEFAULT_ANNOTATION_SIZE },
				style: { ...DEFAULT_ANNOTATION_STYLE },
				zIndex,
			};
			pushState((prev) => ({ annotationRegions: [...prev.annotationRegions, newRegion] }));
			setSelectedAnnotationId(id);
		},
		[pushState, nextAnnotationIdRef, nextAnnotationZIndexRef, currentTimeRef, setSelectedAnnotationId],
	);

	const handleAnnotationAdded = useCallback(
		(span: Span) => {
			const id = `annotation-${nextAnnotationIdRef.current++}`;
			const zIndex = nextAnnotationZIndexRef.current++;
			const newRegion: AnnotationRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				type: "text",
				content: "Enter text...",
				position: { ...DEFAULT_ANNOTATION_POSITION },
				size: { ...DEFAULT_ANNOTATION_SIZE },
				style: { ...DEFAULT_ANNOTATION_STYLE },
				zIndex,
			};
			pushState((prev) => ({
				annotationRegions: [...prev.annotationRegions, newRegion],
			}));
			setSelectedAnnotationId(id);
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedBlurId(null);
		},
		[pushState, nextAnnotationIdRef, nextAnnotationZIndexRef, setSelectedAnnotationId, setSelectedZoomId, setSelectedTrimId, setSelectedBlurId],
	);

	const handleBlurAdded = useCallback(
		(span: Span) => {
			const id = `annotation-${nextAnnotationIdRef.current++}`;
			const zIndex = nextAnnotationZIndexRef.current++;
			const newRegion: AnnotationRegion = {
				id,
				startMs: Math.round(span.start),
				endMs: Math.round(span.end),
				type: "blur",
				content: "",
				position: { ...DEFAULT_ANNOTATION_POSITION },
				size: { ...DEFAULT_ANNOTATION_SIZE },
				style: { ...DEFAULT_ANNOTATION_STYLE },
				zIndex,
				blurData: { ...DEFAULT_BLUR_DATA },
			};
			pushState((prev) => ({
				annotationRegions: [...prev.annotationRegions, newRegion],
			}));
			setSelectedBlurId(id);
			setSelectedAnnotationId(null);
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedSpeedId(null);
		},
		[pushState, nextAnnotationIdRef, nextAnnotationZIndexRef, setSelectedBlurId, setSelectedAnnotationId, setSelectedZoomId, setSelectedTrimId, setSelectedSpeedId],
	);

	const handleZoomDurationChange = useCallback(
		(id: string, zoomIn: number, zoomOut: number) => {
			pushState((prev) => ({
				zoomRegions: prev.zoomRegions.map((region) =>
					region.id === id
						? { ...region, zoomInDurationMs: zoomIn, zoomOutDurationMs: zoomOut }
						: region,
				),
			}));
		},
		[pushState],
	);

	const handleAnnotationSpanChange = useCallback(
		(id: string, span: Span) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id
						? {
								...region,
								startMs: Math.round(span.start),
								endMs: Math.round(span.end),
							}
						: region,
				),
			}));
		},
		[pushState],
	);

	const handleAnnotationDelete = useCallback(
		(id: string) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.filter((r) => r.id !== id),
			}));
			if (selectedAnnotationId === id) {
				setSelectedAnnotationId(null);
			}
			if (selectedBlurId === id) {
				setSelectedBlurId(null);
			}
		},
		[selectedAnnotationId, selectedBlurId, pushState, setSelectedAnnotationId, setSelectedBlurId],
	);

	return {
		handleSelectZoom,
		handleSelectTrim,
		handleSelectAnnotation,
		handleSelectBlur,
		handleSelectSpeed,
		handleSelectAudio,
		handleSelectClip,
		handleZoomAdded,
		handleZoomSuggested,
		handleTrimAdded,
		handleZoomSpanChange,
		handleTrimSpanChange,
		handleZoomFocusChange,
		handleZoomDepthChange,
		handleZoomFocusModeChange,
		handleZoomDelete,
		handleTrimDelete,
		handleSpeedAdded,
		handleSpeedSpanChange,
		handleSpeedDelete,
		handleSpeedChange,
		handleAudioAdded,
		handleAudioSpanChange,
		handleAudioDelete,
		handleAudioVolumeChange,
		handleAudioLabelChange,
		handleAudioEqualizerChange,
		handleAudioFadeChange,
		handleClipAdded,
		handleClipSpanChange,
		handleClipDelete,
		handleClipLabelChange,
		handleClipTransitionChange,
		handleClipUpdate,
		handleExtractAudio,
		splitRegionAtPlayhead,
		handleImageAdded,
		handleAnnotationAdded,
		handleBlurAdded,
		handleZoomDurationChange,
		handleAnnotationSpanChange,
		handleAnnotationDelete,
	};
}
