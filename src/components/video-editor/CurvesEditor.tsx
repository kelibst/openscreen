import { useCallback, useEffect, useRef, useState } from "react";
import type { CurvePoint, RgbCurves } from "./types";

const SIZE = 200;
const POINT_RADIUS = 6;

type Channel = "rgb" | "r" | "g" | "b";

function clamp01(v: number) {
	return Math.min(1, Math.max(0, v));
}

function evalBezier(pts: CurvePoint[], t: number): number {
	if (pts.length === 0) return t;
	const sorted = [...pts].sort((a, b) => a.x - b.x);
	const full = [{ x: 0, y: 0 }, ...sorted, { x: 1, y: 1 }];
	for (let i = 0; i < full.length - 1; i++) {
		if (t >= full[i].x && t <= full[i + 1].x) {
			const localT = (t - full[i].x) / (full[i + 1].x - full[i].x);
			return full[i].y + (full[i + 1].y - full[i].y) * localT;
		}
	}
	return t;
}

function buildLut(pts: CurvePoint[]): Uint8Array {
	const lut = new Uint8Array(256);
	for (let i = 0; i < 256; i++) {
		lut[i] = Math.round(clamp01(evalBezier(pts, i / 255)) * 255);
	}
	return lut;
}

export function applyRgbCurvesToImageData(imageData: ImageData, curves: RgbCurves): void {
	const rgbLut = buildLut(curves.rgb);
	const rLut = buildLut(curves.r);
	const gLut = buildLut(curves.g);
	const bLut = buildLut(curves.b);
	const data = imageData.data;
	for (let i = 0; i < data.length; i += 4) {
		data[i] = rLut[rgbLut[data[i]]];
		data[i + 1] = gLut[rgbLut[data[i + 1]]];
		data[i + 2] = bLut[rgbLut[data[i + 2]]];
	}
}

function drawCurve(ctx: CanvasRenderingContext2D, pts: CurvePoint[], color: string) {
	const sorted = [...pts].sort((a, b) => a.x - b.x);
	const full = [{ x: 0, y: 0 }, ...sorted, { x: 1, y: 1 }];
	ctx.beginPath();
	ctx.strokeStyle = color;
	ctx.lineWidth = 1.5;
	for (let i = 0; i <= SIZE; i++) {
		const t = i / SIZE;
		const v = evalBezier(pts, t);
		const px = t * SIZE;
		const py = (1 - v) * SIZE;
		if (i === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	}
	ctx.stroke();
	void full;
}

interface CurvesEditorProps {
	value?: RgbCurves;
	onChange: (curves: RgbCurves) => void;
}

const EMPTY_CURVES: RgbCurves = { rgb: [], r: [], g: [], b: [] };

const CHANNEL_COLORS: Record<Channel, string> = {
	rgb: "#ffffff",
	r: "#ef4444",
	g: "#22c55e",
	b: "#3b82f6",
};

export function CurvesEditor({ value, onChange }: CurvesEditorProps) {
	const curves = value ?? EMPTY_CURVES;
	const [activeChannel, setActiveChannel] = useState<Channel>("rgb");
	const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const currentPts = curves[activeChannel];

	const getPoint = useCallback((e: React.MouseEvent | React.PointerEvent): CurvePoint => {
		const rect = canvasRef.current!.getBoundingClientRect();
		return {
			x: clamp01((e.clientX - rect.left) / SIZE),
			y: clamp01(1 - (e.clientY - rect.top) / SIZE),
		};
	}, []);

	const updateChannel = useCallback((pts: CurvePoint[]) => {
		onChange({ ...curves, [activeChannel]: pts });
	}, [curves, activeChannel, onChange]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		ctx.clearRect(0, 0, SIZE, SIZE);

		ctx.fillStyle = "#111";
		ctx.fillRect(0, 0, SIZE, SIZE);

		ctx.strokeStyle = "#333";
		ctx.lineWidth = 0.5;
		for (let i = 1; i < 4; i++) {
			const pos = (i / 4) * SIZE;
			ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, SIZE); ctx.stroke();
			ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(SIZE, pos); ctx.stroke();
		}

		ctx.strokeStyle = "#444";
		ctx.lineWidth = 0.5;
		ctx.beginPath(); ctx.moveTo(0, SIZE); ctx.lineTo(SIZE, 0); ctx.stroke();

		drawCurve(ctx, currentPts, CHANNEL_COLORS[activeChannel]);

		for (const pt of currentPts) {
			const px = pt.x * SIZE;
			const py = (1 - pt.y) * SIZE;
			ctx.beginPath();
			ctx.arc(px, py, POINT_RADIUS / 2, 0, Math.PI * 2);
			ctx.fillStyle = CHANNEL_COLORS[activeChannel];
			ctx.fill();
			ctx.strokeStyle = "white";
			ctx.lineWidth = 1;
			ctx.stroke();
		}
	}, [currentPts, activeChannel]);

	const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
		e.currentTarget.setPointerCapture(e.pointerId);
		const pt = getPoint(e);
		const existing = currentPts.findIndex((p) => {
			const dx = (p.x - pt.x) * SIZE;
			const dy = (p.y - pt.y) * SIZE;
			return Math.hypot(dx, dy) < POINT_RADIUS * 1.5;
		});
		if (existing >= 0) {
			setDraggingIdx(existing);
		} else {
			const newPts = [...currentPts, pt];
			updateChannel(newPts);
			setDraggingIdx(newPts.length - 1);
		}
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (draggingIdx === null) return;
		const pt = getPoint(e);
		const newPts = currentPts.map((p, i) => (i === draggingIdx ? pt : p));
		updateChannel(newPts);
	};

	const handlePointerUp = () => {
		setDraggingIdx(null);
	};

	const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const pt = getPoint(e);
		const idx = currentPts.findIndex((p) => {
			const dx = (p.x - pt.x) * SIZE;
			const dy = (p.y - pt.y) * SIZE;
			return Math.hypot(dx, dy) < POINT_RADIUS * 1.5;
		});
		if (idx >= 0) {
			updateChannel(currentPts.filter((_, i) => i !== idx));
		}
	};

	return (
		<div ref={containerRef} className="flex flex-col gap-2">
			<div className="flex gap-1">
				{(["rgb", "r", "g", "b"] as Channel[]).map((ch) => (
					<button
						key={ch}
						type="button"
						onClick={() => setActiveChannel(ch)}
						className="flex-1 text-[10px] py-0.5 rounded border transition-all"
						style={{
							borderColor: activeChannel === ch ? CHANNEL_COLORS[ch] : "#333",
							color: activeChannel === ch ? CHANNEL_COLORS[ch] : "#666",
							backgroundColor: activeChannel === ch ? `${CHANNEL_COLORS[ch]}22` : "transparent",
						}}
					>
						{ch.toUpperCase()}
					</button>
				))}
				<button
					type="button"
					onClick={() => updateChannel([])}
					className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-slate-500 hover:text-slate-300 transition-all"
					title="Reset channel"
				>
					↺
				</button>
			</div>
			<canvas
				ref={canvasRef}
				width={SIZE}
				height={SIZE}
				className="rounded border border-white/10 cursor-crosshair"
				style={{ width: SIZE, height: SIZE }}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onDoubleClick={handleDoubleClick}
			/>
			<p className="text-[9px] text-slate-600">Click to add points · Double-click to remove</p>
		</div>
	);
}
