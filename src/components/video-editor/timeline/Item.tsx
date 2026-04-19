import type { Span } from "dnd-timeline";
import { useItem, useTimelineContext } from "dnd-timeline";
import { Film, Gauge, Lock, MessageSquare, Music, Scissors, ZoomIn } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
	DEFAULT_ZOOM_IN_MS,
	DEFAULT_ZOOM_OUT_MS,
	getDurations,
} from "../videoPlayback/zoomRegionUtils";
import glassStyles from "./ItemGlass.module.css";
import { thumbnailCache } from "./ThumbnailCache";
import { waveformCache } from "./WaveformCache";

interface ItemProps {
	id: string;
	span: Span;
	rowId: string;
	children: React.ReactNode;
	isSelected?: boolean;
	onSelect?: () => void;
	zoomDepth?: number;
	zoomInDurationMs?: number;
	zoomOutDurationMs?: number;
	speedValue?: number;
	onZoomDurationChange?: (id: string, zoomIn: number, zoomOut: number) => void;
	variant?: "zoom" | "trim" | "annotation" | "speed" | "blur" | "audio" | "clip";
	audioVolume?: number;
	isPrimary?: boolean;
	disableDrag?: boolean;
	sourcePath?: string;
	sourceOffsetMs?: number;
}

// Map zoom depth to multiplier labels
const ZOOM_LABELS: Record<number, string> = {
	1: "1.25×",
	2: "1.5×",
	3: "1.8×",
	4: "2.2×",
	5: "3.5×",
	6: "5×",
};

function formatMs(ms: number): string {
	const totalSeconds = ms / 1000;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes > 0) {
		return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
	}
	return `${seconds.toFixed(1)}s`;
}

export default function Item({
	id,
	span,
	rowId,
	isSelected = false,
	onSelect,
	zoomDepth = 1,
	zoomInDurationMs,
	zoomOutDurationMs,
	speedValue,
	audioVolume,
	isPrimary = false,
	disableDrag = false,
	variant = "zoom",
	children,
	onZoomDurationChange,
	sourcePath,
	sourceOffsetMs = 0,
}: ItemProps) {
	const { pixelsToValue } = useTimelineContext();

	const [waveform, setWaveform] = useState<Float32Array | null>(null);
	const [thumbnails, setThumbnails] = useState<string[]>([]);
	const waveformCanvasRef = useRef<HTMLCanvasElement>(null);

	const durationMs = span.end - span.start;

	useEffect(() => {
		if (variant !== "audio" || !sourcePath) return;
		const durationSec = durationMs / 1000;
		const cached = waveformCache.get(sourcePath);
		if (cached) { setWaveform(cached); return; }
		waveformCache.load(sourcePath, durationSec).then(setWaveform).catch(() => {});
	}, [variant, sourcePath, durationMs]);

	useEffect(() => {
		if (variant !== "clip" || !sourcePath || isPrimary) return;
		const cached = thumbnailCache.get(sourcePath, 0);
		if (cached !== null) {
			thumbnailCache.load(sourcePath, 8).then(setThumbnails).catch(() => {});
			return;
		}
		thumbnailCache.load(sourcePath, 8).then(setThumbnails).catch(() => {});
	}, [variant, sourcePath, isPrimary]);

	useEffect(() => {
		if (!waveform || !waveformCanvasRef.current) return;
		const canvas = waveformCanvasRef.current;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const W = canvas.width;
		const H = canvas.height;
		ctx.clearRect(0, 0, W, H);

		const totalDurationMs = (waveform.length / 200) * 1000;
		const offsetRatio = totalDurationMs > 0 ? sourceOffsetMs / totalDurationMs : 0;
		const durationRatio = totalDurationMs > 0 ? durationMs / totalDurationMs : 1;

		const startPeak = Math.floor(offsetRatio * waveform.length);
		const peakCount = Math.ceil(durationRatio * waveform.length);

		ctx.fillStyle = "rgba(124, 58, 237, 0.6)";
		const barWidth = Math.max(1, W / Math.max(peakCount, 1));

		for (let i = 0; i < peakCount; i++) {
			const peak = waveform[startPeak + i] ?? 0;
			const barH = Math.max(1, peak * H * 0.9);
			const x = (i / peakCount) * W;
			ctx.fillRect(x, (H - barH) / 2, barWidth - 0.5, barH);
		}
	}, [waveform, durationMs, sourceOffsetMs]);
	const { setNodeRef, attributes, listeners, itemStyle, itemContentStyle } = useItem({
		id,
		span,
		data: { rowId },
	});

	const isZoom = variant === "zoom";
	const isTrim = variant === "trim";
	const isSpeed = variant === "speed";
	const isAudio = variant === "audio";
	const isClip = variant === "clip";

	const glassClass = isZoom
		? glassStyles.glassGreen
		: isTrim
			? glassStyles.glassRed
			: isSpeed
				? glassStyles.glassAmber
				: isAudio
					? glassStyles.glassPurple ?? glassStyles.glassAmber
					: isClip
						? glassStyles.glassBlue ?? glassStyles.glassGreen
						: glassStyles.glassYellow;

	const endCapColor = isZoom
		? "#21916A"
		: isTrim
			? "#ef4444"
			: isSpeed
				? "#d97706"
				: isAudio
					? "#7c3aed"
					: isClip
						? "#2563eb"
						: "#B4A046";

	const timeLabel = useMemo(
		() => `${formatMs(span.start)} – ${formatMs(span.end)}`,
		[span.start, span.end],
	);

	// Minimum clickable width on the outer wrapper.
	// Kept small (6px) so items visually distinguish their real positions;
	// users should zoom in to interact with sub-second items precisely.
	const MIN_ITEM_PX = 6;
	const safeItemStyle = { ...itemStyle, minWidth: MIN_ITEM_PX };

	const { zoomIn, zoomOut } = useMemo(() => {
		if (!isZoom) return { zoomIn: 0, zoomOut: 0 };
		return getDurations({
			startMs: span.start,
			endMs: span.end,
			zoomInDurationMs,
			zoomOutDurationMs,
		});
	}, [isZoom, span.start, span.end, zoomInDurationMs, zoomOutDurationMs]);

	return (
		<div
			ref={setNodeRef}
			style={safeItemStyle}
			{...(disableDrag ? {} : listeners)}
			{...attributes}
			onPointerDownCapture={() => onSelect?.()}
			className="group"
		>
			<div style={{ ...itemContentStyle, minWidth: 24 }}>
				<div
					className={cn(
						glassClass,
						"w-full h-full overflow-hidden flex items-center justify-center gap-1.5 relative",
						disableDrag ? "cursor-default" : "cursor-grab active:cursor-grabbing",
						isSelected && glassStyles.selected,
					)}
					style={{ height: isClip ? 52 : isAudio ? 44 : 40, color: "#fff", minWidth: 24 }}
					onClick={(event) => {
						event.stopPropagation();
						onSelect?.();
					}}
				>
					{isAudio && waveform && waveform.length > 0 && (
						<canvas
							ref={waveformCanvasRef}
							width={400}
							height={44}
							className="absolute inset-0 w-full h-full pointer-events-none opacity-70"
							style={{ imageRendering: "pixelated" }}
						/>
					)}

					{isClip && !isPrimary && thumbnails.length > 0 && (
						<div className="absolute inset-0 flex overflow-hidden pointer-events-none rounded-[7px]">
							{thumbnails.map((src, i) => (
								<img
									key={i}
									src={src}
									alt=""
									className="h-full object-cover shrink-0"
									style={{ width: `${100 / thumbnails.length}%` }}
									draggable={false}
								/>
							))}
							<div className="absolute inset-0 bg-blue-900/40 pointer-events-none" />
						</div>
					)}

					{isZoom && (
						<>
							{/* Transition In Marker */}
							<div
								className="absolute top-0 bottom-0 left-0 bg-white/10 border-r border-white/20 pointer-events-none"
								style={{
									width: `${(zoomIn / (span.end - span.start)) * 100}%`,
								}}
							/>
							{/* Draggable handle for Transition In */}
							<div
								className="absolute top-0 bottom-0 w-2 cursor-col-resize z-20 group-hover:bg-white/5 transition-colors"
								style={{
									left: `${(zoomIn / (span.end - span.start)) * 100}%`,
									transform: "translateX(-50%)",
								}}
								onPointerDown={(e) => {
									e.stopPropagation();
									e.preventDefault();
									const target = e.currentTarget;
									target.setPointerCapture(e.pointerId);

									const startX = e.clientX;
									const initialZoomIn = zoomInDurationMs ?? DEFAULT_ZOOM_IN_MS;
									const initialZoomOut = zoomOutDurationMs ?? DEFAULT_ZOOM_OUT_MS;

									const onPointerMove = (moveEvent: PointerEvent) => {
										const deltaPx = moveEvent.clientX - startX;
										const deltaMs = pixelsToValue(deltaPx);
										const newDuration = Math.max(
											0,
											Math.min(initialZoomIn + deltaMs, span.end - span.start - initialZoomOut),
										);
										onZoomDurationChange?.(id, newDuration, initialZoomOut);
									};

									const onPointerUp = () => {
										target.releasePointerCapture(e.pointerId);
										window.removeEventListener("pointermove", onPointerMove);
										window.removeEventListener("pointerup", onPointerUp);
									};

									window.addEventListener("pointermove", onPointerMove);
									window.addEventListener("pointerup", onPointerUp);
								}}
							/>
							{/* Transition Out Marker */}
							<div
								className="absolute top-0 bottom-0 right-0 bg-white/10 border-l border-white/20 pointer-events-none"
								style={{
									width: `${(zoomOut / (span.end - span.start)) * 100}%`,
								}}
							/>
							{/* Draggable handle for Transition Out */}
							<div
								className="absolute top-0 bottom-0 w-2 cursor-col-resize z-20 group-hover:bg-white/5 transition-colors"
								style={{
									right: `${(zoomOut / (span.end - span.start)) * 100}%`,
									transform: "translateX(50%)",
								}}
								onPointerDown={(e) => {
									e.stopPropagation();
									e.preventDefault();
									const target = e.currentTarget;
									target.setPointerCapture(e.pointerId);

									const startX = e.clientX;
									const initialZoomIn = zoomInDurationMs ?? DEFAULT_ZOOM_IN_MS;
									const initialZoomOut = zoomOutDurationMs ?? DEFAULT_ZOOM_OUT_MS;

									const onPointerMove = (moveEvent: PointerEvent) => {
										const deltaPx = startX - moveEvent.clientX; // Inverted because right-anchored
										const deltaMs = pixelsToValue(deltaPx);
										const newDuration = Math.max(
											0,
											Math.min(initialZoomOut + deltaMs, span.end - span.start - initialZoomIn),
										);
										onZoomDurationChange?.(id, initialZoomIn, newDuration);
									};

									const onPointerUp = () => {
										target.releasePointerCapture(e.pointerId);
										window.removeEventListener("pointermove", onPointerMove);
										window.removeEventListener("pointerup", onPointerUp);
									};

									window.addEventListener("pointermove", onPointerMove);
									window.addEventListener("pointerup", onPointerUp);
								}}
							/>
						</>
					)}
					<div
						className={cn(glassStyles.zoomEndCap, glassStyles.left)}
						style={{
							cursor: "col-resize",
							pointerEvents: "auto",
							width: 8,
							opacity: 0.9,
							background: endCapColor,
						}}
						title="Resize left"
					/>
					<div
						className={cn(glassStyles.zoomEndCap, glassStyles.right)}
						style={{
							cursor: "col-resize",
							pointerEvents: "auto",
							width: 8,
							opacity: 0.9,
							background: endCapColor,
						}}
						title="Resize right"
					/>
					{/* Content */}
					<div className="relative z-10 flex flex-col items-center justify-center text-white/90 opacity-80 group-hover:opacity-100 transition-opacity select-none overflow-hidden">
						<div className="flex items-center gap-1.5">
							{isZoom ? (
								<>
									<ZoomIn className="w-3.5 h-3.5 shrink-0" />
									<span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
										{ZOOM_LABELS[zoomDepth] || `${zoomDepth}×`}
									</span>
								</>
							) : isTrim ? (
								<>
									<Scissors className="w-3.5 h-3.5 shrink-0" />
									<span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
										Trim
									</span>
								</>
							) : isSpeed ? (
								<>
									<Gauge className="w-3.5 h-3.5 shrink-0" />
									<span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
										{speedValue !== undefined ? `${speedValue}×` : "Speed"}
									</span>
								</>
							) : isAudio ? (
							<>
								<Music className="w-3.5 h-3.5 shrink-0" />
								<span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
									{children}
								</span>
								{audioVolume !== undefined && (
									<span className="text-[9px] opacity-60 whitespace-nowrap">
										{Math.round(audioVolume * 100)}%
									</span>
								)}
							</>
						) : isClip ? (
							<>
								{isPrimary
									? <Lock className="w-3 h-3 shrink-0 text-slate-400" />
									: <Film className="w-3.5 h-3.5 shrink-0 text-blue-300" />
								}
								<span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
									{children}
								</span>
							</>
						) : (
							<>
								<MessageSquare className="w-3.5 h-3.5 shrink-0" />
								<span className="text-[11px] font-semibold tracking-tight whitespace-nowrap">
									{children}
								</span>
							</>
						)}
						</div>
						<span
							className={`text-[9px] tabular-nums tracking-tight whitespace-nowrap transition-opacity ${
								isSelected ? "opacity-60" : "opacity-0 group-hover:opacity-40"
							}`}
						>
							{timeLabel}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
