import type { WebcamLayoutPreset } from "@/lib/compositeLayout";

export type ZoomDepth = 1 | 2 | 3 | 4 | 5 | 6;
export type ZoomFocusMode = "manual" | "auto";
export type { WebcamLayoutPreset };
/** Webcam size as a percentage of the canvas reference dimension (10–50). */
export type WebcamSizePreset = number;

export const DEFAULT_WEBCAM_SIZE_PRESET: WebcamSizePreset = 25;

export const DEFAULT_WEBCAM_LAYOUT_PRESET: WebcamLayoutPreset = "picture-in-picture";

export type WebcamMaskShape = "rectangle" | "circle" | "square" | "rounded";

export const DEFAULT_WEBCAM_MASK_SHAPE: WebcamMaskShape = "rectangle";

export interface WebcamPosition {
	cx: number; // normalized horizontal center (0-1)
	cy: number; // normalized vertical center (0-1)
}

export const DEFAULT_WEBCAM_POSITION: WebcamPosition | null = null;

export interface ZoomFocus {
	cx: number; // normalized horizontal center (0-1)
	cy: number; // normalized vertical center (0-1)
}

export interface ZoomRegion {
	id: string;
	startMs: number;
	endMs: number;
	depth: ZoomDepth;
	focus: ZoomFocus;
	focusMode?: ZoomFocusMode;
	zoomInDurationMs?: number;
	zoomOutDurationMs?: number;
}

export interface CursorTelemetryPoint {
	timeMs: number;
	cx: number;
	cy: number;
}

export interface TrimRegion {
	id: string;
	startMs: number;
	endMs: number;
}

export type AnnotationType = "text" | "image" | "figure" | "blur" | "gif" | "drawing";

export type ArrowDirection =
	| "up"
	| "down"
	| "left"
	| "right"
	| "up-right"
	| "up-left"
	| "down-right"
	| "down-left";

export interface FigureData {
	arrowDirection: ArrowDirection;
	color: string;
	strokeWidth: number;
}

export type BlurShape = "rectangle" | "oval" | "freehand";
export type BlurType = "blur" | "mosaic";
export type BlurColor = "white" | "black";

export const MIN_BLUR_INTENSITY = 2;
export const MAX_BLUR_INTENSITY = 40;
export const DEFAULT_BLUR_INTENSITY = 12;
export const MIN_BLUR_BLOCK_SIZE = 4;
export const MAX_BLUR_BLOCK_SIZE = 48;
export const DEFAULT_BLUR_BLOCK_SIZE = 12;

export interface BlurData {
	type: BlurType;
	shape: BlurShape;
	color: BlurColor;
	intensity: number;
	blockSize: number;
	// Points are normalized (0-100) within the annotation bounds.
	freehandPoints?: Array<{ x: number; y: number }>;
}

export interface AnnotationPosition {
	x: number;
	y: number;
}

export interface AnnotationSize {
	width: number;
	height: number;
}

export interface AnnotationTextStyle {
	color: string;
	backgroundColor: string;
	fontSize: number; // pixels
	fontFamily: string;
	fontWeight: "normal" | "bold";
	fontStyle: "normal" | "italic";
	textDecoration: "none" | "underline";
	textAlign: "left" | "center" | "right";
}

export interface AnnotationKeyframe {
	timeMs: number;
	properties: {
		position?: AnnotationPosition;
		size?: AnnotationSize;
		style?: Partial<AnnotationTextStyle>;
	};
}

export interface AnnotationRegion {
	id: string;
	startMs: number;
	endMs: number;
	type: AnnotationType;
	content: string; // Legacy - still used for current type
	textContent?: string; // Separate storage for text
	imageContent?: string; // Separate storage for image data URL
	position: AnnotationPosition;
	size: AnnotationSize;
	style: AnnotationTextStyle;
	zIndex: number;
	figureData?: FigureData;
	blurData?: BlurData;
	// Image options
	imageFullFrame?: boolean;
	imageFit?: "cover" | "contain" | "fill";
	// Text animation
	textAnimation?: TextAnimation;
	textOutlineColor?: string;
	textOutlineWidth?: number;
	letterSpacing?: number;
	lineHeight?: number;
	// GIF animation frames
	gifFrames?: Array<{ dataUrl: string; delayMs: number }>;
	// Drawing/pen tool
	pathPoints?: Array<{ x: number; y: number }>;
	strokeColor?: string;
	strokeWidth?: number;
	// Keyframe animation (P2-1 / P4-7)
	keyframes?: AnnotationKeyframe[];
	// Karaoke word timings (P4-8)
	wordTimings?: Array<{ word: string; startMs: number; endMs: number }>;
	isSubtitle?: boolean;
}

export const DEFAULT_ANNOTATION_POSITION: AnnotationPosition = {
	x: 50,
	y: 50,
};

export const DEFAULT_ANNOTATION_SIZE: AnnotationSize = {
	width: 30,
	height: 20,
};

export const DEFAULT_ANNOTATION_STYLE: AnnotationTextStyle = {
	color: "#ffffff",
	backgroundColor: "transparent",
	fontSize: 32,
	fontFamily: "Inter",
	fontWeight: "bold",
	fontStyle: "normal",
	textDecoration: "none",
	textAlign: "center",
};

export const DEFAULT_FIGURE_DATA: FigureData = {
	arrowDirection: "right",
	color: "#34B27B",
	strokeWidth: 4,
};

export const DEFAULT_BLUR_FREEHAND_POINTS: Array<{ x: number; y: number }> = [
	{ x: 10, y: 30 },
	{ x: 25, y: 10 },
	{ x: 55, y: 8 },
	{ x: 82, y: 20 },
	{ x: 90, y: 45 },
	{ x: 78, y: 72 },
	{ x: 52, y: 90 },
	{ x: 22, y: 84 },
	{ x: 8, y: 58 },
];

export const DEFAULT_BLUR_DATA: BlurData = {
	type: "blur",
	shape: "rectangle",
	color: "white",
	intensity: DEFAULT_BLUR_INTENSITY,
	blockSize: DEFAULT_BLUR_BLOCK_SIZE,
	freehandPoints: DEFAULT_BLUR_FREEHAND_POINTS,
};

export interface CropRegion {
	x: number;
	y: number;
	width: number;
	height: number;
}

export const DEFAULT_CROP_REGION: CropRegion = {
	x: 0,
	y: 0,
	width: 1,
	height: 1,
};

export type PlaybackSpeed = number;

export const MIN_PLAYBACK_SPEED = 0.1;
// Anything above 16x causes the playhead to stall during preview
// due to the video decoder not being able to keep up.
export const MAX_PLAYBACK_SPEED = 16;

export function clampPlaybackSpeed(speed: number): PlaybackSpeed {
	return Math.round(Math.min(MAX_PLAYBACK_SPEED, Math.max(MIN_PLAYBACK_SPEED, speed)) * 100) / 100;
}

export interface SpeedRegion {
	id: string;
	startMs: number;
	endMs: number;
	speed: PlaybackSpeed;
}

export const SPEED_OPTIONS: Array<{ speed: PlaybackSpeed; label: string }> = [
	{ speed: 0.25, label: "0.25×" },
	{ speed: 0.5, label: "0.5×" },
	{ speed: 0.75, label: "0.75×" },
	{ speed: 1.25, label: "1.25×" },
	{ speed: 1.5, label: "1.5×" },
	{ speed: 1.75, label: "1.75×" },
	{ speed: 2, label: "2×" },
	{ speed: 3, label: "3×" },
	{ speed: 4, label: "4×" },
	{ speed: 5, label: "5×" },
];

export const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 1.5;

export const ZOOM_DEPTH_SCALES: Record<ZoomDepth, number> = {
	1: 1.25,
	2: 1.5,
	3: 1.8,
	4: 2.2,
	5: 3.5,
	6: 5.0,
};

export const DEFAULT_ZOOM_DEPTH: ZoomDepth = 3;

// ── Audio regions ───────────────────────────────────────────────────────────

export interface AudioEqualizer {
	low: number;   // -12 to +12 dB, 200 Hz lowshelf
	mid: number;   // -12 to +12 dB, 1000 Hz peaking
	high: number;  // -12 to +12 dB, 4000 Hz highshelf
}

export interface AudioRegion {
	id: string;
	startMs: number;
	endMs: number;
	/** Trim-in point within the source file (ms). */
	sourceOffsetMs: number;
	/** Absolute filesystem path to the audio file. */
	sourcePath: string;
	/** 0.0 – 1.0 */
	volume: number;
	label?: string;
	equalizer?: AudioEqualizer;
	/** Fade-in duration in ms (0 = no fade). */
	fadeInMs?: number;
	/** Fade-out duration in ms (0 = no fade). */
	fadeOutMs?: number;
	/** Which audio track row this region lives on. Auto-assigned; grows dynamically. */
	trackIndex?: number;
}

export const DEFAULT_AUDIO_VOLUME = 0.8;

// ── Clip regions ────────────────────────────────────────────────────────────

export type TransitionType = "cut" | "fade" | "dissolve" | "wipe-left" | "wipe-right" | "slide-left";

export interface ClipRegion {
	id: string;
	startMs: number;
	endMs: number;
	/** Trim-in point within the source file (ms). */
	sourceOffsetMs: number;
	/** Absolute filesystem path to the video file. */
	sourcePath: string;
	label?: string;
	transitionIn?: TransitionType;
	transitionInDurationMs?: number;
	loop?: boolean;
	audioMuted?: boolean;
}

// ── Text animations ──────────────────────────────────────────────────────────

export type TextAnimationPreset =
	| "none"
	| "fade-in"
	| "fade-out"
	| "fade-in-out"
	| "slide-up"
	| "slide-down"
	| "slide-left"
	| "slide-right"
	| "typewriter"
	| "scale-in"
	| "bounce-in";

export interface TextAnimation {
	preset: TextAnimationPreset;
	/** Animation duration in ms (from start/end of the region). */
	durationMs: number;
}

// ── Color grading ────────────────────────────────────────────────────────────

export type ColorGradingPreset =
	| "none"
	| "vivid"
	| "matte"
	| "cinematic"
	| "warm"
	| "cool"
	| "vintage"
	| "noir";

export interface CurvePoint {
	x: number; // 0-1 input
	y: number; // 0-1 output
}

export interface RgbCurves {
	rgb: CurvePoint[];
	r: CurvePoint[];
	g: CurvePoint[];
	b: CurvePoint[];
}

export interface ColorGrading {
	brightness: number; // -1 to 1
	contrast: number;   // -1 to 1
	saturation: number; // -1 to 1
	hue: number;        // -180 to 180 degrees
	preset?: ColorGradingPreset;
	rgbCurves?: RgbCurves;
}

export function clampFocusToDepth(focus: ZoomFocus, _depth: ZoomDepth): ZoomFocus {
	return {
		cx: clamp(focus.cx, 0, 1),
		cy: clamp(focus.cy, 0, 1),
	};
}

function clamp(value: number, min: number, max: number) {
	if (Number.isNaN(value)) return (min + max) / 2;
	return Math.min(max, Math.max(min, value));
}
