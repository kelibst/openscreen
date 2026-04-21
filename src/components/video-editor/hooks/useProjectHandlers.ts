import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { INITIAL_EDITOR_STATE } from "@/hooks/useEditorHistory";
import type { EditorState } from "@/hooks/useEditorHistory";
import type { ExportFormat, ExportQuality, GifFrameRate, GifSizePreset } from "@/lib/exporter";
import { loadUserPreferences, saveUserPreferences } from "@/lib/userPreferences";
import {
	createProjectData,
	createProjectSnapshot,
	deriveNextId,
	fromFileUrl,
	hasProjectUnsavedChanges,
	normalizeProjectEditor,
	resolveProjectMedia,
	toFileUrl,
	validateProjectData,
} from "../projectPersistence";

interface UseProjectHandlersParams {
	editorState: EditorState;
	pushState: (update: Partial<EditorState> | ((prev: EditorState) => Partial<EditorState>)) => void;
	updateState: (update: Partial<EditorState> | ((prev: EditorState) => Partial<EditorState>)) => void;
	// Video path setters
	setVideoPath: (v: string | null) => void;
	setVideoSourcePath: (v: string | null) => void;
	setWebcamVideoPath: (v: string | null) => void;
	setWebcamVideoSourcePath: (v: string | null) => void;
	// Playback setters
	setIsPlaying: (v: boolean) => void;
	setCurrentTime: (v: number) => void;
	setDuration: (v: number) => void;
	setError: (v: string | null) => void;
	setLoading: (v: boolean) => void;
	// Selection resetters
	setSelectedZoomId: (v: string | null) => void;
	setSelectedTrimId: (v: string | null) => void;
	setSelectedSpeedId: (v: string | null) => void;
	setSelectedAnnotationId: (v: string | null) => void;
	setSelectedBlurId: (v: string | null) => void;
	setSelectedAudioId: (v: string | null) => void;
	setSelectedClipId: (v: string | null) => void;
	// Export setters
	setExportQuality: (v: ExportQuality) => void;
	setExportFormat: (v: ExportFormat) => void;
	setGifFrameRate: (v: GifFrameRate) => void;
	setGifLoop: (v: boolean) => void;
	setGifSizePreset: (v: GifSizePreset) => void;
	// ID ref setters
	nextZoomIdRef: React.MutableRefObject<number>;
	nextTrimIdRef: React.MutableRefObject<number>;
	nextSpeedIdRef: React.MutableRefObject<number>;
	nextAnnotationIdRef: React.MutableRefObject<number>;
	nextAnnotationZIndexRef: React.MutableRefObject<number>;
	// Playback ref for pause
	pausePlayback: () => void;
	// Translation
	t: (key: string, params?: Record<string, string>) => string;
	ts: (key: string) => string;
	// Export state needed for saveProject
	exportQuality: ExportQuality;
	exportFormat: ExportFormat;
	gifFrameRate: GifFrameRate;
	gifLoop: boolean;
	gifSizePreset: GifSizePreset;
	// Computed
	videoPath: string | null;
	currentProjectMedia: import("@/lib/recordingSession").ProjectMedia | null;
}

interface UseProjectHandlersResult {
	currentProjectPath: string | null;
	lastSavedSnapshot: string | null;
	hasUnsavedChanges: boolean;
	prefsHydrated: boolean;
	handleLoadProject: () => Promise<void>;
	handleSaveProject: () => Promise<void>;
	handleSaveProjectAs: () => Promise<void>;
	applyLoadedProject: (candidate: unknown, path?: string | null) => Promise<boolean>;
	currentProjectSnapshot: string | null;
}

export function useProjectHandlers({
	editorState,
	pushState,
	updateState,
	setVideoPath,
	setVideoSourcePath,
	setWebcamVideoPath,
	setWebcamVideoSourcePath,
	setIsPlaying,
	setCurrentTime,
	setDuration,
	setError,
	setLoading,
	setSelectedZoomId,
	setSelectedTrimId,
	setSelectedSpeedId,
	setSelectedAnnotationId,
	setSelectedBlurId,
	setSelectedAudioId,
	setSelectedClipId,
	setExportQuality,
	setExportFormat,
	setGifFrameRate,
	setGifLoop,
	setGifSizePreset,
	nextZoomIdRef,
	nextTrimIdRef,
	nextSpeedIdRef,
	nextAnnotationIdRef,
	nextAnnotationZIndexRef,
	pausePlayback,
	t,
	ts,
	exportQuality,
	exportFormat,
	gifFrameRate,
	gifLoop,
	gifSizePreset,
	videoPath,
	currentProjectMedia,
}: UseProjectHandlersParams): UseProjectHandlersResult {
	const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);
	const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);
	const [prefsHydrated, setPrefsHydrated] = useState(false);

	const {
		zoomRegions,
		trimRegions,
		speedRegions,
		annotationRegions,
		audioRegions,
		clipRegions,
		cropRegion,
		wallpaper,
		shadowIntensity,
		showBlur,
		motionBlurAmount,
		borderRadius,
		padding,
		aspectRatio,
		webcamLayoutPreset,
		webcamMaskShape,
		webcamSizePreset,
		webcamPosition,
		colorGrading,
	} = editorState;

	const applyLoadedProject = useCallback(
		async (candidate: unknown, path?: string | null) => {
			if (!validateProjectData(candidate)) {
				return false;
			}

			const project = candidate;
			const media = resolveProjectMedia(project);
			if (!media) {
				return false;
			}
			const sourcePath = fromFileUrl(media.screenVideoPath);
			const webcamSourcePath = media.webcamVideoPath ? fromFileUrl(media.webcamVideoPath) : null;
			const normalizedEditor = normalizeProjectEditor(project.editor);

			try {
				pausePlayback();
			} catch {
				// no-op
			}
			setIsPlaying(false);
			setCurrentTime(0);
			setDuration(0);

			setError(null);
			setVideoSourcePath(sourcePath);
			setVideoPath(toFileUrl(sourcePath));
			setWebcamVideoSourcePath(webcamSourcePath);
			setWebcamVideoPath(webcamSourcePath ? toFileUrl(webcamSourcePath) : null);
			setCurrentProjectPath(path ?? null);

			pushState({
				wallpaper: normalizedEditor.wallpaper,
				shadowIntensity: normalizedEditor.shadowIntensity,
				showBlur: normalizedEditor.showBlur,
				motionBlurAmount: normalizedEditor.motionBlurAmount,
				borderRadius: normalizedEditor.borderRadius,
				padding: normalizedEditor.padding,
				cropRegion: normalizedEditor.cropRegion,
				zoomRegions: normalizedEditor.zoomRegions,
				trimRegions: normalizedEditor.trimRegions,
				speedRegions: normalizedEditor.speedRegions,
				annotationRegions: normalizedEditor.annotationRegions,
				audioRegions: normalizedEditor.audioRegions,
				clipRegions: normalizedEditor.clipRegions,
				colorGrading: normalizedEditor.colorGrading,
				aspectRatio: normalizedEditor.aspectRatio,
				webcamLayoutPreset: normalizedEditor.webcamLayoutPreset,
				webcamMaskShape: normalizedEditor.webcamMaskShape,
				webcamSizePreset: normalizedEditor.webcamSizePreset,
				webcamPosition: normalizedEditor.webcamPosition,
			});
			setExportQuality(normalizedEditor.exportQuality);
			setExportFormat(normalizedEditor.exportFormat);
			setGifFrameRate(normalizedEditor.gifFrameRate);
			setGifLoop(normalizedEditor.gifLoop);
			setGifSizePreset(normalizedEditor.gifSizePreset);

			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedSpeedId(null);
			setSelectedAnnotationId(null);
			setSelectedBlurId(null);
			setSelectedAudioId(null);
			setSelectedClipId(null);

			nextZoomIdRef.current = deriveNextId(
				"zoom",
				normalizedEditor.zoomRegions.map((region) => region.id),
			);
			nextTrimIdRef.current = deriveNextId(
				"trim",
				normalizedEditor.trimRegions.map((region) => region.id),
			);
			nextSpeedIdRef.current = deriveNextId(
				"speed",
				normalizedEditor.speedRegions.map((region) => region.id),
			);
			nextAnnotationIdRef.current = deriveNextId(
				"annotation",
				normalizedEditor.annotationRegions.map((region) => region.id),
			);
			nextAnnotationZIndexRef.current =
				normalizedEditor.annotationRegions.reduce(
					(max, region) => Math.max(max, region.zIndex),
					0,
				) + 1;

			setLastSavedSnapshot(
				createProjectSnapshot(
					webcamSourcePath
						? { screenVideoPath: sourcePath, webcamVideoPath: webcamSourcePath }
						: { screenVideoPath: sourcePath },
					normalizedEditor,
				),
			);
			return true;
		},
		[
			pushState,
			pausePlayback,
			setIsPlaying,
			setCurrentTime,
			setDuration,
			setError,
			setVideoSourcePath,
			setVideoPath,
			setWebcamVideoSourcePath,
			setWebcamVideoPath,
			setExportQuality,
			setExportFormat,
			setGifFrameRate,
			setGifLoop,
			setGifSizePreset,
			setSelectedZoomId,
			setSelectedTrimId,
			setSelectedSpeedId,
			setSelectedAnnotationId,
			setSelectedBlurId,
			setSelectedAudioId,
			setSelectedClipId,
			nextZoomIdRef,
			nextTrimIdRef,
			nextSpeedIdRef,
			nextAnnotationIdRef,
			nextAnnotationZIndexRef,
		],
	);

	// Load initial data on mount
	useEffect(() => {
		async function loadInitialData() {
			try {
				const currentProjectResult = await window.electronAPI.loadCurrentProjectFile();
				if (currentProjectResult.success && currentProjectResult.project) {
					const restored = await applyLoadedProject(
						currentProjectResult.project,
						currentProjectResult.path ?? null,
					);
					if (restored) {
						return;
					}
				}

				const currentSessionResult = await window.electronAPI.getCurrentRecordingSession();
				if (currentSessionResult.success && currentSessionResult.session) {
					const session = currentSessionResult.session;
					const sourcePath = fromFileUrl(session.screenVideoPath);
					const webcamSourcePath = session.webcamVideoPath
						? fromFileUrl(session.webcamVideoPath)
						: null;
					setVideoSourcePath(sourcePath);
					setVideoPath(toFileUrl(sourcePath));
					setWebcamVideoSourcePath(webcamSourcePath);
					setWebcamVideoPath(webcamSourcePath ? toFileUrl(webcamSourcePath) : null);
					setCurrentProjectPath(null);
					setLastSavedSnapshot(
						createProjectSnapshot(
							webcamSourcePath
								? { screenVideoPath: sourcePath, webcamVideoPath: webcamSourcePath }
								: { screenVideoPath: sourcePath },
							INITIAL_EDITOR_STATE,
						),
					);
					return;
				}

				const result = await window.electronAPI.getCurrentVideoPath();
				if (result.success && result.path) {
					const sourcePath = fromFileUrl(result.path);
					setVideoSourcePath(sourcePath);
					setVideoPath(toFileUrl(sourcePath));
					setWebcamVideoSourcePath(null);
					setWebcamVideoPath(null);
					setCurrentProjectPath(null);
					setLastSavedSnapshot(
						createProjectSnapshot({ screenVideoPath: sourcePath }, INITIAL_EDITOR_STATE),
					);
				} else {
					setError("No video to load. Please record or select a video.");
				}
			} catch (err) {
				setError("Error loading video: " + String(err));
			} finally {
				setLoading(false);
			}
		}

		loadInitialData();
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [applyLoadedProject]);

	// Load persisted user preferences on mount (intentionally runs once)
	useEffect(() => {
		const prefs = loadUserPreferences();
		updateState({
			padding: prefs.padding,
			aspectRatio: prefs.aspectRatio,
		});
		setExportQuality(prefs.exportQuality);
		setExportFormat(prefs.exportFormat);
		setPrefsHydrated(true);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [updateState]);

	// Auto-save user preferences when settings change
	useEffect(() => {
		if (!prefsHydrated) return;
		saveUserPreferences({ padding, aspectRatio, exportQuality, exportFormat });
	}, [prefsHydrated, padding, aspectRatio, exportQuality, exportFormat]);

	const currentProjectSnapshot = currentProjectMedia
		? createProjectSnapshot(currentProjectMedia, {
				wallpaper,
				shadowIntensity,
				showBlur,
				motionBlurAmount,
				borderRadius,
				padding,
				cropRegion,
				zoomRegions,
				trimRegions,
				speedRegions,
				annotationRegions,
				audioRegions,
				clipRegions,
				colorGrading,
				aspectRatio,
				webcamLayoutPreset,
				webcamMaskShape,
				webcamPosition,
				exportQuality,
				exportFormat,
				gifFrameRate,
				gifLoop,
				gifSizePreset,
			})
		: null;

	const hasUnsavedChanges = hasProjectUnsavedChanges(currentProjectSnapshot, lastSavedSnapshot);

	const saveProject = useCallback(
		async (forceSaveAs: boolean) => {
			if (!videoPath) {
				toast.error(t("errors.noVideoLoaded"));
				return false;
			}

			if (!currentProjectMedia) {
				toast.error(t("errors.unableToDetermineSourcePath"));
				return false;
			}

			const projectData = createProjectData(currentProjectMedia, {
				wallpaper,
				shadowIntensity,
				showBlur,
				motionBlurAmount,
				borderRadius,
				padding,
				cropRegion,
				zoomRegions,
				trimRegions,
				speedRegions,
				annotationRegions,
				audioRegions,
				clipRegions,
				colorGrading,
				aspectRatio,
				webcamLayoutPreset,
				webcamMaskShape,
				webcamSizePreset,
				webcamPosition,
				exportQuality,
				exportFormat,
				gifFrameRate,
				gifLoop,
				gifSizePreset,
			});

			const fileNameBase =
				currentProjectMedia.screenVideoPath
					.split(/[\\/]/)
					.pop()
					?.replace(/\.[^.]+$/, "") || `project-${Date.now()}`;
			const projectSnapshot = JSON.stringify(projectData);
			const result = await window.electronAPI.saveProjectFile(
				projectData,
				fileNameBase,
				forceSaveAs ? undefined : (currentProjectPath ?? undefined),
			);

			if (result.canceled) {
				toast.info(t("project.saveCanceled"));
				return false;
			}

			if (!result.success) {
				toast.error(result.message || t("project.failedToSave"));
				return false;
			}

			if (result.path) {
				setCurrentProjectPath(result.path);
			}
			setLastSavedSnapshot(projectSnapshot);

			toast.success(t("project.savedTo", { path: result.path ?? "" }));
			return true;
		},
		[
			currentProjectMedia,
			currentProjectPath,
			wallpaper,
			shadowIntensity,
			showBlur,
			motionBlurAmount,
			borderRadius,
			padding,
			cropRegion,
			zoomRegions,
			trimRegions,
			speedRegions,
			annotationRegions,
			audioRegions,
			clipRegions,
			colorGrading,
			aspectRatio,
			webcamLayoutPreset,
			webcamMaskShape,
			webcamSizePreset,
			webcamPosition,
			exportQuality,
			exportFormat,
			gifFrameRate,
			gifLoop,
			gifSizePreset,
			videoPath,
			t,
		],
	);

	// Register onRequestSaveBeforeClose listener
	useEffect(() => {
		const cleanup = window.electronAPI.onRequestSaveBeforeClose(async () => {
			return saveProject(false);
		});
		return () => cleanup();
	}, [saveProject]);

	const handleSaveProject = useCallback(async () => {
		await saveProject(false);
	}, [saveProject]);

	const handleSaveProjectAs = useCallback(async () => {
		await saveProject(true);
	}, [saveProject]);

	const handleLoadProject = useCallback(async () => {
		const result = await window.electronAPI.loadProjectFile();

		if (result.canceled) {
			return;
		}

		if (!result.success) {
			toast.error(result.message || "Failed to load project");
			return;
		}

		const restored = await applyLoadedProject(result.project, result.path ?? null);
		if (!restored) {
			toast.error("Invalid project file format");
			return;
		}

		toast.success(`Project loaded from ${result.path}`);
	}, [applyLoadedProject]);

	// Register menu listeners
	useEffect(() => {
		const removeLoadListener = window.electronAPI.onMenuLoadProject(handleLoadProject);
		const removeSaveListener = window.electronAPI.onMenuSaveProject(handleSaveProject);
		const removeSaveAsListener = window.electronAPI.onMenuSaveProjectAs(handleSaveProjectAs);

		return () => {
			removeLoadListener?.();
			removeSaveListener?.();
			removeSaveAsListener?.();
		};
	}, [handleLoadProject, handleSaveProject, handleSaveProjectAs]);

	// Sync hasUnsavedChanges with the main process
	useEffect(() => {
		window.electronAPI.setHasUnsavedChanges(hasUnsavedChanges);
	}, [hasUnsavedChanges]);

	// Suppress ts warning — ts is used in saveProject indirectly via t
	void ts;

	return {
		currentProjectPath,
		lastSavedSnapshot,
		hasUnsavedChanges,
		prefsHydrated,
		handleLoadProject,
		handleSaveProject,
		handleSaveProjectAs,
		applyLoadedProject,
		currentProjectSnapshot,
	};
}
