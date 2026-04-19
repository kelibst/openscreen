import { useCallback, useRef, useState } from "react";
import type {
	AnnotationRegion,
	AudioRegion,
	ClipRegion,
	ColorGrading,
	CropRegion,
	SpeedRegion,
	TrimRegion,
	WebcamLayoutPreset,
	WebcamMaskShape,
	WebcamPosition,
	WebcamSizePreset,
	ZoomRegion,
} from "@/components/video-editor/types";
import {
	DEFAULT_CROP_REGION,
	DEFAULT_WEBCAM_LAYOUT_PRESET,
	DEFAULT_WEBCAM_MASK_SHAPE,
	DEFAULT_WEBCAM_POSITION,
	DEFAULT_WEBCAM_SIZE_PRESET,
} from "@/components/video-editor/types";
import type { AspectRatio } from "@/utils/aspectRatioUtils";

// Undoable state — selection IDs are intentionally excluded (undoing a
// selection change would feel surprising to the user).
export interface EditorState {
	zoomRegions: ZoomRegion[];
	trimRegions: TrimRegion[];
	speedRegions: SpeedRegion[];
	annotationRegions: AnnotationRegion[];
	audioRegions: AudioRegion[];
	clipRegions: ClipRegion[];
	cropRegion: CropRegion;
	wallpaper: string;
	shadowIntensity: number;
	showBlur: boolean;
	motionBlurAmount: number;
	borderRadius: number;
	padding: number;
	aspectRatio: AspectRatio;
	webcamLayoutPreset: WebcamLayoutPreset;
	webcamMaskShape: WebcamMaskShape;
	webcamSizePreset: WebcamSizePreset;
	webcamPosition: WebcamPosition | null;
	colorGrading?: ColorGrading;
	faceBlurEnabled?: boolean;
	bgRemovalEnabled?: boolean;
	primaryAudioVolume: number;
	primaryAudioMuted: boolean;
	trackState: Record<string, { muted: boolean; locked: boolean; label: string }>;
}

export const INITIAL_EDITOR_STATE: EditorState = {
	zoomRegions: [],
	trimRegions: [],
	speedRegions: [],
	annotationRegions: [],
	audioRegions: [],
	clipRegions: [],
	cropRegion: DEFAULT_CROP_REGION,
	wallpaper: "/wallpapers/wallpaper1.jpg",
	shadowIntensity: 0,
	showBlur: false,
	motionBlurAmount: 0,
	borderRadius: 0,
	padding: 50,
	aspectRatio: "16:9",
	webcamLayoutPreset: DEFAULT_WEBCAM_LAYOUT_PRESET,
	webcamMaskShape: DEFAULT_WEBCAM_MASK_SHAPE,
	webcamSizePreset: DEFAULT_WEBCAM_SIZE_PRESET,
	webcamPosition: DEFAULT_WEBCAM_POSITION,
	primaryAudioVolume: 1.0,
	primaryAudioMuted: false,
	trackState: {
		"row-overlay": { muted: false, locked: false, label: "Overlay" },
		"row-clip": { muted: false, locked: false, label: "Video" },
		"row-audio-0": { muted: false, locked: false, label: "Audio 1" },
		"row-audio-1": { muted: false, locked: false, label: "Audio 2" },
		"row-audio-2": { muted: false, locked: false, label: "Audio 3" },
		"row-audio-3": { muted: false, locked: false, label: "Audio 4" },
		"row-effects": { muted: false, locked: false, label: "Effects" },
		"row-trim": { muted: false, locked: false, label: "Trim" },
	},
};

type StateUpdate = Partial<EditorState> | ((prev: EditorState) => Partial<EditorState>);

interface History {
	past: EditorState[];
	present: EditorState;
	future: EditorState[];
}

const MAX_HISTORY = 80;

function resolve(present: EditorState, update: StateUpdate): EditorState {
	const partial = typeof update === "function" ? update(present) : update;
	return { ...present, ...partial };
}

function withCheckpoint(history: History, newPresent: EditorState): History {
	return {
		past: [...history.past.slice(-(MAX_HISTORY - 1)), history.present],
		present: newPresent,
		future: [],
	};
}

export function useEditorHistory(initial: EditorState = INITIAL_EDITOR_STATE) {
	const [history, setHistory] = useState<History>({ past: [], present: initial, future: [] });

	// Tracks whether a live-update series (e.g. slider drag) is in progress.
	// The first updateState call saves the pre-interaction state as a checkpoint.
	const dirtyRef = useRef(false);

	const pushState = useCallback((update: StateUpdate) => {
		setHistory((prev) => withCheckpoint(prev, resolve(prev.present, update)));
		dirtyRef.current = false;
	}, []);

	const updateState = useCallback((update: StateUpdate) => {
		const isFirst = !dirtyRef.current;
		dirtyRef.current = true;
		setHistory((prev) => {
			const next = resolve(prev.present, update);
			return isFirst ? withCheckpoint(prev, next) : { ...prev, present: next };
		});
	}, []);

	const commitState = useCallback(() => {
		dirtyRef.current = false;
	}, []);

	const undo = useCallback(() => {
		setHistory((prev) => {
			if (!prev.past.length) return prev;
			const previous = prev.past[prev.past.length - 1];
			return {
				past: prev.past.slice(0, -1),
				present: previous,
				future: [prev.present, ...prev.future],
			};
		});
		dirtyRef.current = false;
	}, []);

	const redo = useCallback(() => {
		setHistory((prev) => {
			if (!prev.future.length) return prev;
			const [next, ...remainingFuture] = prev.future;
			return { past: [...prev.past, prev.present], present: next, future: remainingFuture };
		});
		dirtyRef.current = false;
	}, []);

	return {
		state: history.present,
		pushState,
		updateState,
		commitState,
		undo,
		redo,
		canUndo: history.past.length > 0,
		canRedo: history.future.length > 0,
	};
}
