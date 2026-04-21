import { useEffect } from "react";
import { computeFrameStepTime } from "@/lib/frameStep";
import { matchesShortcut, type ShortcutsConfig } from "@/lib/shortcuts";
import type { VideoPlaybackRef } from "../VideoPlayback";

interface UseEditorKeyboardParams {
	undo: () => void;
	redo: () => void;
	shortcuts: ShortcutsConfig;
	isMac: boolean;
	splitRegionAtPlayhead: () => void;
	videoPlaybackRef: React.RefObject<VideoPlaybackRef | null>;
	durationRef: React.RefObject<number>;
}

export function useEditorKeyboard({
	undo,
	redo,
	shortcuts,
	isMac,
	splitRegionAtPlayhead,
	videoPlaybackRef,
	durationRef,
}: UseEditorKeyboardParams): void {
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const mod = e.ctrlKey || e.metaKey;
			const key = e.key.toLowerCase();

			if (mod && key === "z" && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				undo();
				return;
			}
			if (mod && (key === "y" || (key === "z" && e.shiftKey))) {
				e.preventDefault();
				e.stopPropagation();
				redo();
				return;
			}

			// Frame-step navigation (arrow keys, no modifiers)
			if (
				(e.key === "ArrowLeft" || e.key === "ArrowRight") &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.shiftKey &&
				!e.altKey
			) {
				const target = e.target;
				if (
					target instanceof HTMLInputElement ||
					target instanceof HTMLTextAreaElement ||
					target instanceof HTMLSelectElement ||
					(target instanceof HTMLElement &&
						(target.isContentEditable ||
							target.closest('[role="separator"], [role="slider"], [role="spinbutton"]')))
				) {
					return;
				}
				e.preventDefault();
				const video = videoPlaybackRef.current?.video;
				if (!video) {
					return;
				}
				const direction = e.key === "ArrowLeft" ? "backward" : "forward";
				const newTime = computeFrameStepTime(
					video.currentTime,
					Number.isFinite(video.duration) ? video.duration : (durationRef.current ?? 0),
					direction,
				);
				video.currentTime = newTime;
				return;
			}

			const isInput =
				e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

			if (e.key === "Tab" && !isInput) {
				e.preventDefault();
			}

			if (matchesShortcut(e, shortcuts.playPause, isMac)) {
				// Allow space only in inputs/textareas
				if (isInput) {
					return;
				}
				e.preventDefault();
				const playback = videoPlaybackRef.current;
				if (playback?.video) {
					playback.video.paused ? playback.play().catch(console.error) : playback.pause();
				}
			}

			if (e.key === "s" && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && !isInput) {
				e.preventDefault();
				splitRegionAtPlayhead();
			}
		};

		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
	}, [undo, redo, shortcuts, isMac, splitRegionAtPlayhead, videoPlaybackRef, durationRef]);
}
