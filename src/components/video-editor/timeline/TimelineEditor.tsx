import type { Range, Span } from "dnd-timeline";
import {
	Check,
	ChevronDown,
	Film,
	Gauge,
	ImageIcon,
	Maximize2,
	MessageSquare,
	Minus,
	Music,
	Plus,
	Scissors,
	WandSparkles,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useScopedT } from "@/contexts/I18nContext";
import { useShortcuts } from "@/contexts/ShortcutsContext";
import { matchesShortcut } from "@/lib/shortcuts";
import { ASPECT_RATIOS, type AspectRatio, getAspectRatioLabel } from "@/utils/aspectRatioUtils";
import { formatShortcut } from "@/utils/platformUtils";
import { toFileUrl } from "../projectPersistence";
import { TutorialHelp } from "../TutorialHelp";
import type {
	AnnotationRegion,
	AudioRegion,
	ClipRegion,
	CursorTelemetryPoint,
	SpeedRegion,
	TrimRegion,
	ZoomFocus,
	ZoomRegion,
} from "../types";
import KeyframeMarkers from "./KeyframeMarkers";
import Timeline from "./Timeline";
import TimelineWrapper from "./TimelineWrapper";
import {
	calculateTimelineScale,
	clampVisibleRange,
	createInitialRange,
} from "./timelineHelpers";
import { detectZoomDwellCandidates, normalizeCursorTelemetry } from "./zoomSuggestionUtils";

const OVERLAY_ROW_ID = "row-overlay";
const CLIP_ROW_ID = "row-clip";
const EFFECTS_ROW_ID = "row-effects";
const TRIM_ROW_ID = "row-trim";
const SUGGESTION_SPACING_MS = 1800;

interface TimelineEditorProps {
	videoDuration: number;
	currentTime: number;
	onSeek?: (time: number) => void;
	cursorTelemetry?: CursorTelemetryPoint[];
	zoomRegions: ZoomRegion[];
	onZoomAdded: (span: Span) => void;
	onZoomSuggested?: (span: Span, focus: ZoomFocus) => void;
	onZoomSpanChange: (id: string, span: Span) => void;
	onZoomDurationChange: (id: string, zoomIn: number, zoomOut: number) => void;
	onZoomDelete: (id: string) => void;
	selectedZoomId: string | null;
	onSelectZoom: (id: string | null) => void;
	trimRegions?: TrimRegion[];
	onTrimAdded?: (span: Span) => void;
	onTrimSpanChange?: (id: string, span: Span) => void;
	onTrimDelete?: (id: string) => void;
	selectedTrimId?: string | null;
	onSelectTrim?: (id: string | null) => void;
	annotationRegions?: AnnotationRegion[];
	onAnnotationAdded?: (span: Span) => void;
	onAnnotationSpanChange?: (id: string, span: Span) => void;
	onAnnotationDelete?: (id: string) => void;
	selectedAnnotationId?: string | null;
	onSelectAnnotation?: (id: string | null) => void;
	blurRegions?: AnnotationRegion[];
	onBlurAdded?: (span: Span) => void;
	onBlurSpanChange?: (id: string, span: Span) => void;
	onBlurDelete?: (id: string) => void;
	selectedBlurId?: string | null;
	onSelectBlur?: (id: string | null) => void;
	speedRegions?: SpeedRegion[];
	onSpeedAdded?: (span: Span) => void;
	onSpeedSpanChange?: (id: string, span: Span) => void;
	onSpeedDelete?: (id: string) => void;
	selectedSpeedId?: string | null;
	onSelectSpeed?: (id: string | null) => void;
	audioRegions?: AudioRegion[];
	onAudioAdded?: (span: Span, sourcePath: string, label: string) => void;
	onAudioSpanChange?: (id: string, span: Span) => void;
	onAudioDelete?: (id: string) => void;
	onAudioVolumeChange?: (id: string, volume: number) => void;
	selectedAudioId?: string | null;
	onSelectAudio?: (id: string | null) => void;
	clipRegions?: ClipRegion[];
	onClipAdded?: (span: Span, sourcePath: string, label: string) => void;
	onClipSpanChange?: (id: string, span: Span) => void;
	onClipDelete?: (id: string) => void;
	selectedClipId?: string | null;
	onSelectClip?: (id: string | null) => void;
	onImageAdded?: (sourcePath: string) => void;
	aspectRatio: AspectRatio;
	onAspectRatioChange: (aspectRatio: AspectRatio) => void;
	trackState?: Record<string, { muted: boolean; locked: boolean; label: string }>;
	onTrackStateChange?: (rowId: string, patch: Partial<{ muted: boolean; locked: boolean; label: string }>) => void;
}

interface TimelineRenderItem {
	id: string;
	rowId: string;
	span: Span;
	label: string;
	zoomDepth?: number;
	speedValue?: number;
	zoomInDurationMs?: number;
	zoomOutDurationMs?: number;
	variant: "zoom" | "trim" | "annotation" | "speed" | "blur" | "audio" | "clip";
	audioVolume?: number;
	isPrimary?: boolean;
	sourcePath?: string;
	sourceOffsetMs?: number;
}


function probeVideoDuration(fileUrl: string): Promise<number> {
	return new Promise((resolve) => {
		const video = document.createElement("video");
		video.preload = "metadata";
		video.onloadedmetadata = () => { resolve(video.duration * 1000); video.src = ""; };
		video.onerror = () => resolve(30_000);
		video.src = fileUrl;
	});
}

function probeAudioDuration(fileUrl: string): Promise<number> {
	return new Promise((resolve) => {
		const audio = document.createElement("audio");
		audio.preload = "metadata";
		audio.onloadedmetadata = () => { resolve(audio.duration * 1000); audio.src = ""; };
		audio.onerror = () => resolve(30_000);
		audio.src = fileUrl;
	});
}

export default function TimelineEditor({
	videoDuration,
	currentTime,
	onSeek,
	cursorTelemetry = [],
	zoomRegions,
	onZoomAdded,
	onZoomSuggested,
	onZoomSpanChange,
	onZoomDurationChange,
	onZoomDelete,
	selectedZoomId,
	onSelectZoom,
	trimRegions = [],
	onTrimAdded,
	onTrimSpanChange,
	onTrimDelete,
	selectedTrimId,
	onSelectTrim,
	annotationRegions = [],
	onAnnotationAdded,
	onAnnotationSpanChange,
	onAnnotationDelete,
	selectedAnnotationId,
	onSelectAnnotation,
	blurRegions = [],
	onBlurAdded,
	onBlurSpanChange,
	onBlurDelete,
	selectedBlurId,
	onSelectBlur,
	speedRegions = [],
	onSpeedAdded,
	onSpeedSpanChange,
	onSpeedDelete,
	selectedSpeedId,
	onSelectSpeed,
	audioRegions = [],
	onAudioAdded,
	onAudioSpanChange,
	onAudioDelete,
	selectedAudioId,
	onSelectAudio,
	clipRegions = [],
	onClipAdded,
	onClipSpanChange,
	onClipDelete,
	selectedClipId,
	onSelectClip,
	onImageAdded,
	aspectRatio,
	onAspectRatioChange,
	trackState,
	onTrackStateChange,
}: TimelineEditorProps) {
	const t = useScopedT("timeline");
	const totalMs = useMemo(() => Math.max(0, Math.round(videoDuration * 1000)), [videoDuration]);
	const currentTimeMs = useMemo(() => Math.round(currentTime * 1000), [currentTime]);
	const timelineScale = useMemo(() => calculateTimelineScale(videoDuration), [videoDuration]);
	const safeMinDurationMs = useMemo(
		() =>
			totalMs > 0
				? Math.min(timelineScale.minItemDurationMs, totalMs)
				: timelineScale.minItemDurationMs,
		[timelineScale.minItemDurationMs, totalMs],
	);

	const [range, setRange] = useState<Range>(() => createInitialRange(totalMs));
	const [keyframes, setKeyframes] = useState<{ id: string; time: number }[]>([]);
	const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
	const [scrollLabels, setScrollLabels] = useState({
		pan: "Scroll",
		zoom: "Ctrl + Scroll",
	});
	const timelineContainerRef = useRef<HTMLDivElement>(null);
	const { shortcuts: keyShortcuts, isMac } = useShortcuts();

	useEffect(() => {
		formatShortcut(["mod", "Scroll"]).then((zoom) => {
			setScrollLabels({ pan: "Scroll", zoom });
		});
	}, []);

	// Add keyframe at current playhead position
	const addKeyframe = useCallback(() => {
		if (totalMs === 0) return;
		const time = Math.max(0, Math.min(currentTimeMs, totalMs));
		if (keyframes.some((kf) => Math.abs(kf.time - time) < 1)) return;
		setKeyframes((prev) => [...prev, { id: uuidv4(), time }]);
	}, [currentTimeMs, totalMs, keyframes]);

	// Delete selected keyframe
	const deleteSelectedKeyframe = useCallback(() => {
		if (!selectedKeyframeId) return;
		setKeyframes((prev) => prev.filter((kf) => kf.id !== selectedKeyframeId));
		setSelectedKeyframeId(null);
	}, [selectedKeyframeId]);

	// Move keyframe to new time position
	const handleKeyframeMove = useCallback(
		(id: string, newTime: number) => {
			setKeyframes((prev) =>
				prev.map((kf) =>
					kf.id === id ? { ...kf, time: Math.max(0, Math.min(newTime, totalMs)) } : kf,
				),
			);
		},
		[totalMs],
	);

	// Delete selected zoom item
	const deleteSelectedZoom = useCallback(() => {
		if (!selectedZoomId) return;
		onZoomDelete(selectedZoomId);
		onSelectZoom(null);
	}, [selectedZoomId, onZoomDelete, onSelectZoom]);

	// Delete selected trim item
	const deleteSelectedTrim = useCallback(() => {
		if (!selectedTrimId || !onTrimDelete || !onSelectTrim) return;
		onTrimDelete(selectedTrimId);
		onSelectTrim(null);
	}, [selectedTrimId, onTrimDelete, onSelectTrim]);

	const deleteSelectedAnnotation = useCallback(() => {
		if (!selectedAnnotationId || !onAnnotationDelete || !onSelectAnnotation) return;
		onAnnotationDelete(selectedAnnotationId);
		onSelectAnnotation(null);
	}, [selectedAnnotationId, onAnnotationDelete, onSelectAnnotation]);

	const deleteSelectedBlur = useCallback(() => {
		if (!selectedBlurId || !onBlurDelete || !onSelectBlur) return;
		onBlurDelete(selectedBlurId);
		onSelectBlur(null);
	}, [selectedBlurId, onBlurDelete, onSelectBlur]);

	const deleteSelectedSpeed = useCallback(() => {
		if (!selectedSpeedId || !onSpeedDelete || !onSelectSpeed) return;
		onSpeedDelete(selectedSpeedId);
		onSelectSpeed(null);
	}, [selectedSpeedId, onSpeedDelete, onSelectSpeed]);

	// Zoom the visible range in by 50% centred on the playhead (or midpoint)
	const handleZoomIn = useCallback(() => {
		if (totalMs === 0) return;
		setRange((prev) => {
			const visibleMs = prev.end - prev.start;
			const newVisible = Math.max(visibleMs * 0.5, timelineScale.minVisibleRangeMs);
			const centre = Math.max(prev.start, Math.min(currentTimeMs, prev.end));
			const newStart = Math.max(0, centre - newVisible / 2);
			return clampVisibleRange({ start: newStart, end: newStart + newVisible }, totalMs);
		});
	}, [totalMs, currentTimeMs, timelineScale.minVisibleRangeMs]);

	// Zoom the visible range out by 2× centred on the current midpoint
	const handleZoomOut = useCallback(() => {
		if (totalMs === 0) return;
		setRange((prev) => {
			const visibleMs = prev.end - prev.start;
			const newVisible = Math.min(visibleMs * 2, totalMs);
			const mid = (prev.start + prev.end) / 2;
			const newStart = Math.max(0, mid - newVisible / 2);
			return clampVisibleRange({ start: newStart, end: newStart + newVisible }, totalMs);
		});
	}, [totalMs]);

	// Fit the entire video into the visible window
	const handleFitToWindow = useCallback(() => {
		if (totalMs === 0) return;
		setRange({ start: 0, end: totalMs });
	}, [totalMs]);

	// Zoom level label: how many times the visible window fits into the total duration
	const zoomLevelLabel = useMemo(() => {
		const visibleMs = range.end - range.start;
		if (visibleMs <= 0 || totalMs <= 0) return "1×";
		const level = totalMs / visibleMs;
		return level >= 10 ? `${Math.round(level)}×` : `${level.toFixed(1).replace(".0", "")}×`;
	}, [range, totalMs]);

	useEffect(() => {
		setRange(createInitialRange(totalMs));
	}, [totalMs]);

	// Auto-scroll: keep the playhead visible during playback by panning the
	// visible range when the playhead reaches the last 10% of the visible window.
	const lastAutoScrollMs = useRef<number>(-1);
	useEffect(() => {
		if (totalMs === 0) return;
		setRange((prev) => {
			const visibleMs = prev.end - prev.start;
			const leadEdge = prev.end - visibleMs * 0.1;
			// Only scroll forward, never backward, and only when playhead is beyond the lead edge
			if (currentTimeMs < leadEdge) return prev;
			// Avoid repeatedly re-triggering on the same position
			if (currentTimeMs === lastAutoScrollMs.current) return prev;
			lastAutoScrollMs.current = currentTimeMs;
			const newStart = Math.min(currentTimeMs - visibleMs * 0.1, totalMs - visibleMs);
			if (newStart <= prev.start) return prev;
			return clampVisibleRange({ start: newStart, end: newStart + visibleMs }, totalMs);
		});
	}, [currentTimeMs, totalMs]);

	// Normalize regions only when timeline bounds change (not on every region edit).
	// Using refs to read current regions avoids a dependency-loop that re-fires
	// this effect on every drag/resize and races with dnd-timeline's internal state.
	const zoomRegionsRef = useRef(zoomRegions);
	const trimRegionsRef = useRef(trimRegions);
	const speedRegionsRef = useRef(speedRegions);
	zoomRegionsRef.current = zoomRegions;
	trimRegionsRef.current = trimRegions;
	speedRegionsRef.current = speedRegions;

	useEffect(() => {
		if (totalMs === 0 || safeMinDurationMs <= 0) {
			return;
		}

		zoomRegionsRef.current.forEach((region) => {
			const clampedStart = Math.max(0, Math.min(region.startMs, totalMs));
			const minEnd = clampedStart + safeMinDurationMs;
			const clampedEnd = Math.min(totalMs, Math.max(minEnd, region.endMs));
			const normalizedStart = Math.max(0, Math.min(clampedStart, totalMs - safeMinDurationMs));
			const normalizedEnd = Math.max(minEnd, Math.min(clampedEnd, totalMs));

			if (normalizedStart !== region.startMs || normalizedEnd !== region.endMs) {
				onZoomSpanChange(region.id, { start: normalizedStart, end: normalizedEnd });
			}
		});

		trimRegionsRef.current.forEach((region) => {
			const clampedStart = Math.max(0, Math.min(region.startMs, totalMs));
			const minEnd = clampedStart + safeMinDurationMs;
			const clampedEnd = Math.min(totalMs, Math.max(minEnd, region.endMs));
			const normalizedStart = Math.max(0, Math.min(clampedStart, totalMs - safeMinDurationMs));
			const normalizedEnd = Math.max(minEnd, Math.min(clampedEnd, totalMs));

			if (normalizedStart !== region.startMs || normalizedEnd !== region.endMs) {
				onTrimSpanChange?.(region.id, { start: normalizedStart, end: normalizedEnd });
			}
		});

		speedRegionsRef.current.forEach((region) => {
			const clampedStart = Math.max(0, Math.min(region.startMs, totalMs));
			const minEnd = clampedStart + safeMinDurationMs;
			const clampedEnd = Math.min(totalMs, Math.max(minEnd, region.endMs));
			const normalizedStart = Math.max(0, Math.min(clampedStart, totalMs - safeMinDurationMs));
			const normalizedEnd = Math.max(minEnd, Math.min(clampedEnd, totalMs));

			if (normalizedStart !== region.startMs || normalizedEnd !== region.endMs) {
				onSpeedSpanChange?.(region.id, { start: normalizedStart, end: normalizedEnd });
			}
		});
		// Only re-run when the timeline scale changes, not on every region edit
	}, [totalMs, safeMinDurationMs, onZoomSpanChange, onTrimSpanChange, onSpeedSpanChange]);

	const hasOverlap = useCallback(
		(newSpan: Span, excludeId?: string): boolean => {
			const isZoomItem = zoomRegions.some((r) => r.id === excludeId);
			const isTrimItem = trimRegions.some((r) => r.id === excludeId);
			const isAnnotationItem = annotationRegions.some((r) => r.id === excludeId);
			const isBlurItem = blurRegions.some((r) => r.id === excludeId);
			const isSpeedItem = speedRegions.some((r) => r.id === excludeId);
			const movingAudio = (audioRegions ?? []).find((r) => r.id === excludeId);
			const isClipItem = (clipRegions ?? []).some((r) => r.id === excludeId);

			// Overlay row (annotation + blur) allows free overlapping
			if (isAnnotationItem || isBlurItem) {
				return false;
			}

			// Audio: only block same-track overlaps
			if (movingAudio) {
				const sameTrack = (audioRegions ?? []).filter(
					(r) => r.id !== excludeId && (r.trackIndex ?? 0) === (movingAudio.trackIndex ?? 0),
				);
				return sameTrack.some(
					(region) => newSpan.end > region.startMs && newSpan.start < region.endMs,
				);
			}

			const checkOverlap = (regions: Array<{ id: string; startMs: number; endMs: number }>) =>
				regions.some(
					(region) =>
						region.id !== excludeId &&
						newSpan.end > region.startMs &&
						newSpan.start < region.endMs,
				);

			if (isZoomItem) return checkOverlap(zoomRegions);
			if (isTrimItem) return checkOverlap(trimRegions);
			if (isSpeedItem) return checkOverlap(speedRegions);
			if (isClipItem) return checkOverlap(clipRegions ?? []);

			return false;
		},
		[zoomRegions, trimRegions, annotationRegions, blurRegions, speedRegions, audioRegions, clipRegions],
	);

	// At least 5% of the timeline or 1000ms, whichever is larger, so the region
	// is always wide enough to grab and resize comfortably.
	const defaultRegionDurationMs = useMemo(
		() => Math.max(1000, Math.round(totalMs * 0.05)),
		[totalMs],
	);

	const handleAddZoom = useCallback(() => {
		if (!videoDuration || videoDuration === 0 || totalMs === 0) {
			return;
		}

		const defaultDuration = Math.min(defaultRegionDurationMs, totalMs);
		if (defaultDuration <= 0) {
			return;
		}

		// Always place zoom at playhead
		const startPos = Math.max(0, Math.min(currentTimeMs, totalMs));
		// Find the next zoom region after the playhead
		const sorted = [...zoomRegions].sort((a, b) => a.startMs - b.startMs);
		const nextRegion = sorted.find((region) => region.startMs > startPos);
		const gapToNext = nextRegion ? nextRegion.startMs - startPos : totalMs - startPos;

		// Check if playhead is inside any zoom region
		const isOverlapping = sorted.some(
			(region) => startPos >= region.startMs && startPos < region.endMs,
		);
		if (isOverlapping || gapToNext <= 0) {
			toast.error(t("errors.cannotPlaceZoom"), {
				description: t("errors.zoomExistsAtLocation"),
			});
			return;
		}

		const actualDuration = Math.min(defaultRegionDurationMs, gapToNext);
		onZoomAdded({ start: startPos, end: startPos + actualDuration });
	}, [videoDuration, totalMs, currentTimeMs, zoomRegions, onZoomAdded, defaultRegionDurationMs, t]);

	const handleSuggestZooms = useCallback(() => {
		if (!videoDuration || videoDuration === 0 || totalMs === 0) {
			return;
		}

		if (!onZoomSuggested) {
			toast.error(t("errors.zoomSuggestionUnavailable"));
			return;
		}

		if (cursorTelemetry.length < 2) {
			toast.info(t("errors.noCursorTelemetry"), {
				description: t("errors.noCursorTelemetryDescription"),
			});
			return;
		}

		const defaultDuration = Math.min(defaultRegionDurationMs, totalMs);
		if (defaultDuration <= 0) {
			return;
		}

		const reservedSpans = [...zoomRegions]
			.map((region) => ({ start: region.startMs, end: region.endMs }))
			.sort((a, b) => a.start - b.start);

		const normalizedSamples = normalizeCursorTelemetry(cursorTelemetry, totalMs);

		if (normalizedSamples.length < 2) {
			toast.info(t("errors.noUsableTelemetry"), {
				description: t("errors.noUsableTelemetryDescription"),
			});
			return;
		}

		const dwellCandidates = detectZoomDwellCandidates(normalizedSamples);

		if (dwellCandidates.length === 0) {
			toast.info(t("errors.noDwellMoments"), {
				description: t("errors.noDwellMomentsDescription"),
			});
			return;
		}

		const sortedCandidates = [...dwellCandidates].sort((a, b) => b.strength - a.strength);
		const acceptedCenters: number[] = [];

		let addedCount = 0;

		sortedCandidates.forEach((candidate) => {
			const tooCloseToAccepted = acceptedCenters.some(
				(center) => Math.abs(center - candidate.centerTimeMs) < SUGGESTION_SPACING_MS,
			);

			if (tooCloseToAccepted) {
				return;
			}

			const centeredStart = Math.round(candidate.centerTimeMs - defaultDuration / 2);
			const candidateStart = Math.max(0, Math.min(centeredStart, totalMs - defaultDuration));
			const candidateEnd = candidateStart + defaultDuration;
			const hasOverlap = reservedSpans.some(
				(span) => candidateEnd > span.start && candidateStart < span.end,
			);

			if (hasOverlap) {
				return;
			}

			reservedSpans.push({ start: candidateStart, end: candidateEnd });
			acceptedCenters.push(candidate.centerTimeMs);
			onZoomSuggested({ start: candidateStart, end: candidateEnd }, candidate.focus);
			addedCount += 1;
		});

		if (addedCount === 0) {
			toast.info(t("errors.noAutoZoomSlots"), {
				description: t("errors.noAutoZoomSlotsDescription"),
			});
			return;
		}

		toast.success(
			addedCount === 1
				? t("success.addedZoomSuggestions", { count: String(addedCount) })
				: t("success.addedZoomSuggestionsPlural", { count: String(addedCount) }),
		);
	}, [
		videoDuration,
		totalMs,
		defaultRegionDurationMs,
		zoomRegions,
		onZoomSuggested,
		cursorTelemetry,
		t,
	]);

	const handleAddTrim = useCallback(() => {
		if (!videoDuration || videoDuration === 0 || totalMs === 0 || !onTrimAdded) {
			return;
		}

		const defaultDuration = Math.min(defaultRegionDurationMs, totalMs);
		if (defaultDuration <= 0) {
			return;
		}

		// Always place trim at playhead
		const startPos = Math.max(0, Math.min(currentTimeMs, totalMs));
		// Find the next trim region after the playhead
		const sorted = [...trimRegions].sort((a, b) => a.startMs - b.startMs);
		const nextRegion = sorted.find((region) => region.startMs > startPos);
		const gapToNext = nextRegion ? nextRegion.startMs - startPos : totalMs - startPos;

		// Check if playhead is inside any trim region
		const isOverlapping = sorted.some(
			(region) => startPos >= region.startMs && startPos < region.endMs,
		);
		if (isOverlapping || gapToNext <= 0) {
			toast.error(t("errors.cannotPlaceTrim"), {
				description: t("errors.trimExistsAtLocation"),
			});
			return;
		}

		const actualDuration = Math.min(defaultRegionDurationMs, gapToNext);
		onTrimAdded({ start: startPos, end: startPos + actualDuration });
	}, [videoDuration, totalMs, currentTimeMs, trimRegions, onTrimAdded, defaultRegionDurationMs, t]);

	const handleAddSpeed = useCallback(() => {
		if (!videoDuration || videoDuration === 0 || totalMs === 0 || !onSpeedAdded) {
			return;
		}

		const defaultDuration = Math.min(defaultRegionDurationMs, totalMs);
		if (defaultDuration <= 0) {
			return;
		}

		// Always place speed region at playhead
		const startPos = Math.max(0, Math.min(currentTimeMs, totalMs));
		// Find the next speed region after the playhead
		const sorted = [...speedRegions].sort((a, b) => a.startMs - b.startMs);
		const nextRegion = sorted.find((region) => region.startMs > startPos);
		const gapToNext = nextRegion ? nextRegion.startMs - startPos : totalMs - startPos;

		// Check if playhead is inside any speed region
		const isOverlapping = sorted.some(
			(region) => startPos >= region.startMs && startPos < region.endMs,
		);
		if (isOverlapping || gapToNext <= 0) {
			toast.error(t("errors.cannotPlaceSpeed"), {
				description: t("errors.speedExistsAtLocation"),
			});
			return;
		}

		const actualDuration = Math.min(defaultRegionDurationMs, gapToNext);
		onSpeedAdded({ start: startPos, end: startPos + actualDuration });
	}, [
		videoDuration,
		totalMs,
		currentTimeMs,
		speedRegions,
		onSpeedAdded,
		defaultRegionDurationMs,
		t,
	]);

	const handleAddAnnotation = useCallback(() => {
		if (!videoDuration || videoDuration === 0 || totalMs === 0 || !onAnnotationAdded) {
			return;
		}

		const defaultDuration = Math.min(defaultRegionDurationMs, totalMs);
		if (defaultDuration <= 0) {
			return;
		}

		// Multiple annotations can exist at the same timestamp
		const startPos = Math.max(0, Math.min(currentTimeMs, totalMs));
		const endPos = Math.min(startPos + defaultDuration, totalMs);

		onAnnotationAdded({ start: startPos, end: endPos });
	}, [videoDuration, totalMs, currentTimeMs, onAnnotationAdded, defaultRegionDurationMs]);

	const handleAddBlur = useCallback(() => {
		if (!videoDuration || videoDuration === 0 || totalMs === 0 || !onBlurAdded) {
			return;
		}

		const defaultDuration = Math.min(defaultRegionDurationMs, totalMs);
		if (defaultDuration <= 0) {
			return;
		}

		const startPos = Math.max(0, Math.min(currentTimeMs, totalMs));
		const endPos = Math.min(startPos + defaultDuration, totalMs);
		onBlurAdded({ start: startPos, end: endPos });
	}, [videoDuration, totalMs, currentTimeMs, onBlurAdded, defaultRegionDurationMs]);

	const handleAddAudioClip = useCallback(async () => {
		try {
			const result = await window.electronAPI.openAudioFilePicker();
			if (!result?.success || !result.path) return;
			const fileUrl = toFileUrl(result.path);
			const durationMs = await probeAudioDuration(fileUrl);
			const startPos = Math.max(0, Math.min(currentTimeMs, totalMs > 0 ? totalMs : currentTimeMs));
			const endPos = startPos + durationMs;
			const label = result.path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "Audio";
			onAudioAdded?.({ start: startPos, end: endPos }, result.path, label);
		} catch (error) {
			console.error("Failed to open audio picker:", error);
		}
	}, [totalMs, currentTimeMs, onAudioAdded]);

	const handleAddVideoClip = useCallback(async () => {
		try {
			const result = await window.electronAPI.openVideoFilePicker();
			if (!result?.success || !result.path) return;
			const fileUrl = toFileUrl(result.path);
			const durationMs = await probeVideoDuration(fileUrl);
			const lastClipEnd = (clipRegions ?? []).reduce((max, r) => Math.max(max, r.endMs), 0);
			const startPos = lastClipEnd;
			const endPos = startPos + durationMs;
			const label = result.path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "Clip";
			onClipAdded?.({ start: startPos, end: endPos }, result.path, label);
		} catch (error) {
			console.error("Failed to open video picker:", error);
		}
	}, [clipRegions, onClipAdded]);

	const handleAddImageClip = useCallback(async () => {
		try {
			const result = await window.electronAPI.openImageFilePicker();
			if (!result?.success || !result.path) return;
			onImageAdded?.(result.path);
		} catch (error) {
			console.error("Failed to open image picker:", error);
		}
	}, [onImageAdded]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
				return;
			}

			if (matchesShortcut(e, keyShortcuts.addKeyframe, isMac)) {
				addKeyframe();
			}
			if (matchesShortcut(e, keyShortcuts.addZoom, isMac)) {
				handleAddZoom();
			}
			if (matchesShortcut(e, keyShortcuts.addTrim, isMac)) {
				handleAddTrim();
			}
			if (matchesShortcut(e, keyShortcuts.addAnnotation, isMac)) {
				handleAddAnnotation();
			}
			if (matchesShortcut(e, keyShortcuts.addBlur, isMac)) {
				handleAddBlur();
			}
			if (matchesShortcut(e, keyShortcuts.addSpeed, isMac)) {
				handleAddSpeed();
			}

			// Tab: Cycle through overlapping annotations at current time
			if (e.key === "Tab" && annotationRegions.length > 0) {
				const currentTimeMs = Math.round(currentTime * 1000);
				const overlapping = annotationRegions
					.filter((a) => currentTimeMs >= a.startMs && currentTimeMs <= a.endMs)
					.sort((a, b) => a.zIndex - b.zIndex); // Sort by z-index

				if (overlapping.length > 0) {
					e.preventDefault();

					if (!selectedAnnotationId || !overlapping.some((a) => a.id === selectedAnnotationId)) {
						onSelectAnnotation?.(overlapping[0].id);
					} else {
						// Cycle to next annotation
						const currentIndex = overlapping.findIndex((a) => a.id === selectedAnnotationId);
						const nextIndex = e.shiftKey
							? (currentIndex - 1 + overlapping.length) % overlapping.length // Shift+Tab = backward
							: (currentIndex + 1) % overlapping.length; // Tab = forward
						onSelectAnnotation?.(overlapping[nextIndex].id);
					}
				}
			}
			// Ctrl+= / Ctrl++ → zoom in; Ctrl+- → zoom out; Ctrl+Shift+F → fit
			if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
				e.preventDefault();
				handleZoomIn();
			}
			if ((e.ctrlKey || e.metaKey) && e.key === "-") {
				e.preventDefault();
				handleZoomOut();
			}
			if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") {
				e.preventDefault();
				handleFitToWindow();
			}

			// Delete key or Ctrl+D / Cmd+D
			if (
				e.key === "Delete" ||
				e.key === "Backspace" ||
				matchesShortcut(e, keyShortcuts.deleteSelected, isMac)
			) {
				if (selectedKeyframeId) {
					deleteSelectedKeyframe();
				} else if (selectedZoomId) {
					deleteSelectedZoom();
				} else if (selectedTrimId) {
					deleteSelectedTrim();
				} else if (selectedAnnotationId) {
					deleteSelectedAnnotation();
				} else if (selectedBlurId) {
					deleteSelectedBlur();
				} else if (selectedSpeedId) {
					deleteSelectedSpeed();
				} else if (selectedAudioId) {
					onAudioDelete?.(selectedAudioId);
					onSelectAudio?.(null);
				} else if (selectedClipId) {
					// Prevent deleting the primary clip (first by position)
					const sortedForDelete = [...(clipRegions ?? [])].sort((a, b) => a.startMs - b.startMs);
					if (sortedForDelete[0]?.id !== selectedClipId) {
						onClipDelete?.(selectedClipId);
						onSelectClip?.(null);
					}
				}
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		addKeyframe,
		handleAddZoom,
		handleAddTrim,
		handleAddAnnotation,
		handleAddBlur,
		handleAddSpeed,
		handleZoomIn,
		handleZoomOut,
		handleFitToWindow,
		deleteSelectedKeyframe,
		deleteSelectedZoom,
		deleteSelectedTrim,
		deleteSelectedAnnotation,
		deleteSelectedBlur,
		deleteSelectedSpeed,
		selectedKeyframeId,
		selectedZoomId,
		selectedTrimId,
		selectedAnnotationId,
		selectedBlurId,
		selectedSpeedId,
		selectedAudioId,
		selectedClipId,
		onAudioDelete,
		onSelectAudio,
		onClipDelete,
		onSelectClip,
		annotationRegions,
		blurRegions,
		currentTime,
		onSelectAnnotation,
		keyShortcuts,
		isMac,
	]);

	const clampedRange = useMemo<Range>(() => {
		if (totalMs === 0) {
			return range;
		}

		return {
			start: Math.max(0, Math.min(range.start, totalMs)),
			end: Math.min(range.end, totalMs),
		};
	}, [range, totalMs]);

	const timelineItems = useMemo<TimelineRenderItem[]>(() => {
		const zooms: TimelineRenderItem[] = zoomRegions.map((region, index) => ({
			id: region.id,
			rowId: EFFECTS_ROW_ID,
			span: { start: region.startMs, end: region.endMs },
			label: t("labels.zoomItem", { index: String(index + 1) }),
			zoomDepth: region.depth,
			zoomInDurationMs: region.zoomInDurationMs,
			zoomOutDurationMs: region.zoomOutDurationMs,
			variant: "zoom",
		}));

		const trims: TimelineRenderItem[] = trimRegions.map((region, index) => ({
			id: region.id,
			rowId: TRIM_ROW_ID,
			span: { start: region.startMs, end: region.endMs },
			label: t("labels.trimItem", { index: String(index + 1) }),
			variant: "trim",
		}));

		const annotations: TimelineRenderItem[] = annotationRegions.map((region) => {
			let label: string;

			if (region.type === "text") {
				const preview = region.content.trim() || t("labels.emptyText");
				label = preview.length > 20 ? `${preview.substring(0, 20)}...` : preview;
			} else if (region.type === "image") {
				label = t("labels.imageItem");
			} else {
				label = t("labels.annotationItem");
			}

			return {
				id: region.id,
				rowId: OVERLAY_ROW_ID,
				span: { start: region.startMs, end: region.endMs },
				label,
				variant: "annotation",
			};
		});

		const blurs: TimelineRenderItem[] = blurRegions.map((region, index) => ({
			id: region.id,
			rowId: OVERLAY_ROW_ID,
			span: { start: region.startMs, end: region.endMs },
			label: t("labels.blurItem", { index: String(index + 1) }),
			variant: "blur",
		}));

		const speeds: TimelineRenderItem[] = speedRegions.map((region, index) => ({
			id: region.id,
			rowId: EFFECTS_ROW_ID,
			span: { start: region.startMs, end: region.endMs },
			label: t("labels.speedItem", { index: String(index + 1) }),
			speedValue: region.speed,
			variant: "speed",
		}));

		const audios: TimelineRenderItem[] = (audioRegions ?? []).map((region, index) => {
			const trackIdx = region.trackIndex ?? 0;
			const rowId = `row-audio-${trackIdx}`;
			return {
				id: region.id,
				rowId,
				span: { start: region.startMs, end: region.endMs },
				label: region.label ?? `Audio ${index + 1}`,
				variant: "audio",
				audioVolume: region.volume,
				sourcePath: region.sourcePath,
				sourceOffsetMs: region.sourceOffsetMs,
			};
		});

		const sortedClipRegions = [...(clipRegions ?? [])].sort((a, b) => a.startMs - b.startMs);
		const clips: TimelineRenderItem[] = sortedClipRegions.map((region, index) => ({
			id: region.id,
			rowId: CLIP_ROW_ID,
			span: { start: region.startMs, end: region.endMs },
			label: region.label ?? `Clip ${index + 1}`,
			variant: "clip",
			isPrimary: index === 0,
			sourcePath: region.sourcePath,
			sourceOffsetMs: region.sourceOffsetMs,
		}));

		return [...clips, ...audios, ...zooms, ...trims, ...annotations, ...blurs, ...speeds];
	}, [zoomRegions, trimRegions, annotationRegions, blurRegions, speedRegions, audioRegions, clipRegions, t]);

	// Flat list of all non-annotation region spans for neighbour-clamping during drag/resize
	const allRegionSpans = useMemo(() => {
		const zooms = zoomRegions.map((r) => ({ id: r.id, start: r.startMs, end: r.endMs }));
		const trims = trimRegions.map((r) => ({ id: r.id, start: r.startMs, end: r.endMs }));
		const speeds = speedRegions.map((r) => ({ id: r.id, start: r.startMs, end: r.endMs }));
		return [...zooms, ...trims, ...speeds];
	}, [zoomRegions, trimRegions, speedRegions]);

	const handleItemSpanChange = useCallback(
		(id: string, span: Span) => {
			if (zoomRegions.some((r) => r.id === id)) {
				onZoomSpanChange(id, span);
			} else if (trimRegions.some((r) => r.id === id)) {
				onTrimSpanChange?.(id, span);
			} else if (speedRegions.some((r) => r.id === id)) {
				onSpeedSpanChange?.(id, span);
			} else if (annotationRegions.some((r) => r.id === id)) {
				onAnnotationSpanChange?.(id, span);
			} else if (blurRegions.some((r) => r.id === id)) {
				onBlurSpanChange?.(id, span);
			} else if ((audioRegions ?? []).some((r) => r.id === id)) {
				onAudioSpanChange?.(id, span);
			} else if ((clipRegions ?? []).some((r) => r.id === id)) {
				const sorted = [...(clipRegions ?? [])].sort((a, b) => a.startMs - b.startMs);
				if (sorted[0]?.id === id) return;
				onClipSpanChange?.(id, span);
			}
		},
		[
			zoomRegions,
			trimRegions,
			speedRegions,
			annotationRegions,
			blurRegions,
			audioRegions,
			clipRegions,
			onZoomSpanChange,
			onTrimSpanChange,
			onSpeedSpanChange,
			onAnnotationSpanChange,
			onBlurSpanChange,
			onAudioSpanChange,
			onClipSpanChange,
		],
	);

	if (!videoDuration || videoDuration === 0) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center rounded-lg bg-[#09090b] gap-3">
				<div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
					<Plus className="w-6 h-6 text-slate-600" />
				</div>
				<div className="text-center">
					<p className="text-sm font-medium text-slate-300">{t("emptyState.noVideo")}</p>
					<p className="text-xs text-slate-500 mt-1">{t("emptyState.dragAndDrop")}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col bg-[#09090b] overflow-hidden">
			<div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-[#09090b]">
				<div className="flex items-center gap-1">
					<Button
						onClick={handleAddZoom}
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-slate-400 hover:text-[#34B27B] hover:bg-[#34B27B]/10 transition-all"
						title={t("buttons.addZoom")}
					>
						<ZoomIn className="w-4 h-4" />
					</Button>
					<Button
						onClick={handleSuggestZooms}
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-slate-400 hover:text-[#34B27B] hover:bg-[#34B27B]/10 transition-all"
						title={t("buttons.suggestZooms")}
					>
						<WandSparkles className="w-4 h-4" />
					</Button>
					<Button
						onClick={handleAddTrim}
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-slate-400 hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-all"
						title={t("buttons.addTrim")}
					>
						<Scissors className="w-4 h-4" />
					</Button>
					<Button
						onClick={handleAddAnnotation}
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-slate-400 hover:text-[#B4A046] hover:bg-[#B4A046]/10 transition-all"
						title={t("buttons.addAnnotation")}
					>
						<MessageSquare className="w-4 h-4" />
					</Button>
					<Button
						onClick={handleAddBlur}
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-slate-400 hover:text-[#7dd3fc] hover:bg-[#7dd3fc]/10 transition-all"
						title={t("buttons.addBlur")}
					>
						<svg
							className="w-4 h-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<circle cx="8" cy="12" r="3" />
							<circle cx="16" cy="12" r="3" />
							<path d="M6 6h12M6 18h12" />
						</svg>
					</Button>
					<Button
						onClick={handleAddSpeed}
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-slate-400 hover:text-[#d97706] hover:bg-[#d97706]/10 transition-all"
						title={t("buttons.addSpeed")}
					>
						<Gauge className="w-4 h-4" />
					</Button>
					<Popover>
						<PopoverTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2.5 text-[11px] font-medium text-slate-400 hover:text-[#34B27B] hover:bg-[#34B27B]/10 transition-all gap-1 border border-white/10"
								title="Add Media"
							>
								<Plus className="w-3.5 h-3.5" />
								Media
							</Button>
						</PopoverTrigger>
						<PopoverContent
							side="top"
							align="start"
							className="w-44 p-1 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl"
						>
							<button
								onClick={handleAddVideoClip}
								className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-all"
							>
								<Film className="w-3.5 h-3.5 text-blue-400" />
								Add Video Clip
							</button>
							<button
								onClick={handleAddAudioClip}
								className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-all"
							>
								<Music className="w-3.5 h-3.5 text-purple-400" />
								Add Audio Track
							</button>
							<button
								onClick={handleAddImageClip}
								className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/10 hover:text-white transition-all"
							>
								<ImageIcon className="w-3.5 h-3.5 text-green-400" />
								Add Image
							</button>
						</PopoverContent>
					</Popover>
				</div>
				<div className="flex items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-all gap-1"
							>
								<span className="font-medium">{getAspectRatioLabel(aspectRatio)}</span>
								<ChevronDown className="w-3 h-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="bg-[#1a1a1a] border-white/10">
							{ASPECT_RATIOS.map((ratio) => (
								<DropdownMenuItem
									key={ratio}
									onClick={() => onAspectRatioChange(ratio)}
									className="text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer flex items-center justify-between gap-3"
								>
									<span>{getAspectRatioLabel(ratio)}</span>
									{aspectRatio === ratio && <Check className="w-3 h-3 text-[#34B27B]" />}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
					<div className="w-[1px] h-4 bg-white/10" />
					<TutorialHelp />
				</div>
				<div className="flex-1" />
				{/* Zoom controls */}
				<div className="flex items-center gap-0.5 mr-2">
					<Button
						onClick={handleZoomOut}
						variant="ghost"
						size="icon"
						className="h-6 w-6 text-slate-500 hover:text-slate-200 hover:bg-white/10"
						title="Zoom out (Ctrl -)"
						disabled={totalMs === 0}
					>
						<Minus className="w-3 h-3" />
					</Button>
					<span className="min-w-[34px] text-center text-[10px] font-medium text-slate-400 tabular-nums select-none">
						{zoomLevelLabel}
					</span>
					<Button
						onClick={handleZoomIn}
						variant="ghost"
						size="icon"
						className="h-6 w-6 text-slate-500 hover:text-slate-200 hover:bg-white/10"
						title="Zoom in (Ctrl +)"
						disabled={totalMs === 0}
					>
						<ZoomOut className="w-3 h-3" />
					</Button>
					<Button
						onClick={handleFitToWindow}
						variant="ghost"
						size="icon"
						className="h-6 w-6 text-slate-500 hover:text-slate-200 hover:bg-white/10"
						title="Fit to window (Ctrl Shift F)"
						disabled={totalMs === 0}
					>
						<Maximize2 className="w-3 h-3" />
					</Button>
				</div>
				<div className="w-[1px] h-4 bg-white/10 mr-2" />
				<div className="flex items-center gap-4 text-[10px] text-slate-500 font-medium">
					<span className="flex items-center gap-1.5">
						<kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[#34B27B] font-sans">
							{scrollLabels.pan}
						</kbd>
						<span>{t("labels.pan")}</span>
					</span>
					<span className="flex items-center gap-1.5">
						<kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[#34B27B] font-sans">
							{scrollLabels.zoom}
						</kbd>
						<span>{t("labels.zoom")}</span>
					</span>
				</div>
			</div>
			<div
				ref={timelineContainerRef}
				className="flex-1 overflow-hidden bg-[#09090b] relative"
				onClick={() => setSelectedKeyframeId(null)}
			>
				<TimelineWrapper
					range={clampedRange}
					videoDuration={videoDuration}
					hasOverlap={hasOverlap}
					onRangeChange={setRange}
					minItemDurationMs={timelineScale.minItemDurationMs}
					minVisibleRangeMs={timelineScale.minVisibleRangeMs}
					onItemSpanChange={handleItemSpanChange}
					allRegionSpans={allRegionSpans}
				>
					<KeyframeMarkers
						keyframes={keyframes}
						selectedKeyframeId={selectedKeyframeId}
						setSelectedKeyframeId={setSelectedKeyframeId}
						onKeyframeMove={handleKeyframeMove}
						videoDurationMs={totalMs}
						timelineRef={timelineContainerRef}
					/>
					<Timeline
						items={timelineItems}
						audioRegions={audioRegions}
						videoDurationMs={totalMs}
						currentTimeMs={currentTimeMs}
						onSeek={onSeek}
						onRangeChange={setRange}
						onSelectZoom={onSelectZoom}
						onSelectTrim={onSelectTrim}
						onSelectAnnotation={onSelectAnnotation}
						onSelectBlur={onSelectBlur}
						onSelectSpeed={onSelectSpeed}
						onSelectAudio={onSelectAudio}
						onSelectClip={onSelectClip}
						selectedZoomId={selectedZoomId}
						selectedTrimId={selectedTrimId}
						selectedAnnotationId={selectedAnnotationId}
						selectedBlurId={selectedBlurId}
						selectedSpeedId={selectedSpeedId}
						selectedAudioId={selectedAudioId}
						selectedClipId={selectedClipId}
						onZoomDurationChange={onZoomDurationChange}
						keyframes={keyframes}
						trackState={trackState}
						onTrackStateChange={onTrackStateChange}
					/>
				</TimelineWrapper>
			</div>
		</div>
	);
}
