import { useCallback } from "react";
import { toast } from "sonner";
import type { EditorState } from "@/hooks/useEditorHistory";
import {
	type AnnotationKeyframe,
	type AnnotationRegion,
	type BlurData,
	type ColorGrading,
	DEFAULT_ANNOTATION_STYLE,
	DEFAULT_BLUR_DATA,
	DEFAULT_FIGURE_DATA,
	type FigureData,
} from "../types";

interface UseAnnotationHandlersParams {
	pushState: (update: Partial<EditorState> | ((prev: EditorState) => Partial<EditorState>)) => void;
	updateState: (update: Partial<EditorState> | ((prev: EditorState) => Partial<EditorState>)) => void;
	selectedAnnotationId: string | null;
	setSelectedAnnotationId: (v: string | null) => void;
	selectedBlurId: string | null;
	setSelectedBlurId: (v: string | null) => void;
	setSelectedSpeedId: (v: string | null) => void;
	nextAnnotationIdRef: React.MutableRefObject<number>;
	nextAnnotationZIndexRef: React.MutableRefObject<number>;
	currentTimeRef: React.MutableRefObject<number>;
	videoSourcePath: string | null;
}

interface UseAnnotationHandlersResult {
	handleAnnotationContentChange: (id: string, content: string) => void;
	handleAnnotationStyleChange: (id: string, style: Partial<AnnotationRegion["style"]>) => void;
	handleAnnotationPatchChange: (id: string, patch: Partial<AnnotationRegion>) => void;
	handleAnnotationTypeChange: (id: string, type: AnnotationRegion["type"]) => void;
	handleAnnotationFigureDataChange: (id: string, figureData: FigureData) => void;
	handleAnnotationPositionChange: (id: string, position: { x: number; y: number }) => void;
	handleAnnotationSizeChange: (id: string, size: { width: number; height: number }) => void;
	handleAnnotationAddKeyframe: (id: string, keyframe: AnnotationKeyframe) => void;
	handleKeyframePositionChange: (id: string, keyframeIndex: number, position: { x: number; y: number }) => void;
	handleAddSticker: (partial: Omit<AnnotationRegion, "id" | "zIndex">) => void;
	handleAddDrawing: () => void;
	handleDrawingUpdate: (id: string, pathPoints: Array<{ x: number; y: number }>) => void;
	handleAutoCaptions: () => Promise<void>;
	handleApplyTextPreset: (partial: Partial<AnnotationRegion>) => void;
	handleColorGradingChange: (cg: ColorGrading) => void;
	handleBlurDataPreviewChange: (id: string, blurData: BlurData) => void;
	handleBlurDataPanelChange: (id: string, blurData: BlurData) => void;
}

export function useAnnotationHandlers({
	pushState,
	updateState,
	selectedAnnotationId,
	setSelectedAnnotationId,
	selectedBlurId,
	setSelectedBlurId,
	setSelectedSpeedId,
	nextAnnotationIdRef,
	nextAnnotationZIndexRef,
	currentTimeRef,
	videoSourcePath,
}: UseAnnotationHandlersParams): UseAnnotationHandlersResult {
	const handleAnnotationContentChange = useCallback(
		(id: string, content: string) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) => {
					if (region.id !== id) return region;
					if (region.type === "text") {
						return { ...region, content, textContent: content };
					} else if (region.type === "image") {
						return { ...region, content, imageContent: content };
					}
					return { ...region, content };
				}),
			}));
		},
		[pushState],
	);

	const handleAnnotationTypeChange = useCallback(
		(id: string, type: AnnotationRegion["type"]) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) => {
					if (region.id !== id) return region;
					const updatedRegion = { ...region, type };
					if (type === "text") {
						updatedRegion.content = region.textContent || "Enter text...";
					} else if (type === "image") {
						updatedRegion.content = region.imageContent || "";
					} else if (type === "figure") {
						updatedRegion.content = "";
						if (!region.figureData) {
							updatedRegion.figureData = { ...DEFAULT_FIGURE_DATA };
						}
					} else if (type === "blur") {
						updatedRegion.content = "";
						if (!region.blurData) {
							updatedRegion.blurData = { ...DEFAULT_BLUR_DATA };
						}
					}
					return updatedRegion;
				}),
			}));

			if (type === "blur" && selectedAnnotationId === id) {
				setSelectedAnnotationId(null);
				setSelectedBlurId(id);
				setSelectedSpeedId(null);
			} else if (type !== "blur" && selectedBlurId === id) {
				setSelectedBlurId(null);
				setSelectedAnnotationId(id);
			}
		},
		[pushState, selectedAnnotationId, selectedBlurId, setSelectedAnnotationId, setSelectedBlurId, setSelectedSpeedId],
	);

	const handleAnnotationStyleChange = useCallback(
		(id: string, style: Partial<AnnotationRegion["style"]>) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id ? { ...region, style: { ...region.style, ...style } } : region,
				),
			}));
		},
		[pushState],
	);

	const handleAnnotationPatchChange = useCallback(
		(id: string, patch: Partial<AnnotationRegion>) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id ? { ...region, ...patch } : region,
				),
			}));
		},
		[pushState],
	);

	const handleColorGradingChange = useCallback(
		(cg: ColorGrading) => {
			pushState(() => ({ colorGrading: cg }));
		},
		[pushState],
	);

	const handleAnnotationFigureDataChange = useCallback(
		(id: string, figureData: FigureData) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id ? { ...region, figureData } : region,
				),
			}));
		},
		[pushState],
	);

	const handleAddSticker = useCallback(
		(partial: Omit<AnnotationRegion, "id" | "zIndex">) => {
			const id = `annotation-${nextAnnotationIdRef.current++}`;
			const zIndex = nextAnnotationZIndexRef.current++;
			const startMs = Math.round(currentTimeRef.current * 1000);
			const newRegion: AnnotationRegion = {
				...partial,
				id,
				zIndex,
				startMs,
				endMs: startMs + 3000,
			};
			pushState((prev) => ({
				annotationRegions: [...prev.annotationRegions, newRegion],
			}));
			setSelectedAnnotationId(id);
		},
		[pushState, nextAnnotationIdRef, nextAnnotationZIndexRef, currentTimeRef, setSelectedAnnotationId],
	);

	const handleAddDrawing = useCallback(() => {
		const id = `annotation-${nextAnnotationIdRef.current++}`;
		const zIndex = nextAnnotationZIndexRef.current++;
		const startMs = Math.round(currentTimeRef.current * 1000);
		const newRegion: AnnotationRegion = {
			id,
			startMs,
			endMs: startMs + 3000,
			type: "drawing",
			content: "",
			position: { x: 0, y: 0 },
			size: { width: 100, height: 100 },
			style: { ...DEFAULT_ANNOTATION_STYLE },
			zIndex,
			pathPoints: [],
			strokeColor: "#ff0000",
			strokeWidth: 4,
		};
		pushState((prev) => ({
			annotationRegions: [...prev.annotationRegions, newRegion],
		}));
		setSelectedAnnotationId(id);
	}, [pushState, nextAnnotationIdRef, nextAnnotationZIndexRef, currentTimeRef, setSelectedAnnotationId]);

	const handleDrawingUpdate = useCallback(
		(id: string, pathPoints: Array<{ x: number; y: number }>) => {
			updateState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id ? { ...region, pathPoints } : region,
				),
			}));
		},
		[updateState],
	);

	const handleAnnotationAddKeyframe = useCallback(
		(id: string, keyframe: AnnotationKeyframe) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) => {
					if (region.id !== id) return region;
					const existing = region.keyframes ?? [];
					const withoutSameTime = existing.filter((kf) => Math.abs(kf.timeMs - keyframe.timeMs) > 50);
					return { ...region, keyframes: [...withoutSameTime, keyframe].sort((a, b) => a.timeMs - b.timeMs) };
				}),
			}));
		},
		[pushState],
	);

	const handleKeyframePositionChange = useCallback(
		(id: string, keyframeIndex: number, position: { x: number; y: number }) => {
			updateState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) => {
					if (region.id !== id || !region.keyframes) return region;
					const sorted = [...region.keyframes].sort((a, b) => a.timeMs - b.timeMs);
					if (keyframeIndex >= sorted.length) return region;
					const updated = sorted.map((kf, i) =>
						i === keyframeIndex ? { ...kf, properties: { ...kf.properties, position } } : kf,
					);
					return { ...region, keyframes: updated };
				}),
			}));
		},
		[updateState],
	);

	const handleApplyTextPreset = useCallback(
		(partial: Partial<AnnotationRegion>) => {
			const id = `annotation-${nextAnnotationIdRef.current++}`;
			const zIndex = nextAnnotationZIndexRef.current++;
			const startMs = Math.round(currentTimeRef.current * 1000);
			const newRegion: AnnotationRegion = {
				id,
				startMs,
				endMs: startMs + 3000,
				type: "text",
				content: "Text",
				position: { x: 35, y: 45 },
				size: { width: 30, height: 15 },
				style: { ...DEFAULT_ANNOTATION_STYLE },
				zIndex,
				...partial,
			};
			pushState((prev) => ({
				annotationRegions: [...prev.annotationRegions, newRegion],
			}));
			setSelectedAnnotationId(id);
		},
		[pushState, nextAnnotationIdRef, nextAnnotationZIndexRef, currentTimeRef, setSelectedAnnotationId],
	);

	const handleBlurDataPreviewChange = useCallback(
		(id: string, blurData: BlurData) => {
			updateState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id
						? {
								...region,
								blurData,
								// Freehand drawing area is the full video surface.
								...(blurData.shape === "freehand"
									? {
											position: { x: 0, y: 0 },
											size: { width: 100, height: 100 },
										}
									: {}),
							}
						: region,
				),
			}));
		},
		[updateState],
	);

	const handleBlurDataPanelChange = useCallback(
		(id: string, blurData: BlurData) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id
						? {
								...region,
								blurData,
								...(blurData.shape === "freehand"
									? {
											position: { x: 0, y: 0 },
											size: { width: 100, height: 100 },
										}
									: {}),
							}
						: region,
				),
			}));
		},
		[pushState],
	);

	const handleAnnotationPositionChange = useCallback(
		(id: string, position: { x: number; y: number }) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id ? { ...region, position } : region,
				),
			}));
		},
		[pushState],
	);

	const handleAnnotationSizeChange = useCallback(
		(id: string, size: { width: number; height: number }) => {
			pushState((prev) => ({
				annotationRegions: prev.annotationRegions.map((region) =>
					region.id === id ? { ...region, size } : region,
				),
			}));
		},
		[pushState],
	);

	const handleAutoCaptions = useCallback(async () => {
		if (!videoSourcePath) {
			toast.error("No video loaded");
			return;
		}
		if (!window.electronAPI?.transcribeAudio) {
			toast.error("Transcription not available");
			return;
		}
		toast.info("Running Whisper transcription...");
		const result = await window.electronAPI.transcribeAudio(videoSourcePath);
		if (!result.success || !result.segments) {
			toast.error(result.error ?? "Transcription failed");
			return;
		}
		const newRegions: AnnotationRegion[] = result.segments.map((seg, idx) => {
			const wordTimings = seg.words?.map((w) => ({
				word: w.word.trim(),
				startMs: Math.round(w.start * 1000),
				endMs: Math.round(w.end * 1000),
			})) ?? [];
			return {
				id: `annotation-${nextAnnotationIdRef.current++}`,
				startMs: Math.round(seg.start * 1000),
				endMs: Math.round(seg.end * 1000),
				type: "text" as const,
				content: seg.text.trim(),
				position: { x: 10, y: 85 },
				size: { width: 80, height: 10 },
				style: { ...DEFAULT_ANNOTATION_STYLE, fontSize: 24 },
				zIndex: nextAnnotationZIndexRef.current + idx,
				isSubtitle: true,
				wordTimings: wordTimings.length > 0 ? wordTimings : undefined,
			};
		});
		nextAnnotationZIndexRef.current += result.segments.length;
		pushState((prev) => ({
			annotationRegions: [...prev.annotationRegions, ...newRegions],
		}));
		toast.success(`Added ${newRegions.length} caption regions`);
	}, [videoSourcePath, pushState, nextAnnotationIdRef, nextAnnotationZIndexRef]);

	return {
		handleAnnotationContentChange,
		handleAnnotationStyleChange,
		handleAnnotationPatchChange,
		handleAnnotationTypeChange,
		handleAnnotationFigureDataChange,
		handleAnnotationPositionChange,
		handleAnnotationSizeChange,
		handleAnnotationAddKeyframe,
		handleKeyframePositionChange,
		handleAddSticker,
		handleAddDrawing,
		handleDrawingUpdate,
		handleAutoCaptions,
		handleApplyTextPreset,
		handleColorGradingChange,
		handleBlurDataPreviewChange,
		handleBlurDataPanelChange,
	};
}
