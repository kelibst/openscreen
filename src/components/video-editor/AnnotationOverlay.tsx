import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import {
	getBlurOverlayColor,
	getMosaicGridOverlayColor,
	getNormalizedMosaicBlockSize,
} from "@/lib/blurEffects";
import { cn } from "@/lib/utils";
import { getArrowComponent } from "./ArrowSvgs";
import {
	type AnnotationKeyframe,
	type AnnotationRegion,
	type BlurData,
	DEFAULT_BLUR_BLOCK_SIZE,
	DEFAULT_BLUR_DATA,
	DEFAULT_BLUR_INTENSITY,
} from "./types";

const FREEHAND_POINT_THRESHOLD = 1;

// ── Text animation (mirrors annotationRenderer.ts computeTextAnimation exactly) ──

function computeTextAnimation(
	annotation: AnnotationRegion,
	currentTimeMs: number,
): { alpha: number; translateX: number; translateY: number; scale: number } {
	const preset = annotation.textAnimation?.preset ?? "none";
	if (preset === "none") return { alpha: 1, translateX: 0, translateY: 0, scale: 1 };

	const durationMs = annotation.textAnimation?.durationMs ?? 500;
	const regionDurationMs = annotation.endMs - annotation.startMs;
	const relativeMs = currentTimeMs - annotation.startMs;

	const inProgress = Math.min(1, relativeMs / durationMs);
	const outProgress = Math.min(1, (regionDurationMs - relativeMs) / durationMs);
	const easeIn = (t: number) => t * t;
	const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

	switch (preset) {
		case "fade-in":
			return { alpha: easeIn(inProgress), translateX: 0, translateY: 0, scale: 1 };
		case "fade-out":
			return { alpha: easeOut(outProgress), translateX: 0, translateY: 0, scale: 1 };
		case "fade-in-out": {
			const alpha = Math.min(easeIn(inProgress), easeOut(outProgress));
			return { alpha, translateX: 0, translateY: 0, scale: 1 };
		}
		case "slide-up": {
			const offset = (1 - easeIn(inProgress)) * 40;
			return { alpha: inProgress, translateX: 0, translateY: offset, scale: 1 };
		}
		case "slide-down": {
			const offset = (1 - easeIn(inProgress)) * -40;
			return { alpha: inProgress, translateX: 0, translateY: offset, scale: 1 };
		}
		case "slide-left": {
			const offset = (1 - easeIn(inProgress)) * 40;
			return { alpha: inProgress, translateX: offset, translateY: 0, scale: 1 };
		}
		case "slide-right": {
			const offset = (1 - easeIn(inProgress)) * -40;
			return { alpha: inProgress, translateX: offset, translateY: 0, scale: 1 };
		}
		case "scale-in": {
			const s = 0.5 + 0.5 * easeIn(inProgress);
			return { alpha: inProgress, translateX: 0, translateY: 0, scale: s };
		}
		case "bounce-in": {
			const t = easeIn(inProgress);
			const bounce =
				t < 0.8 ? t / 0.8 : 1 + Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.1;
			return { alpha: inProgress, translateX: 0, translateY: 0, scale: bounce };
		}
		case "typewriter":
			return { alpha: inProgress, translateX: 0, translateY: 0, scale: 1 };
		default:
			return { alpha: 1, translateX: 0, translateY: 0, scale: 1 };
	}
}
type PreviewCanvasSource = {
	width: number;
	height: number;
	clientWidth?: number;
	clientHeight?: number;
};

function buildBlurPolygonClipPath(points: Array<{ x: number; y: number }>) {
	if (points.length < 3) return undefined;
	const polygon = points.map((point) => `${point.x}% ${point.y}%`).join(", ");
	return `polygon(${polygon})`;
}

function buildBlurFreehandPath(points: Array<{ x: number; y: number }>, closed = true) {
	if (closed ? points.length < 3 : points.length < 2) return null;
	const [firstPoint, ...rest] = points;
	const path = `M ${firstPoint.x} ${firstPoint.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(" ")}`;
	return closed ? `${path} Z` : path;
}

interface AnnotationOverlayProps {
	annotation: AnnotationRegion;
	isSelected: boolean;
	containerWidth: number;
	containerHeight: number;
	onPositionChange: (id: string, position: { x: number; y: number }) => void;
	onSizeChange: (id: string, size: { width: number; height: number }) => void;
	onBlurDataChange?: (id: string, blurData: BlurData) => void;
	onBlurDataCommit?: () => void;
	onDrawingUpdate?: (id: string, pathPoints: Array<{ x: number; y: number }>) => void;
	onAddKeyframe?: (id: string, keyframe: AnnotationKeyframe) => void;
	onKeyframePositionChange?: (id: string, keyframeIndex: number, position: { x: number; y: number }) => void;
	currentTimeMs?: number;
	onClick: (id: string) => void;
	zIndex: number;
	isSelectedBoost: boolean;
	previewSourceCanvas?: PreviewCanvasSource | null;
	previewFrameVersion?: number;
}

export function AnnotationOverlay({
	annotation,
	isSelected,
	containerWidth,
	containerHeight,
	onPositionChange,
	onSizeChange,
	onBlurDataChange,
	onBlurDataCommit,
	onDrawingUpdate,
	onAddKeyframe,
	onKeyframePositionChange,
	currentTimeMs,
	onClick,
	zIndex,
	isSelectedBoost,
	previewSourceCanvas,
	previewFrameVersion,
}: AnnotationOverlayProps) {
	const committedX = (annotation.position.x / 100) * containerWidth;
	const committedY = (annotation.position.y / 100) * containerHeight;
	const committedWidth = (annotation.size.width / 100) * containerWidth;
	const committedHeight = (annotation.size.height / 100) * containerHeight;
	const blurShape = annotation.type === "blur" ? (annotation.blurData?.shape ?? "rectangle") : null;
	const isSelectedFreehandBlur = isSelected && blurShape === "freehand";
	const isDrawingAnnotation = annotation.type === "drawing" && isSelected;
	const isDraggingRef = useRef(false);
	const isDrawingFreehandRef = useRef(false);
	const freehandPointsRef = useRef<Array<{ x: number; y: number }>>([]);
	const isDrawingAnnotationRef = useRef(false);
	const drawingPointsRef = useRef<Array<{ x: number; y: number }>>([]);
	const [isFreehandDrawing, setIsFreehandDrawing] = useState(false);
	const [draftFreehandPoints, setDraftFreehandPoints] = useState<Array<{ x: number; y: number }>>(
		[],
	);
	const [livePointerPoint, setLivePointerPoint] = useState<{ x: number; y: number } | null>(null);
	const mosaicCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const blurType = annotation.type === "blur" ? (annotation.blurData?.type ?? "blur") : "blur";
	const blurOverlayColor =
		annotation.type === "blur" ? getBlurOverlayColor(annotation.blurData) : "";
	const mosaicGridOverlayColor =
		annotation.type === "blur" ? getMosaicGridOverlayColor(annotation.blurData) : "";
	const [liveRect, setLiveRect] = useState({
		x: committedX,
		y: committedY,
		width: committedWidth,
		height: committedHeight,
	});

	useEffect(() => {
		setLiveRect({
			x: committedX,
			y: committedY,
			width: committedWidth,
			height: committedHeight,
		});
	}, [committedHeight, committedWidth, committedX, committedY]);

	const { x, y, width, height } = liveRect;

	useEffect(() => {
		if (annotation.type !== "blur" || blurType !== "mosaic") {
			return;
		}
		void previewFrameVersion;

		const canvas = mosaicCanvasRef.current;
		const sourceCanvas = previewSourceCanvas;
		if (!canvas || !sourceCanvas) {
			return;
		}

		const sourceWidth = sourceCanvas.width;
		const sourceHeight = sourceCanvas.height;
		const sourceClientWidth = sourceCanvas.clientWidth || containerWidth || sourceWidth;
		const sourceClientHeight = sourceCanvas.clientHeight || containerHeight || sourceHeight;
		if (
			sourceWidth <= 0 ||
			sourceHeight <= 0 ||
			sourceClientWidth <= 0 ||
			sourceClientHeight <= 0
		) {
			return;
		}

		const drawWidth = Math.max(1, Math.round(width));
		const drawHeight = Math.max(1, Math.round(height));
		if (drawWidth <= 0 || drawHeight <= 0) {
			return;
		}

		canvas.width = drawWidth;
		canvas.height = drawHeight;

		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (!context) {
			return;
		}

		const scaleX = sourceWidth / sourceClientWidth;
		const scaleY = sourceHeight / sourceClientHeight;
		const sourceX = Math.max(0, Math.floor(x * scaleX));
		const sourceY = Math.max(0, Math.floor(y * scaleY));
		const sourceSampleWidth = Math.max(1, Math.ceil(drawWidth * scaleX));
		const sourceSampleHeight = Math.max(1, Math.ceil(drawHeight * scaleY));
		const clampedSampleWidth = Math.max(1, Math.min(sourceSampleWidth, sourceWidth - sourceX));
		const clampedSampleHeight = Math.max(1, Math.min(sourceSampleHeight, sourceHeight - sourceY));
		const blockSize = getNormalizedMosaicBlockSize(annotation.blurData);
		const downscaledWidth = Math.max(1, Math.round(drawWidth / blockSize));
		const downscaledHeight = Math.max(1, Math.round(drawHeight / blockSize));
		canvas.width = downscaledWidth;
		canvas.height = downscaledHeight;

		context.clearRect(0, 0, downscaledWidth, downscaledHeight);
		context.imageSmoothingEnabled = true;
		context.drawImage(
			sourceCanvas as CanvasImageSource,
			sourceX,
			sourceY,
			clampedSampleWidth,
			clampedSampleHeight,
			0,
			0,
			downscaledWidth,
			downscaledHeight,
		);
	}, [
		annotation,
		blurType,
		containerHeight,
		containerWidth,
		height,
		previewFrameVersion,
		previewSourceCanvas,
		width,
		x,
		y,
	]);

	const renderArrow = () => {
		const direction = annotation.figureData?.arrowDirection || "right";
		const color = annotation.figureData?.color || "#34B27B";
		const strokeWidth = annotation.figureData?.strokeWidth || 4;

		const ArrowComponent = getArrowComponent(direction);
		return <ArrowComponent color={color} strokeWidth={strokeWidth} />;
	};

	const normalizePoint = (event: PointerEvent<HTMLDivElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const x = ((event.clientX - rect.left) / rect.width) * 100;
		const y = ((event.clientY - rect.top) / rect.height) * 100;
		return {
			x: Math.max(0, Math.min(100, x)),
			y: Math.max(0, Math.min(100, y)),
		};
	};

	const appendFreehandPoint = (point: { x: number; y: number }) => {
		const points = freehandPointsRef.current;
		const lastPoint = points[points.length - 1];
		if (!lastPoint) {
			points.push(point);
			return;
		}
		const dx = point.x - lastPoint.x;
		const dy = point.y - lastPoint.y;
		// Sample freehand points in annotation-space percent units to avoid overly dense paths.
		if (Math.hypot(dx, dy) >= FREEHAND_POINT_THRESHOLD) {
			points.push(point);
		}
	};

	const handleFreehandPointerDown = (event: PointerEvent<HTMLDivElement>) => {
		if (
			!isSelected ||
			annotation.type !== "blur" ||
			annotation.blurData?.shape !== "freehand" ||
			!onBlurDataChange
		) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		isDrawingFreehandRef.current = true;
		setIsFreehandDrawing(true);
		const point = normalizePoint(event);
		freehandPointsRef.current = [point];
		setDraftFreehandPoints([point]);
		setLivePointerPoint(point);
	};

	const handleFreehandPointerMove = (event: PointerEvent<HTMLDivElement>) => {
		if (!isDrawingFreehandRef.current) return;
		event.preventDefault();
		event.stopPropagation();
		const point = normalizePoint(event);
		setLivePointerPoint(point);
		appendFreehandPoint(point);
		setDraftFreehandPoints([...freehandPointsRef.current]);
	};

	const finishFreehandPointer = (event: PointerEvent<HTMLDivElement>) => {
		if (!isDrawingFreehandRef.current || !onBlurDataChange) return;
		isDrawingFreehandRef.current = false;
		setIsFreehandDrawing(false);
		try {
			event.currentTarget.releasePointerCapture(event.pointerId);
		} catch {
			// no-op if already released
		}
		const points = [...freehandPointsRef.current];
		if (livePointerPoint) {
			const last = points[points.length - 1];
			if (!last || Math.hypot(last.x - livePointerPoint.x, last.y - livePointerPoint.y) > 0.001) {
				points.push(livePointerPoint);
			}
		}
		if (points.length >= 3) {
			const closedPoints = [...points];
			const first = closedPoints[0];
			const last = closedPoints[closedPoints.length - 1];
			if (Math.hypot(last.x - first.x, last.y - first.y) > 0.001) {
				closedPoints.push({ ...first });
			}
			onBlurDataChange(annotation.id, {
				...(annotation.blurData || { ...DEFAULT_BLUR_DATA, shape: "freehand" }),
				shape: "freehand",
				freehandPoints: closedPoints,
			});
			setDraftFreehandPoints(closedPoints);
			onBlurDataCommit?.();
		}
		setLivePointerPoint(null);
	};

	const normalizeDrawingPoint = (event: PointerEvent<SVGSVGElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		return {
			x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
			y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
		};
	};

	const handleDrawPointerDown = (event: PointerEvent<SVGSVGElement>) => {
		if (!isDrawingAnnotation || !onDrawingUpdate) return;
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		isDrawingAnnotationRef.current = true;
		const pt = normalizeDrawingPoint(event);
		drawingPointsRef.current = [pt];
		onDrawingUpdate(annotation.id, [pt]);
	};

	const handleDrawPointerMove = (event: PointerEvent<SVGSVGElement>) => {
		if (!isDrawingAnnotationRef.current || !onDrawingUpdate) return;
		event.preventDefault();
		const pt = normalizeDrawingPoint(event);
		const pts = drawingPointsRef.current;
		const last = pts[pts.length - 1];
		if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 0.5) return;
		drawingPointsRef.current = [...pts, pt];
		onDrawingUpdate(annotation.id, drawingPointsRef.current);
	};

	const handleDrawPointerUp = (event: PointerEvent<SVGSVGElement>) => {
		if (!isDrawingAnnotationRef.current) return;
		isDrawingAnnotationRef.current = false;
		try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* no-op */ }
	};

	const renderContent = () => {
		switch (annotation.type) {
			case "text":
				return (
					<div
						className="w-full h-full flex items-center p-2 overflow-hidden"
						style={{
							justifyContent:
								annotation.style.textAlign === "left"
									? "flex-start"
									: annotation.style.textAlign === "right"
										? "flex-end"
										: "center",
							alignItems: "center",
						}}
					>
						<span
							style={{
								color: annotation.style.color,
								backgroundColor: annotation.style.backgroundColor,
								fontSize: `${annotation.style.fontSize}px`,
								fontFamily: annotation.style.fontFamily,
								fontWeight: annotation.style.fontWeight,
								fontStyle: annotation.style.fontStyle,
								textDecoration: annotation.style.textDecoration,
								textAlign: annotation.style.textAlign,
								wordBreak: "break-word",
								whiteSpace: "pre-wrap",
								boxDecorationBreak: "clone",
								WebkitBoxDecorationBreak: "clone",
								padding: "0.1em 0.2em",
								borderRadius: "4px",
								lineHeight: "1.4",
							}}
						>
							{annotation.content}
						</span>
					</div>
				);

			case "image":
				if (annotation.content && annotation.content.startsWith("data:image")) {
					return (
						<img
							src={annotation.content}
							alt="Annotation"
							className="w-full h-full object-contain"
							draggable={false}
						/>
					);
				}
				return (
					<div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
						No image
					</div>
				);

			case "figure":
				if (!annotation.figureData) {
					return (
						<div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
							No arrow data
						</div>
					);
				}

				return (
					<div className="w-full h-full flex items-center justify-center p-2">{renderArrow()}</div>
				);

			case "blur": {
				const shape = annotation.blurData?.shape ?? "rectangle";
				const blurIntensity = Math.max(
					1,
					Math.round(annotation.blurData?.intensity ?? DEFAULT_BLUR_INTENSITY),
				);
				const blockSize = Math.max(
					1,
					Math.round(annotation.blurData?.blockSize ?? DEFAULT_BLUR_BLOCK_SIZE),
				);
				const activeFreehandPoints =
					shape === "freehand"
						? isFreehandDrawing
							? draftFreehandPoints
							: (annotation.blurData?.freehandPoints ?? [])
						: [];
				const drawingPoints =
					isFreehandDrawing && livePointerPoint
						? (() => {
								const last = activeFreehandPoints[activeFreehandPoints.length - 1];
								if (!last) return [livePointerPoint];
								const dx = livePointerPoint.x - last.x;
								const dy = livePointerPoint.y - last.y;
								return Math.hypot(dx, dy) > 0.01
									? [...activeFreehandPoints, livePointerPoint]
									: activeFreehandPoints;
							})()
						: activeFreehandPoints;
				const clipPath =
					shape === "freehand" ? buildBlurPolygonClipPath(activeFreehandPoints) : undefined;
				const freehandPath =
					shape === "freehand"
						? buildBlurFreehandPath(
								isFreehandDrawing ? drawingPoints : activeFreehandPoints,
								!isFreehandDrawing,
							)
						: null;
				const currentPointerPoint = isFreehandDrawing
					? livePointerPoint || drawingPoints[drawingPoints.length - 1] || null
					: null;
				const shapeBorderRadius = shape === "oval" ? "50%" : shape === "rectangle" ? "8px" : "0";
				const shouldShowFreehandBlurFill =
					shape !== "freehand" || (!!clipPath && !isFreehandDrawing);
				const shapeMaskStyle: CSSProperties = {
					borderRadius: shapeBorderRadius,
					clipPath: isFreehandDrawing ? undefined : clipPath,
					WebkitClipPath: isFreehandDrawing ? undefined : clipPath,
				};
				const isFreehandSelected = isSelectedFreehandBlur;
				return (
					<div className="w-full h-full relative">
						<div
							className="absolute inset-0 overflow-hidden"
							style={{
								...shapeMaskStyle,
								isolation: "isolate",
							}}
						>
							<div
								className="absolute inset-0"
								style={{
									...shapeMaskStyle,
									backdropFilter: blurType === "mosaic" ? "none" : `blur(${blurIntensity}px)`,
									WebkitBackdropFilter: blurType === "mosaic" ? "none" : `blur(${blurIntensity}px)`,
									backgroundColor: blurOverlayColor,
									opacity: shouldShowFreehandBlurFill ? 1 : 0,
								}}
							/>
							{blurType === "mosaic" && shouldShowFreehandBlurFill && (
								<canvas
									ref={mosaicCanvasRef}
									className="absolute inset-0 w-full h-full"
									style={{
										...shapeMaskStyle,
										imageRendering: "pixelated",
									}}
								/>
							)}
							{blurType === "mosaic" && shouldShowFreehandBlurFill && (
								<div
									className="absolute inset-0 pointer-events-none"
									style={{
										...shapeMaskStyle,
										backgroundColor: blurOverlayColor,
									}}
								/>
							)}
							{blurType === "mosaic" && (
								<div
									className="absolute inset-0 pointer-events-none"
									style={{
										...shapeMaskStyle,
										backgroundImage: `linear-gradient(${mosaicGridOverlayColor} 1px, transparent 1px), linear-gradient(90deg, ${mosaicGridOverlayColor} 1px, transparent 1px)`,
										backgroundSize: `${blockSize}px ${blockSize}px`,
										mixBlendMode: "screen",
										opacity: 0.35,
									}}
								/>
							)}
							{isSelected && shape !== "freehand" && (
								<div
									className="absolute inset-0 pointer-events-none border-2 border-[#34B27B]/80"
									style={{ borderRadius: shapeBorderRadius }}
								/>
							)}
						</div>
						{isSelected && shape === "freehand" && freehandPath && (
							<svg
								viewBox="0 0 100 100"
								preserveAspectRatio="none"
								className="absolute inset-0 pointer-events-none"
							>
								<path
									d={freehandPath}
									fill="none"
									stroke="#34B27B"
									strokeWidth="0.55"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
								{currentPointerPoint && (
									<circle
										cx={currentPointerPoint.x}
										cy={currentPointerPoint.y}
										r="0.6"
										fill="#34B27B"
									/>
								)}
							</svg>
						)}
						{isFreehandSelected && (
							<div
								className="absolute inset-0 cursor-crosshair"
								onPointerDown={handleFreehandPointerDown}
								onPointerMove={handleFreehandPointerMove}
								onPointerUp={finishFreehandPointer}
								onPointerCancel={finishFreehandPointer}
							/>
						)}
					</div>
				);
			}

			case "gif": {
				const frames = annotation.gifFrames;
				if (!frames || frames.length === 0) {
					return (
						<div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
							No GIF frames
						</div>
					);
				}
				return (
					<img
						src={frames[0].dataUrl}
						alt="GIF annotation"
						className="w-full h-full object-contain"
						draggable={false}
					/>
				);
			}

			case "drawing": {
				const points = annotation.pathPoints ?? [];
				const pathD =
					points.length >= 2
						? points.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ")
						: null;
				return (
					<svg
						viewBox="0 0 100 100"
						preserveAspectRatio="none"
						className="absolute inset-0 w-full h-full"
						style={{ cursor: isDrawingAnnotation ? "crosshair" : "default" }}
						onPointerDown={handleDrawPointerDown}
						onPointerMove={handleDrawPointerMove}
						onPointerUp={handleDrawPointerUp}
						onPointerCancel={handleDrawPointerUp}
					>
						{pathD && (
							<path
								d={pathD}
								fill="none"
								stroke={annotation.strokeColor ?? "#ff0000"}
								strokeWidth={annotation.strokeWidth ?? 4}
								strokeLinecap="round"
								strokeLinejoin="round"
								vectorEffect="non-scaling-stroke"
							/>
						)}
					</svg>
				);
			}

			default:
				return null;
		}
	};

	const positionKeyframes = (annotation.keyframes ?? [])
		.filter((kf) => kf.properties.position)
		.sort((a, b) => a.timeMs - b.timeMs);

	const buildCatmullRomPath = (pts: Array<{ x: number; y: number }>): string => {
		if (pts.length < 2) return "";
		const toSvg = (p: { x: number; y: number }) => ({
			x: (p.x / 100) * containerWidth,
			y: (p.y / 100) * containerHeight,
		});
		const svgPts = pts.map(toSvg);
		if (svgPts.length === 2) {
			return `M ${svgPts[0].x} ${svgPts[0].y} L ${svgPts[1].x} ${svgPts[1].y}`;
		}
		let d = `M ${svgPts[0].x} ${svgPts[0].y}`;
		for (let i = 0; i < svgPts.length - 1; i++) {
			const p0 = svgPts[Math.max(0, i - 1)];
			const p1 = svgPts[i];
			const p2 = svgPts[i + 1];
			const p3 = svgPts[Math.min(svgPts.length - 1, i + 2)];
			const cp1x = p1.x + (p2.x - p0.x) / 6;
			const cp1y = p1.y + (p2.y - p0.y) / 6;
			const cp2x = p2.x - (p3.x - p1.x) / 6;
			const cp2y = p2.y - (p3.y - p1.y) / 6;
			d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
		}
		return d;
	};

	const handleAddKeyframe = () => {
		if (!onAddKeyframe || currentTimeMs === undefined) return;
		onAddKeyframe(annotation.id, {
			timeMs: currentTimeMs,
			properties: {
				position: { ...annotation.position },
				size: { ...annotation.size },
			},
		});
	};

	// ── Compute live animation state for text annotations ────────────────────
	const animState =
		annotation.type === "text" &&
		annotation.textAnimation &&
		annotation.textAnimation.preset !== "none" &&
		currentTimeMs !== undefined
			? computeTextAnimation(annotation, currentTimeMs)
			: null;

	const animStyle: CSSProperties | undefined = animState
		? {
				opacity: animState.alpha,
				transform:
					animState.translateX !== 0 ||
					animState.translateY !== 0 ||
					animState.scale !== 1
						? `translate(${animState.translateX}px, ${animState.translateY}px) scale(${animState.scale})`
						: undefined,
				transformOrigin: "center center",
				pointerEvents: "none" as const,
		  }
		: undefined;

	// Full-frame images render as a static background layer, not a draggable Rnd
	if (annotation.type === "image" && annotation.imageFullFrame) {
		const fit = annotation.imageFit ?? "cover";
		const fitClass = fit === "fill" ? "object-fill" : fit === "contain" ? "object-contain" : "object-cover";
		return (
			<div
				className={cn("absolute inset-0", isSelected && "ring-2 ring-[#34B27B]")}
				style={{ zIndex, pointerEvents: isSelected ? "auto" : "none" }}
				onClick={() => onClick(annotation.id)}
			>
				{annotation.content && annotation.content.startsWith("data:image") && (
					<img
						src={annotation.content}
						alt="Background"
						className={cn("w-full h-full", fitClass)}
						draggable={false}
					/>
				)}
			</div>
		);
	}

	return (
		<>
		<Rnd
			position={{ x, y }}
			size={{ width, height }}
			onDragStart={() => {
				isDraggingRef.current = true;
			}}
			onDrag={(_e, d) => {
				setLiveRect((prev) => ({
					...prev,
					x: d.x,
					y: d.y,
				}));
			}}
			onDragStop={(_e, d) => {
				setLiveRect((prev) => ({
					...prev,
					x: d.x,
					y: d.y,
				}));
				const xPercent = (d.x / containerWidth) * 100;
				const yPercent = (d.y / containerHeight) * 100;
				onPositionChange(annotation.id, { x: xPercent, y: yPercent });

				// Reset dragging flag after a short delay to prevent click event
				setTimeout(() => {
					isDraggingRef.current = false;
				}, 100);
			}}
			onResize={(_e, _direction, ref, _delta, position) => {
				setLiveRect({
					x: position.x,
					y: position.y,
					width: ref.offsetWidth,
					height: ref.offsetHeight,
				});
			}}
			onResizeStop={(_e, _direction, ref, _delta, position) => {
				setLiveRect({
					x: position.x,
					y: position.y,
					width: ref.offsetWidth,
					height: ref.offsetHeight,
				});
				const xPercent = (position.x / containerWidth) * 100;
				const yPercent = (position.y / containerHeight) * 100;
				const widthPercent = (ref.offsetWidth / containerWidth) * 100;
				const heightPercent = (ref.offsetHeight / containerHeight) * 100;
				onPositionChange(annotation.id, { x: xPercent, y: yPercent });
				onSizeChange(annotation.id, { width: widthPercent, height: heightPercent });
			}}
			onClick={() => {
				if (isDraggingRef.current) return;
				onClick(annotation.id);
			}}
			bounds="parent"
			className={cn(
				"cursor-move",
				isSelected &&
					annotation.type !== "blur" &&
					"ring-2 ring-[#34B27B] ring-offset-2 ring-offset-transparent",
			)}
			style={{
				zIndex: isSelectedBoost ? zIndex + 1000 : zIndex, // Boost selected annotation to ensure it's on top
				pointerEvents: isSelected ? "auto" : "none",
				border:
					isSelected && annotation.type !== "blur" ? "2px solid rgba(52, 178, 123, 0.8)" : "none",
				backgroundColor:
					isSelected && annotation.type !== "blur" ? "rgba(52, 178, 123, 0.1)" : "transparent",
				boxShadow:
					isSelected && annotation.type !== "blur" ? "0 0 0 1px rgba(52, 178, 123, 0.35)" : "none",
			}}
			enableResizing={isSelected && !isSelectedFreehandBlur}
			disableDragging={!isSelected || isSelectedFreehandBlur}
			resizeHandleStyles={{
				topLeft: {
					width: "12px",
					height: "12px",
					backgroundColor: isSelected ? "white" : "transparent",
					border: isSelected ? "2px solid #34B27B" : "none",
					borderRadius: "50%",
					left: "-6px",
					top: "-6px",
					cursor: "nwse-resize",
				},
				topRight: {
					width: "12px",
					height: "12px",
					backgroundColor: isSelected ? "white" : "transparent",
					border: isSelected ? "2px solid #34B27B" : "none",
					borderRadius: "50%",
					right: "-6px",
					top: "-6px",
					cursor: "nesw-resize",
				},
				bottomLeft: {
					width: "12px",
					height: "12px",
					backgroundColor: isSelected ? "white" : "transparent",
					border: isSelected ? "2px solid #34B27B" : "none",
					borderRadius: "50%",
					left: "-6px",
					bottom: "-6px",
					cursor: "nesw-resize",
				},
				bottomRight: {
					width: "12px",
					height: "12px",
					backgroundColor: isSelected ? "white" : "transparent",
					border: isSelected ? "2px solid #34B27B" : "none",
					borderRadius: "50%",
					right: "-6px",
					bottom: "-6px",
					cursor: "nwse-resize",
				},
			}}
		>
			<div
				className={cn(
					"w-full h-full",
					annotation.type !== "blur" && "rounded-lg",
					annotation.type === "text" && "bg-transparent",
					annotation.type === "image" && "bg-transparent",
					annotation.type === "figure" && "bg-transparent",
					annotation.type === "blur" && "bg-transparent",
					isSelected && annotation.type !== "blur" && "shadow-lg",
				)}
				style={animStyle}
			>
				{renderContent()}
			</div>
			{isSelected && onAddKeyframe && currentTimeMs !== undefined && (
				<button
					type="button"
					onClick={(e) => { e.stopPropagation(); handleAddKeyframe(); }}
					className="absolute -top-6 right-0 bg-[#34B27B] text-white text-[9px] px-1.5 py-0.5 rounded shadow pointer-events-auto z-10 whitespace-nowrap"
					title="Add keyframe at current time"
				>
					◆ KF
				</button>
			)}
		</Rnd>
		{isSelected && positionKeyframes.length >= 2 && (
			<svg
				className="absolute inset-0 pointer-events-none overflow-visible"
				style={{ width: containerWidth, height: containerHeight, left: 0, top: 0, position: "absolute", zIndex: zIndex + 500 }}
			>
				<path
					d={buildCatmullRomPath(positionKeyframes.map((kf) => kf.properties.position!))}
					fill="none"
					stroke="#34B27B"
					strokeWidth={1.5}
					strokeDasharray="4 3"
					opacity={0.7}
				/>
				{positionKeyframes.map((kf, idx) => {
					const px = ((kf.properties.position?.x ?? 0) / 100) * containerWidth;
					const py = ((kf.properties.position?.y ?? 0) / 100) * containerHeight;
					return (
						<g
							key={idx}
							style={{ pointerEvents: "all", cursor: "move" }}
							onPointerDown={(e) => {
								if (!onKeyframePositionChange) return;
								e.stopPropagation();
								const startX = e.clientX;
								const startY = e.clientY;
								const startPx = kf.properties.position?.x ?? 0;
								const startPy = kf.properties.position?.y ?? 0;
								const onMove = (me: globalThis.PointerEvent) => {
									const dx = ((me.clientX - startX) / containerWidth) * 100;
									const dy = ((me.clientY - startY) / containerHeight) * 100;
									onKeyframePositionChange(annotation.id, idx, {
										x: Math.max(0, Math.min(100, startPx + dx)),
										y: Math.max(0, Math.min(100, startPy + dy)),
									});
								};
								const onUp = () => {
									window.removeEventListener("pointermove", onMove);
									window.removeEventListener("pointerup", onUp);
								};
								window.addEventListener("pointermove", onMove);
								window.addEventListener("pointerup", onUp);
							}}
						>
							<rect
								x={px - 5}
								y={py - 5}
								width={10}
								height={10}
								fill="#34B27B"
								stroke="white"
								strokeWidth={1.5}
								transform={`rotate(45 ${px} ${py})`}
							/>
						</g>
					);
				})}
			</svg>
		)}
	</>
	);
}
