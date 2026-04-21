import type { Range } from "dnd-timeline";
import { useTimelineContext } from "dnd-timeline";
import { useCallback, useRef } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { AudioRegion } from "../types";
import Item from "./Item";
import PlaybackCursor from "./PlaybackCursor";
import Row from "./Row";
import TimelineAxis from "./TimelineAxis";
import TrackHeader from "./TrackHeader";
import { clampVisibleRange, normalizeWheelDelta } from "./timelineHelpers";

const OVERLAY_ROW_ID = "row-overlay";
const CLIP_ROW_ID = "row-clip";
const EFFECTS_ROW_ID = "row-effects";
const TRIM_ROW_ID = "row-trim";

interface TimelineRenderItem {
	id: string;
	rowId: string;
	span: { start: number; end: number };
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

export default function Timeline({
	items,
	audioRegions,
	videoDurationMs,
	currentTimeMs,
	onSeek,
	onRangeChange,
	onSelectZoom,
	onSelectTrim,
	onSelectAnnotation,
	onSelectBlur,
	onSelectSpeed,
	onSelectAudio,
	onSelectClip,
	selectedZoomId,
	selectedTrimId,
	selectedAnnotationId,
	selectedBlurId,
	selectedSpeedId,
	selectedAudioId,
	selectedClipId,
	onZoomDurationChange,
	keyframes = [],
	trackState = {},
	onTrackStateChange,
}: {
	items: TimelineRenderItem[];
	audioRegions?: AudioRegion[];
	videoDurationMs: number;
	currentTimeMs: number;
	onSeek?: (time: number) => void;
	onRangeChange?: (updater: (previous: Range) => Range) => void;
	onSelectZoom?: (id: string | null) => void;
	onSelectTrim?: (id: string | null) => void;
	onSelectAnnotation?: (id: string | null) => void;
	onSelectBlur?: (id: string | null) => void;
	onSelectSpeed?: (id: string | null) => void;
	onSelectAudio?: (id: string | null) => void;
	onSelectClip?: (id: string | null) => void;
	selectedZoomId: string | null;
	selectedTrimId?: string | null;
	selectedAnnotationId?: string | null;
	selectedBlurId?: string | null;
	selectedSpeedId?: string | null;
	selectedAudioId?: string | null;
	selectedClipId?: string | null;
	onZoomDurationChange: (id: string, zoomIn: number, zoomOut: number) => void;
	keyframes?: { id: string; time: number }[];
	trackState?: Record<string, { muted: boolean; locked: boolean; label: string }>;
	onTrackStateChange?: (rowId: string, patch: Partial<{ muted: boolean; locked: boolean; label: string }>) => void;
}) {
	const t = useScopedT("timeline");
	const { setTimelineRef, style, sidebarWidth, range, pixelsToValue } = useTimelineContext();
	const localTimelineRef = useRef<HTMLDivElement | null>(null);

	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			setTimelineRef(node);
			localTimelineRef.current = node;
		},
		[setTimelineRef],
	);

	const handleTimelineClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (!onSeek || videoDurationMs <= 0) return;

			// Only clear selection if clicking on empty space (not on items)
			// This is handled by event propagation - items stop propagation
			onSelectZoom?.(null);
			onSelectTrim?.(null);
			onSelectAnnotation?.(null);
			onSelectBlur?.(null);
			onSelectSpeed?.(null);
			onSelectAudio?.(null);
			onSelectClip?.(null);

			const rect = e.currentTarget.getBoundingClientRect();
			const clickX = e.clientX - rect.left - sidebarWidth;

			if (clickX < 0) return;

			const relativeMs = pixelsToValue(clickX);
			const absoluteMs = Math.max(0, Math.min(range.start + relativeMs, videoDurationMs));
			const timeInSeconds = absoluteMs / 1000;

			onSeek(timeInSeconds);
		},
		[
			onSeek,
			onSelectZoom,
			onSelectTrim,
			onSelectAnnotation,
			onSelectBlur,
			onSelectSpeed,
			videoDurationMs,
			sidebarWidth,
			range.start,
			pixelsToValue,
		],
	);

	const handleTimelineWheel = useCallback(
		(event: React.WheelEvent<HTMLDivElement>) => {
			if (!onRangeChange || event.ctrlKey || event.metaKey || videoDurationMs <= 0) {
				return;
			}

			const visibleMs = range.end - range.start;
			if (visibleMs <= 0 || videoDurationMs <= visibleMs) {
				return;
			}

			const dominantDelta =
				Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
			if (dominantDelta === 0) {
				return;
			}

			event.preventDefault();

			const pageWidthPx = Math.max(event.currentTarget.clientWidth - sidebarWidth, 1);
			const normalizedDeltaPx = normalizeWheelDelta(dominantDelta, event.deltaMode, pageWidthPx);
			const shiftMs = pixelsToValue(normalizedDeltaPx);

			onRangeChange((previous) => {
				const nextRange = clampVisibleRange(
					{
						start: previous.start + shiftMs,
						end: previous.end + shiftMs,
					},
					videoDurationMs,
				);

				return nextRange.start === previous.start && nextRange.end === previous.end
					? previous
					: nextRange;
			});
		},
		[onRangeChange, videoDurationMs, range.end, range.start, sidebarWidth, pixelsToValue],
	);

	const clipItems = items.filter((item) => item.rowId === CLIP_ROW_ID);
	const overlayItems = items.filter((item) => item.rowId === OVERLAY_ROW_ID);
	const effectsItems = items.filter((item) => item.rowId === EFFECTS_ROW_ID);
	const trimItems = items.filter((item) => item.rowId === TRIM_ROW_ID);

	const audioTrackCount = audioRegions && audioRegions.length > 0
		? Math.max(...audioRegions.map((r) => r.trackIndex ?? 0)) + 1
		: 1;
	const audioRowIds = Array.from({ length: audioTrackCount }, (_, i) => `row-audio-${i}`);

	const getTrack = (rowId: string) => trackState[rowId] ?? { muted: false, locked: false, label: rowId };

	function renderTrackHeader(rowId: string, defaultLabel?: string) {
		const track = getTrack(rowId);
		const label = track.label === rowId && defaultLabel ? defaultLabel : track.label;
		return (
			<TrackHeader
				label={label}
				muted={track.muted}
				locked={track.locked}
				onMuteToggle={() => onTrackStateChange?.(rowId, { muted: !track.muted })}
				onLockToggle={() => onTrackStateChange?.(rowId, { locked: !track.locked })}
				onLabelChange={(lbl) => onTrackStateChange?.(rowId, { label: lbl })}
			/>
		);
	}

	return (
		<div
			ref={setRefs}
			style={style}
			className="select-none bg-[#09090b] min-h-[140px] relative cursor-pointer group"
			onClick={handleTimelineClick}
			onWheel={handleTimelineWheel}
		>
			<div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px)] bg-[length:20px_100%] pointer-events-none" />
			<TimelineAxis videoDurationMs={videoDurationMs} currentTimeMs={currentTimeMs} />
			<PlaybackCursor
				currentTimeMs={currentTimeMs}
				videoDurationMs={videoDurationMs}
				onSeek={onSeek}
				onRangeChange={onRangeChange}
				timelineRef={localTimelineRef}
				keyframes={keyframes}
			/>

			<Row id={OVERLAY_ROW_ID} isEmpty={overlayItems.length === 0} hint={t("hints.pressAnnotation")} sidebar={renderTrackHeader(OVERLAY_ROW_ID)}>
				{overlayItems.map((item) => (
					<Item
						id={item.id}
						key={item.id}
						rowId={item.rowId}
						span={item.span}
						isSelected={item.id === selectedAnnotationId || item.id === selectedBlurId}
						onSelect={() => {
							if (item.variant === "blur") {
								onSelectBlur?.(item.id);
							} else {
								onSelectAnnotation?.(item.id);
							}
						}}
						variant={item.variant}
					>
						{item.label}
					</Item>
				))}
			</Row>

			{clipItems.length > 0 && (
				<Row id={CLIP_ROW_ID} isEmpty={false} hint="" sidebar={renderTrackHeader(CLIP_ROW_ID)}>
					{clipItems.map((item) => (
						<Item
							id={item.id}
							key={item.id}
							rowId={item.rowId}
							span={item.span}
							isSelected={item.id === selectedClipId}
							onSelect={() => onSelectClip?.(item.id)}
							variant="clip"
							isPrimary={item.isPrimary}
							disableDrag={item.isPrimary}
							sourcePath={item.sourcePath}
							sourceOffsetMs={item.sourceOffsetMs}
						>
							{item.label}
						</Item>
					))}
				</Row>
			)}

			{audioRowIds.map((rowId, i) => {
				const audioItems = items.filter((item) => item.rowId === rowId);
				const trackLabel = trackState[rowId]?.label ?? `Audio ${i + 1}`;
				return (
					<Row key={rowId} id={rowId} isEmpty={audioItems.length === 0} hint="" sidebar={renderTrackHeader(rowId, trackLabel)}>
						{audioItems.map((item) => (
							<Item
								id={item.id}
								key={item.id}
								rowId={item.rowId}
								span={item.span}
								isSelected={item.id === selectedAudioId}
								onSelect={() => onSelectAudio?.(item.id)}
								variant="audio"
								audioVolume={item.audioVolume}
								sourcePath={item.sourcePath}
								sourceOffsetMs={item.sourceOffsetMs}
							>
								{item.label}
							</Item>
						))}
					</Row>
				);
			})}

			<Row id={EFFECTS_ROW_ID} isEmpty={effectsItems.length === 0} hint={t("hints.pressZoom")} sidebar={renderTrackHeader(EFFECTS_ROW_ID)}>
				{effectsItems.map((item) => (
					<Item
						id={item.id}
						key={item.id}
						rowId={item.rowId}
						span={item.span}
						isSelected={item.id === selectedZoomId || item.id === selectedSpeedId}
						onSelect={() => {
							if (item.variant === "speed") {
								onSelectSpeed?.(item.id);
							} else {
								onSelectZoom?.(item.id);
							}
						}}
						variant={item.variant}
						zoomDepth={item.zoomDepth}
						zoomInDurationMs={item.zoomInDurationMs}
						zoomOutDurationMs={item.zoomOutDurationMs}
						onZoomDurationChange={onZoomDurationChange}
						speedValue={item.speedValue}
					>
						{item.label}
					</Item>
				))}
			</Row>

			<Row id={TRIM_ROW_ID} isEmpty={trimItems.length === 0} hint={t("hints.pressTrim")} sidebar={renderTrackHeader(TRIM_ROW_ID)}>
				{trimItems.map((item) => (
					<Item
						id={item.id}
						key={item.id}
						rowId={item.rowId}
						span={item.span}
						isSelected={item.id === selectedTrimId}
						onSelect={() => onSelectTrim?.(item.id)}
						variant="trim"
					>
						{item.label}
					</Item>
				))}
			</Row>
		</div>
	);
}
