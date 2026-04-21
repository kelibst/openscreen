import { FolderOpen, Languages, Save, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useI18n, useScopedT } from "@/contexts/I18nContext";
import { useShortcuts } from "@/contexts/ShortcutsContext";
import { INITIAL_EDITOR_STATE, useEditorHistory } from "@/hooks/useEditorHistory";
import { type Locale } from "@/i18n/config";
import { getAvailableLocales, getLocaleName } from "@/i18n/loader";
import {
	calculateOutputDimensions,
	type ExportFormat,
	type ExportQuality,
	GIF_SIZE_PRESETS,
	type GifFrameRate,
	type GifSizePreset,
} from "@/lib/exporter";
import type { ProjectMedia } from "@/lib/recordingSession";
import {
	getAspectRatioValue,
	getNativeAspectRatioValue,
	isPortraitAspectRatio,
} from "@/utils/aspectRatioUtils";
import { useAnnotationHandlers } from "./hooks/useAnnotationHandlers";
import { useRegionHandlers } from "./hooks/useRegionHandlers";
import { useEditorKeyboard } from "./hooks/useEditorKeyboard";
import { useExportHandlers } from "./hooks/useExportHandlers";
import { useProjectHandlers } from "./hooks/useProjectHandlers";
import AudioSettingsPanel from "./AudioSettingsPanel";
import ClipSettingsPanel from "./ClipSettingsPanel";
import StickerPickerPanel from "./StickerPickerPanel";
import TextPresetsPanel from "./TextPresetsPanel";
import { ExportDialog } from "./ExportDialog";
import PlaybackControls from "./PlaybackControls";
import { fromFileUrl } from "./projectPersistence";
import { SettingsPanel } from "./SettingsPanel";
import TimelineEditor from "./timeline/TimelineEditor";
import { type CursorTelemetryPoint } from "./types";
import VideoPlayback, { VideoPlaybackRef } from "./VideoPlayback";
import { TRANSITION_WINDOW_MS, ZOOM_IN_TRANSITION_WINDOW_MS } from "./videoPlayback/constants";

export default function VideoEditor() {
	const {
		state: editorState,
		pushState,
		updateState,
		commitState,
		undo,
		redo,
	} = useEditorHistory(INITIAL_EDITOR_STATE);

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

	// ── Non-undoable state
	const [videoPath, setVideoPath] = useState<string | null>(null);
	const [videoSourcePath, setVideoSourcePath] = useState<string | null>(null);
	const [webcamVideoPath, setWebcamVideoPath] = useState<string | null>(null);
	const [webcamVideoSourcePath, setWebcamVideoSourcePath] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const currentTimeRef = useRef(currentTime);
	currentTimeRef.current = currentTime;
	const durationRef = useRef(duration);
	durationRef.current = duration;
	const [cursorTelemetry, setCursorTelemetry] = useState<CursorTelemetryPoint[]>([]);
	const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
	const [selectedTrimId, setSelectedTrimId] = useState<string | null>(null);
	const [selectedSpeedId, setSelectedSpeedId] = useState<string | null>(null);
	const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
	const [selectedBlurId, setSelectedBlurId] = useState<string | null>(null);
	const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
	const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
	const [showNewRecordingDialog, setShowNewRecordingDialog] = useState(false);
	const [exportQuality, setExportQuality] = useState<ExportQuality>("good");
	const [exportFormat, setExportFormat] = useState<ExportFormat>("mp4");
	const [gifFrameRate, setGifFrameRate] = useState<GifFrameRate>(15);
	const [gifLoop, setGifLoop] = useState(true);
	const [gifSizePreset, setGifSizePreset] = useState<GifSizePreset>("medium");
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [showStickerPicker, setShowStickerPicker] = useState(false);
	const [showTextPresets, setShowTextPresets] = useState(false);

	const playerContainerRef = useRef<HTMLDivElement>(null);
	const videoPlaybackRef = useRef<VideoPlaybackRef>(null);

	const nextZoomIdRef = useRef(1);
	const nextTrimIdRef = useRef(1);
	const nextSpeedIdRef = useRef(1);

	const { shortcuts, isMac } = useShortcuts();
	const t = useScopedT("editor");
	const ts = useScopedT("settings");
	const availableLocales = getAvailableLocales();
	const { locale, setLocale } = useI18n();

	const nextAnnotationIdRef = useRef(1);
	const nextAnnotationZIndexRef = useRef(1);
	const nextAudioIdRef = useRef(1);
	const nextClipIdRef = useRef(1);

	const annotationOnlyRegions = useMemo(
		() => annotationRegions.filter((region) => region.type !== "blur"),
		[annotationRegions],
	);
	const blurRegions = useMemo(
		() => annotationRegions.filter((region) => region.type === "blur"),
		[annotationRegions],
	);

	const currentProjectMedia = useMemo<ProjectMedia | null>(() => {
		const screenVideoPath = videoSourcePath ?? (videoPath ? fromFileUrl(videoPath) : null);
		if (!screenVideoPath) {
			return null;
		}

		const webcamSourcePath =
			webcamVideoSourcePath ?? (webcamVideoPath ? fromFileUrl(webcamVideoPath) : null);
		return webcamSourcePath
			? { screenVideoPath, webcamVideoPath: webcamSourcePath }
			: { screenVideoPath };
	}, [videoPath, videoSourcePath, webcamVideoPath, webcamVideoSourcePath]);

	const {
		handleLoadProject,
		handleSaveProject,
	} = useProjectHandlers({
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
		pausePlayback: () => { videoPlaybackRef.current?.pause(); },
		t,
		ts,
		exportQuality,
		exportFormat,
		gifFrameRate,
		gifLoop,
		gifSizePreset,
		videoPath,
		currentProjectMedia,
	});

	const {
		isExporting,
		exportProgress,
		exportError,
		showExportDialog,
		setShowExportDialog,
		exportedFilePath,
		unsavedExport,
		handleOpenExportDialog,
		handleCancelExport,
		handleShowExportedFile,
		handleSaveUnsavedExport,
	} = useExportHandlers({
		editorState,
		videoPath,
		webcamVideoPath,
		isPlaying,
		exportQuality,
		exportFormat,
		gifFrameRate,
		gifLoop,
		gifSizePreset,
		videoPlaybackRef,
		cursorTelemetry,
	});

	const {
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
	} = useAnnotationHandlers({
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
	});

	// Synthesize the primary ClipRegion once we know the video duration.
	// This ensures the clip row is always populated with at least the recording.
	useEffect(() => {
		if (duration > 0 && videoSourcePath && clipRegions.length === 0) {
			pushState(() => ({
				clipRegions: [
					{
						id: "clip-primary",
						startMs: 0,
						endMs: Math.round(duration * 1000),
						sourceOffsetMs: 0,
						sourcePath: videoSourcePath,
						label: "Primary Recording",
					},
				],
			}));
		}
		// Only run when duration or video path changes; clipRegions check prevents re-triggering
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [duration, videoSourcePath]);

	const handleNewRecordingConfirm = useCallback(async () => {
		const result = await window.electronAPI.startNewRecording();
		if (result.success) {
			setShowNewRecordingDialog(false);
		} else {
			console.error("Failed to start new recording:", result.error);
			setError("Failed to start new recording: " + (result.error || "Unknown error"));
		}
	}, []);

	useEffect(() => {
		let mounted = true;

		async function loadCursorTelemetry() {
			const sourcePath = currentProjectMedia?.screenVideoPath ?? null;

			if (!sourcePath) {
				if (mounted) {
					setCursorTelemetry([]);
				}
				return;
			}

			try {
				const result = await window.electronAPI.getCursorTelemetry(sourcePath);
				if (mounted) {
					setCursorTelemetry(result.success ? result.samples : []);
				}
			} catch (telemetryError) {
				console.warn("Unable to load cursor telemetry:", telemetryError);
				if (mounted) {
					setCursorTelemetry([]);
				}
			}
		}

		loadCursorTelemetry();

		return () => {
			mounted = false;
		};
	}, [currentProjectMedia]);

	function togglePlayPause() {
		const playback = videoPlaybackRef.current;
		const video = playback?.video;
		if (!playback || !video) return;

		if (isPlaying) {
			playback.pause();
		} else {
			playback.play().catch((err) => console.error("Video play failed:", err));
		}
	}

	const toggleFullscreen = useCallback(() => {
		setIsFullscreen((prev) => !prev);
	}, []);

	useEffect(() => {
		if (!isFullscreen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setIsFullscreen(false);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isFullscreen]);

	function handleSeek(time: number) {
		const video = videoPlaybackRef.current?.video;
		if (!video) return;
		video.currentTime = time;
	}


	const {
		handleSelectZoom,
		handleSelectTrim,
		handleSelectAnnotation,
		handleSelectBlur,
		handleSelectSpeed,
		handleSelectAudio,
		handleSelectClip,
		handleZoomAdded,
		handleZoomSuggested,
		handleTrimAdded,
		handleZoomSpanChange,
		handleTrimSpanChange,
		handleZoomFocusChange,
		handleZoomDepthChange,
		handleZoomFocusModeChange,
		handleZoomDelete,
		handleTrimDelete,
		handleSpeedAdded,
		handleSpeedSpanChange,
		handleSpeedDelete,
		handleSpeedChange,
		handleAudioAdded,
		handleAudioSpanChange,
		handleAudioDelete,
		handleAudioVolumeChange,
		handleAudioLabelChange,
		handleAudioEqualizerChange,
		handleAudioFadeChange,
		handleClipAdded,
		handleClipSpanChange,
		handleClipDelete,
		handleClipLabelChange,
		handleClipTransitionChange,
		handleClipUpdate,
		handleExtractAudio,
		splitRegionAtPlayhead,
		handleImageAdded,
		handleAnnotationAdded,
		handleBlurAdded,
		handleZoomDurationChange,
		handleAnnotationSpanChange,
		handleAnnotationDelete,
	} = useRegionHandlers({
		pushState,
		updateState,
		selectedZoomId,
		setSelectedZoomId,
		selectedTrimId,
		setSelectedTrimId,
		selectedSpeedId,
		setSelectedSpeedId,
		selectedAnnotationId,
		setSelectedAnnotationId,
		selectedBlurId,
		setSelectedBlurId,
		selectedAudioId,
		setSelectedAudioId,
		selectedClipId,
		setSelectedClipId,
		nextZoomIdRef,
		nextTrimIdRef,
		nextSpeedIdRef,
		nextAnnotationIdRef,
		nextAnnotationZIndexRef,
		nextAudioIdRef,
		nextClipIdRef,
		currentTimeRef,
	});


	useEditorKeyboard({
		undo,
		redo,
		shortcuts,
		isMac,
		splitRegionAtPlayhead,
		videoPlaybackRef,
		durationRef,
	});

	useEffect(() => {
		if (selectedZoomId && !zoomRegions.some((region) => region.id === selectedZoomId)) {
			setSelectedZoomId(null);
		}
	}, [selectedZoomId, zoomRegions]);

	useEffect(() => {
		if (selectedTrimId && !trimRegions.some((region) => region.id === selectedTrimId)) {
			setSelectedTrimId(null);
		}
	}, [selectedTrimId, trimRegions]);

	useEffect(() => {
		if (
			selectedAnnotationId &&
			!annotationOnlyRegions.some((region) => region.id === selectedAnnotationId)
		) {
			setSelectedAnnotationId(null);
		}
		if (selectedBlurId && !blurRegions.some((region) => region.id === selectedBlurId)) {
			setSelectedBlurId(null);
		}
	}, [selectedAnnotationId, selectedBlurId, annotationOnlyRegions, blurRegions]);

	useEffect(() => {
		if (selectedSpeedId && !speedRegions.some((region) => region.id === selectedSpeedId)) {
			setSelectedSpeedId(null);
		}
	}, [selectedSpeedId, speedRegions]);


	if (loading) {
		return (
			<div className="flex items-center justify-center h-screen bg-background">
				<div className="text-foreground">Loading video...</div>
			</div>
		);
	}
	if (error) {
		return (
			<div className="flex items-center justify-center h-screen bg-background">
				<div className="flex flex-col items-center gap-3">
					<div className="text-destructive">{error}</div>
					<button
						type="button"
						onClick={handleLoadProject}
						className="px-3 py-1.5 rounded-md bg-[#34B27B] text-white text-sm hover:bg-[#34B27B]/90"
					>
						Load Project File
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-screen bg-[#09090b] text-slate-200 overflow-hidden selection:bg-[#34B27B]/30">
			<Dialog open={showNewRecordingDialog} onOpenChange={setShowNewRecordingDialog}>
				<DialogContent
					className="sm:max-w-[425px]"
					style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
				>
					<DialogHeader>
						<DialogTitle>{t("newRecording.title")}</DialogTitle>
						<DialogDescription>{t("newRecording.description")}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<button
							type="button"
							onClick={() => setShowNewRecordingDialog(false)}
							className="px-4 py-2 rounded-md bg-white/10 text-white hover:bg-white/20 text-sm font-medium transition-colors"
						>
							{t("newRecording.cancel")}
						</button>
						<button
							type="button"
							onClick={handleNewRecordingConfirm}
							className="px-4 py-2 rounded-md bg-[#34B27B] text-white hover:bg-[#34B27B]/90 text-sm font-medium transition-colors"
						>
							{t("newRecording.confirm")}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<div
				className="h-10 flex-shrink-0 bg-[#09090b]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6 z-50"
				style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
			>
				<div
					className="flex-1 flex items-center gap-1"
					style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
				>
					<div
						className={`flex items-center gap-1 px-2 py-1 rounded-md text-white/50 hover:text-white/90 hover:bg-white/10 transition-all duration-150 ${isMac ? "ml-14" : "ml-2"}`}
					>
						<Languages size={14} />
						<select
							value={locale}
							onChange={(e) => setLocale(e.target.value as Locale)}
							className="bg-transparent text-[11px] font-medium outline-none cursor-pointer appearance-none pr-1"
							style={{ color: "inherit" }}
						>
							{availableLocales.map((loc) => (
								<option key={loc} value={loc} className="bg-[#09090b] text-white">
									{getLocaleName(loc)}
								</option>
							))}
						</select>
					</div>
					<button
						type="button"
						onClick={() => setShowNewRecordingDialog(true)}
						className="flex items-center gap-1 px-2 py-1 rounded-md text-white/50 hover:text-white/90 hover:bg-white/10 transition-all duration-150 text-[11px] font-medium"
					>
						<Video size={14} />
						{t("newRecording.title")}
					</button>
					<button
						type="button"
						onClick={handleLoadProject}
						className="flex items-center gap-1 px-2 py-1 rounded-md text-white/50 hover:text-white/90 hover:bg-white/10 transition-all duration-150 text-[11px] font-medium"
					>
						<FolderOpen size={14} />
						{ts("project.load")}
					</button>
					<button
						type="button"
						onClick={handleSaveProject}
						className="flex items-center gap-1 px-2 py-1 rounded-md text-white/50 hover:text-white/90 hover:bg-white/10 transition-all duration-150 text-[11px] font-medium"
					>
						<Save size={14} />
						{ts("project.save")}
					</button>
				</div>
			</div>

			<div className="flex-1 p-5 gap-4 flex min-h-0 relative">
				{/* Left Column - Video & Timeline */}
				<div className="flex-[7] flex flex-col gap-3 min-w-0 h-full">
					<PanelGroup direction="vertical" className="gap-3">
						{/* Top section: video preview and controls */}
						<Panel defaultSize={70} maxSize={70} minSize={40}>
							<div
								ref={playerContainerRef}
								className={
									isFullscreen
										? "fixed inset-0 z-[99999] w-full h-full flex flex-col items-center justify-center bg-[#09090b]"
										: "w-full h-full flex flex-col items-center justify-center bg-black/40 rounded-2xl border border-white/5 shadow-2xl overflow-hidden relative"
								}
							>
								{/* Video preview */}
								<div className="w-full flex justify-center items-center flex-auto mt-1.5">
									<div
										className="relative flex justify-center items-center w-auto h-full max-w-full box-border"
										style={{
											aspectRatio:
												aspectRatio === "native"
													? getNativeAspectRatioValue(
															videoPlaybackRef.current?.video?.videoWidth || 1920,
															videoPlaybackRef.current?.video?.videoHeight || 1080,
															cropRegion,
														)
													: getAspectRatioValue(aspectRatio),
										}}
									>
										<VideoPlayback
											key={`${videoPath || "no-video"}:${webcamVideoPath || "no-webcam"}`}
											aspectRatio={aspectRatio}
											ref={videoPlaybackRef}
											videoPath={videoPath || ""}
											webcamVideoPath={webcamVideoPath || undefined}
											webcamLayoutPreset={webcamLayoutPreset}
											webcamMaskShape={webcamMaskShape}
											webcamSizePreset={webcamSizePreset}
											webcamPosition={webcamPosition}
											onWebcamPositionChange={(pos) => updateState({ webcamPosition: pos })}
											onWebcamPositionDragEnd={commitState}
											onDurationChange={setDuration}
											onTimeUpdate={setCurrentTime}
											currentTime={currentTime}
											onPlayStateChange={setIsPlaying}
											onError={setError}
											wallpaper={wallpaper}
											zoomRegions={zoomRegions}
											selectedZoomId={selectedZoomId}
											onSelectZoom={handleSelectZoom}
											onZoomFocusChange={handleZoomFocusChange}
											onZoomFocusDragEnd={commitState}
											isPlaying={isPlaying}
											showShadow={shadowIntensity > 0}
											shadowIntensity={shadowIntensity}
											showBlur={showBlur}
											motionBlurAmount={motionBlurAmount}
											borderRadius={borderRadius}
											padding={padding}
											cropRegion={cropRegion}
											trimRegions={trimRegions}
											speedRegions={speedRegions}
											annotationRegions={annotationOnlyRegions}
											selectedAnnotationId={selectedAnnotationId}
											onSelectAnnotation={handleSelectAnnotation}
											onAnnotationPositionChange={handleAnnotationPositionChange}
											onAnnotationSizeChange={handleAnnotationSizeChange}
											blurRegions={blurRegions}
											selectedBlurId={selectedBlurId}
											onSelectBlur={handleSelectBlur}
											onBlurPositionChange={handleAnnotationPositionChange}
											onBlurSizeChange={handleAnnotationSizeChange}
											onBlurDataChange={handleBlurDataPreviewChange}
											onBlurDataCommit={commitState}
											onDrawingUpdate={handleDrawingUpdate}
											cursorTelemetry={cursorTelemetry}
											clipRegions={clipRegions}
											faceBlurEnabled={editorState.faceBlurEnabled ?? false}
											bgRemovalEnabled={editorState.bgRemovalEnabled ?? false}
											onAddKeyframe={handleAnnotationAddKeyframe}
											onKeyframePositionChange={handleKeyframePositionChange}
										/>
									</div>
								</div>
								{/* Playback controls */}
								<div className="w-full flex justify-center items-center h-12 flex-shrink-0 px-3 py-1.5 my-1.5 gap-2">
									<div className="w-full max-w-[700px]">
										<PlaybackControls
											isPlaying={isPlaying}
											currentTime={currentTime}
											duration={duration}
											isFullscreen={isFullscreen}
											onToggleFullscreen={toggleFullscreen}
											onTogglePlayPause={togglePlayPause}
											onSeek={handleSeek}
										/>
									</div>
									<button
										type="button"
										onClick={splitRegionAtPlayhead}
										title="Split at playhead (S)"
										className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 transition-all text-[10px] font-medium flex-shrink-0"
									>
										<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
											<path d="M6 1v10M2 4l4-3 4 3M2 8l4 3 4-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
										</svg>
										Split
									</button>
								</div>
							</div>
						</Panel>

						<PanelResizeHandle className="bg-[#09090b]/80 hover:bg-[#09090b] transition-colors rounded-full flex items-center justify-center">
							<div className="w-8 h-1 bg-white/20 rounded-full"></div>
						</PanelResizeHandle>

						{/* Timeline section */}
						<Panel defaultSize={30} maxSize={60} minSize={30}>
							<div className="h-full bg-[#09090b] rounded-2xl border border-white/5 shadow-lg overflow-hidden flex flex-col">
								<TimelineEditor
									videoDuration={duration}
									currentTime={currentTime}
									onSeek={handleSeek}
									cursorTelemetry={cursorTelemetry}
									zoomRegions={zoomRegions}
									onZoomAdded={handleZoomAdded}
									onZoomSuggested={handleZoomSuggested}
									onZoomSpanChange={handleZoomSpanChange}
									onZoomDurationChange={handleZoomDurationChange}
									onZoomDelete={handleZoomDelete}
									selectedZoomId={selectedZoomId}
									onSelectZoom={handleSelectZoom}
									trimRegions={trimRegions}
									onTrimAdded={handleTrimAdded}
									onTrimSpanChange={handleTrimSpanChange}
									onTrimDelete={handleTrimDelete}
									selectedTrimId={selectedTrimId}
									onSelectTrim={handleSelectTrim}
									speedRegions={speedRegions}
									onSpeedAdded={handleSpeedAdded}
									onSpeedSpanChange={handleSpeedSpanChange}
									onSpeedDelete={handleSpeedDelete}
									selectedSpeedId={selectedSpeedId}
									onSelectSpeed={handleSelectSpeed}
									annotationRegions={annotationOnlyRegions}
									onAnnotationAdded={handleAnnotationAdded}
									onAnnotationSpanChange={handleAnnotationSpanChange}
									onAnnotationDelete={handleAnnotationDelete}
									selectedAnnotationId={selectedAnnotationId}
									onSelectAnnotation={handleSelectAnnotation}
									blurRegions={blurRegions}
									onBlurAdded={handleBlurAdded}
									onBlurSpanChange={handleAnnotationSpanChange}
									onBlurDelete={handleAnnotationDelete}
									selectedBlurId={selectedBlurId}
									onSelectBlur={handleSelectBlur}
									audioRegions={audioRegions}
									onAudioAdded={handleAudioAdded}
									onAudioSpanChange={handleAudioSpanChange}
									onAudioDelete={handleAudioDelete}
									onAudioVolumeChange={handleAudioVolumeChange}
									selectedAudioId={selectedAudioId}
									onSelectAudio={handleSelectAudio}
									clipRegions={clipRegions}
									onClipAdded={handleClipAdded}
									onClipSpanChange={handleClipSpanChange}
									onClipDelete={handleClipDelete}
									selectedClipId={selectedClipId}
									onSelectClip={handleSelectClip}
									onImageAdded={handleImageAdded}
									aspectRatio={aspectRatio}
									onAspectRatioChange={(ar) =>
										pushState({
											aspectRatio: ar,
											webcamLayoutPreset:
												(isPortraitAspectRatio(ar) && webcamLayoutPreset === "dual-frame") ||
												(!isPortraitAspectRatio(ar) && webcamLayoutPreset === "vertical-stack")
													? "picture-in-picture"
													: webcamLayoutPreset,
										})
									}
									trackState={editorState.trackState}
									onTrackStateChange={(rowId, patch) =>
										pushState((prev) => ({
											trackState: {
												...prev.trackState,
												[rowId]: { ...(prev.trackState[rowId] ?? { muted: false, locked: false, label: rowId }), ...patch },
											},
										}))
									}
								/>
							</div>
						</Panel>
					</PanelGroup>
				</div>

				{/* Right section: settings panel */}
				<div className="flex-[3] min-w-[280px] max-w-[420px] h-full relative flex flex-col gap-2">
					<div className="flex gap-1 flex-shrink-0">
						<button
							type="button"
							onClick={() => { setShowStickerPicker((v) => !v); setShowTextPresets(false); }}
							className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium border transition-colors ${showStickerPicker ? "bg-[#34B27B]/20 border-[#34B27B]/50 text-[#34B27B]" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200"}`}
						>
							😀 Stickers
						</button>
						<button
							type="button"
							onClick={() => { setShowTextPresets((v) => !v); setShowStickerPicker(false); }}
							className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium border transition-colors ${showTextPresets ? "bg-[#34B27B]/20 border-[#34B27B]/50 text-[#34B27B]" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200"}`}
						>
							Aa Presets
						</button>
						<button
							type="button"
							onClick={handleAddDrawing}
							className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium border bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200 transition-colors"
						>
							✏️ Draw
						</button>
						<button
							type="button"
							onClick={handleAutoCaptions}
							className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium border bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200 transition-colors"
							title="Auto Captions via Whisper"
						>
							CC Auto
						</button>
					</div>
					<div className="flex-1 relative min-h-0">
					<SettingsPanel
						selected={wallpaper}
						onWallpaperChange={(w) => pushState({ wallpaper: w })}
						selectedZoomDepth={
							selectedZoomId ? zoomRegions.find((z) => z.id === selectedZoomId)?.depth : null
						}
						onZoomDepthChange={(depth) => selectedZoomId && handleZoomDepthChange(depth)}
						selectedZoomFocusMode={
							selectedZoomId
								? (zoomRegions.find((z) => z.id === selectedZoomId)?.focusMode ?? "manual")
								: null
						}
						onZoomFocusModeChange={(mode) => selectedZoomId && handleZoomFocusModeChange(mode)}
						hasCursorTelemetry={cursorTelemetry.length > 0}
						selectedZoomId={selectedZoomId}
						onZoomDelete={handleZoomDelete}
						selectedTrimId={selectedTrimId}
						onTrimDelete={handleTrimDelete}
						shadowIntensity={shadowIntensity}
						onShadowChange={(v) => updateState({ shadowIntensity: v })}
						onShadowCommit={commitState}
						showBlur={showBlur}
						onBlurChange={(v) => pushState({ showBlur: v })}
						motionBlurAmount={motionBlurAmount}
						onMotionBlurChange={(v) => updateState({ motionBlurAmount: v })}
						onMotionBlurCommit={commitState}
						borderRadius={borderRadius}
						onBorderRadiusChange={(v) => updateState({ borderRadius: v })}
						onBorderRadiusCommit={commitState}
						padding={padding}
						onPaddingChange={(v) => updateState({ padding: v })}
						onPaddingCommit={commitState}
						cropRegion={cropRegion}
						onCropChange={(r) => pushState({ cropRegion: r })}
						aspectRatio={aspectRatio}
						onAspectRatioChange={(ar) =>
							pushState({
								aspectRatio: ar,
								webcamLayoutPreset:
									(isPortraitAspectRatio(ar) && webcamLayoutPreset === "dual-frame") ||
									(!isPortraitAspectRatio(ar) && webcamLayoutPreset === "vertical-stack")
										? "picture-in-picture"
										: webcamLayoutPreset,
							})
						}
						hasWebcam={Boolean(webcamVideoPath)}
						webcamLayoutPreset={webcamLayoutPreset}
						onWebcamLayoutPresetChange={(preset) =>
							pushState({
								webcamLayoutPreset: preset,
								webcamPosition: preset === "picture-in-picture" ? webcamPosition : null,
							})
						}
						webcamMaskShape={webcamMaskShape}
						onWebcamMaskShapeChange={(shape) => pushState({ webcamMaskShape: shape })}
						webcamSizePreset={webcamSizePreset}
						onWebcamSizePresetChange={(v) => updateState({ webcamSizePreset: v })}
						onWebcamSizePresetCommit={commitState}
						videoElement={videoPlaybackRef.current?.video || null}
						exportQuality={exportQuality}
						onExportQualityChange={setExportQuality}
						exportFormat={exportFormat}
						onExportFormatChange={setExportFormat}
						gifFrameRate={gifFrameRate}
						onGifFrameRateChange={setGifFrameRate}
						gifLoop={gifLoop}
						onGifLoopChange={setGifLoop}
						gifSizePreset={gifSizePreset}
						onGifSizePresetChange={setGifSizePreset}
						gifOutputDimensions={calculateOutputDimensions(
							videoPlaybackRef.current?.video?.videoWidth || 1920,
							videoPlaybackRef.current?.video?.videoHeight || 1080,
							gifSizePreset,
							GIF_SIZE_PRESETS,
							aspectRatio === "native"
								? getNativeAspectRatioValue(
										videoPlaybackRef.current?.video?.videoWidth || 1920,
										videoPlaybackRef.current?.video?.videoHeight || 1080,
										cropRegion,
									)
								: getAspectRatioValue(aspectRatio),
						)}
						onExport={handleOpenExportDialog}
						selectedAnnotationId={selectedAnnotationId}
						annotationRegions={annotationOnlyRegions}
						onAnnotationContentChange={handleAnnotationContentChange}
						onAnnotationTypeChange={handleAnnotationTypeChange}
						onAnnotationStyleChange={handleAnnotationStyleChange}
						onAnnotationPatchChange={handleAnnotationPatchChange}
						onAnnotationFigureDataChange={handleAnnotationFigureDataChange}
						onAnnotationDelete={handleAnnotationDelete}
						colorGrading={colorGrading}
						onColorGradingChange={handleColorGradingChange}
						selectedBlurId={selectedBlurId}
						blurRegions={blurRegions}
						onBlurDataChange={handleBlurDataPanelChange}
						onBlurDataCommit={commitState}
						onBlurDelete={handleAnnotationDelete}
						selectedSpeedId={selectedSpeedId}
						selectedSpeedValue={
							selectedSpeedId
								? (speedRegions.find((r) => r.id === selectedSpeedId)?.speed ?? null)
								: null
						}
						onSpeedChange={handleSpeedChange}
						onSpeedDelete={handleSpeedDelete}
						unsavedExport={unsavedExport}
						onSaveUnsavedExport={handleSaveUnsavedExport}
						selectedZoomInDuration={
							selectedZoomId
								? (zoomRegions.find((z) => z.id === selectedZoomId)?.zoomInDurationMs ??
									Math.round(ZOOM_IN_TRANSITION_WINDOW_MS))
								: undefined
						}
						selectedZoomOutDuration={
							selectedZoomId
								? (zoomRegions.find((z) => z.id === selectedZoomId)?.zoomOutDurationMs ??
									Math.round(TRANSITION_WINDOW_MS))
								: undefined
						}
						onZoomDurationChange={(zoomIn, zoomOut) =>
							selectedZoomId && handleZoomDurationChange(selectedZoomId, zoomIn, zoomOut)
						}
						faceBlurEnabled={editorState.faceBlurEnabled ?? false}
						onFaceBlurChange={(enabled) => pushState({ faceBlurEnabled: enabled })}
						bgRemovalEnabled={editorState.bgRemovalEnabled ?? false}
						onBgRemovalChange={(enabled) => pushState({ bgRemovalEnabled: enabled })}
						primaryAudioVolume={editorState.primaryAudioVolume ?? 1.0}
						primaryAudioMuted={editorState.primaryAudioMuted ?? false}
						onPrimaryAudioVolumeChange={(v) => updateState({ primaryAudioVolume: v })}
						onPrimaryAudioMutedChange={(m) => pushState({ primaryAudioMuted: m })}
					/>
					{selectedAudioId && audioRegions.find((r) => r.id === selectedAudioId) && (
						<div className="absolute inset-0 overflow-y-auto bg-[#111113] rounded-2xl border border-white/5 z-10">
							<AudioSettingsPanel
								region={audioRegions.find((r) => r.id === selectedAudioId)!}
								onVolumeChange={handleAudioVolumeChange}
								onDelete={handleAudioDelete}
								onLabelChange={handleAudioLabelChange}
								onEqualizerChange={handleAudioEqualizerChange}
								onFadeChange={handleAudioFadeChange}
							/>
						</div>
					)}
					{selectedClipId && clipRegions.find((r) => r.id === selectedClipId) && (
						<div className="absolute inset-0 overflow-y-auto bg-[#111113] rounded-2xl border border-white/5 z-10">
							<ClipSettingsPanel
								region={clipRegions.find((r) => r.id === selectedClipId)!}
								isPrimary={false}
								onDelete={handleClipDelete}
								onLabelChange={handleClipLabelChange}
								onTransitionChange={handleClipTransitionChange}
								onClipUpdate={handleClipUpdate}
								onExtractAudio={handleExtractAudio}
							/>
						</div>
					)}
					{showStickerPicker && (
						<div className="absolute inset-0 overflow-y-auto bg-[#111113] rounded-2xl border border-white/5 z-20">
							<StickerPickerPanel onAddSticker={(partial) => { handleAddSticker(partial); setShowStickerPicker(false); }} />
						</div>
					)}
					{showTextPresets && (
						<div className="absolute inset-0 overflow-y-auto bg-[#111113] rounded-2xl border border-white/5 z-20">
							<TextPresetsPanel onApplyPreset={(partial) => { handleApplyTextPreset(partial); setShowTextPresets(false); }} />
						</div>
					)}
					</div>
				</div>
			</div>

			<ExportDialog
				isOpen={showExportDialog}
				onClose={() => setShowExportDialog(false)}
				progress={exportProgress}
				isExporting={isExporting}
				error={exportError}
				onCancel={handleCancelExport}
				exportFormat={exportFormat}
				exportedFilePath={exportedFilePath || undefined}
				onShowInFolder={
					exportedFilePath ? () => void handleShowExportedFile(exportedFilePath) : undefined
				}
			/>
		</div>
	);
}
