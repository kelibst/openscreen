import {
	Palette,
	Sparkles,
	Trash2,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useScopedT } from "@/contexts/I18nContext";
import { WEBCAM_LAYOUT_PRESETS } from "@/lib/compositeLayout";
import type { ExportFormat, ExportQuality, GifFrameRate, GifSizePreset } from "@/lib/exporter";
import { cn } from "@/lib/utils";
import { type AspectRatio, isPortraitAspectRatio } from "@/utils/aspectRatioUtils";
import { AnnotationSettingsPanel } from "./AnnotationSettingsPanel";
import { BlurSettingsPanel } from "./BlurSettingsPanel";
import { CurvesEditor } from "./CurvesEditor";
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";
import { BackgroundSettingsPanel } from "./settings/BackgroundSettingsPanel";
import { CropSettingsPanel } from "./settings/CropSettingsPanel";
import { ExportSettingsPanel } from "./settings/ExportSettingsPanel";
import type {
	AnnotationRegion,
	AnnotationType,
	BlurData,
	CropRegion,
	FigureData,
	PlaybackSpeed,
	WebcamLayoutPreset,
	WebcamMaskShape,
	WebcamSizePreset,
	ZoomDepth,
	ZoomFocusMode,
} from "./types";
import { DEFAULT_WEBCAM_SIZE_PRESET, MAX_PLAYBACK_SPEED, SPEED_OPTIONS } from "./types";

function CustomSpeedInput({
	value,
	onChange,
	onError,
}: {
	value: number;
	onChange: (val: number) => void;
	onError: () => void;
}) {
	const isPreset = SPEED_OPTIONS.some((o) => o.speed === value);
	const [draft, setDraft] = useState(isPreset ? "" : String(Math.round(value)));
	const [isFocused, setIsFocused] = useState(false);

	const prevValue = useRef(value);
	if (!isFocused && prevValue.current !== value) {
		prevValue.current = value;
		setDraft(isPreset ? "" : String(Math.round(value)));
	}

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const digits = e.target.value.replace(/\D/g, "");
			if (digits === "") {
				setDraft("");
				return;
			}
			const num = Number(digits);
			if (num > MAX_PLAYBACK_SPEED) {
				onError();
				return;
			}
			setDraft(digits);
			if (num >= 1) onChange(num);
		},
		[onChange, onError],
	);

	const handleBlur = useCallback(() => {
		setIsFocused(false);
		if (!draft || Number(draft) < 1) {
			setDraft(isPreset ? "" : String(Math.round(value)));
		}
	}, [draft, isPreset, value]);

	return (
		<div className="flex items-center gap-1">
			<input
				type="text"
				inputMode="numeric"
				pattern="[0-9]*"
				placeholder="--"
				value={draft}
				onFocus={() => setIsFocused(true)}
				onChange={handleChange}
				onBlur={handleBlur}
				onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
				className="w-12 bg-white/5 border border-white/10 rounded-md px-1 py-0.5 text-[11px] font-semibold text-[#d97706] text-center focus:outline-none focus:border-[#d97706]/40"
			/>
			<span className="text-[11px] font-semibold text-slate-500">×</span>
		</div>
	);
}

interface SettingsPanelProps {
	selected: string;
	onWallpaperChange: (path: string) => void;
	selectedZoomDepth?: ZoomDepth | null;
	onZoomDepthChange?: (depth: ZoomDepth) => void;
	selectedZoomFocusMode?: ZoomFocusMode | null;
	onZoomFocusModeChange?: (mode: ZoomFocusMode) => void;
	hasCursorTelemetry?: boolean;
	selectedZoomId?: string | null;
	onZoomDelete?: (id: string) => void;
	selectedTrimId?: string | null;
	onTrimDelete?: (id: string) => void;
	shadowIntensity?: number;
	onShadowChange?: (intensity: number) => void;
	onShadowCommit?: () => void;
	showBlur?: boolean;
	onBlurChange?: (showBlur: boolean) => void;
	motionBlurAmount?: number;
	onMotionBlurChange?: (amount: number) => void;
	onMotionBlurCommit?: () => void;
	borderRadius?: number;
	onBorderRadiusChange?: (radius: number) => void;
	onBorderRadiusCommit?: () => void;
	padding?: number;
	onPaddingChange?: (padding: number) => void;
	onPaddingCommit?: () => void;
	cropRegion?: CropRegion;
	onCropChange?: (region: CropRegion) => void;
	aspectRatio: AspectRatio;
	videoElement?: HTMLVideoElement | null;
	exportQuality?: ExportQuality;
	onExportQualityChange?: (quality: ExportQuality) => void;
	// Export format settings
	exportFormat?: ExportFormat;
	onExportFormatChange?: (format: ExportFormat) => void;
	gifFrameRate?: GifFrameRate;
	onGifFrameRateChange?: (rate: GifFrameRate) => void;
	gifLoop?: boolean;
	onGifLoopChange?: (loop: boolean) => void;
	gifSizePreset?: GifSizePreset;
	onGifSizePresetChange?: (preset: GifSizePreset) => void;
	gifOutputDimensions?: { width: number; height: number };
	onExport?: () => void;
	unsavedExport?: {
		arrayBuffer: ArrayBuffer;
		fileName: string;
		format: string;
	} | null;
	onSaveUnsavedExport?: () => void;
	selectedAnnotationId?: string | null;
	annotationRegions?: AnnotationRegion[];
	onAnnotationContentChange?: (id: string, content: string) => void;
	onAnnotationTypeChange?: (id: string, type: AnnotationType) => void;
	onAnnotationStyleChange?: (id: string, style: Partial<AnnotationRegion["style"]>) => void;
	onAnnotationPatchChange?: (id: string, patch: Partial<AnnotationRegion>) => void;
	onAnnotationFigureDataChange?: (id: string, figureData: FigureData) => void;
	onAnnotationDelete?: (id: string) => void;
	colorGrading?: import("./types").ColorGrading;
	onColorGradingChange?: (cg: import("./types").ColorGrading) => void;
	selectedBlurId?: string | null;
	blurRegions?: AnnotationRegion[];
	onBlurDataChange?: (id: string, blurData: BlurData) => void;
	onBlurDataCommit?: () => void;
	onBlurDelete?: (id: string) => void;
	selectedSpeedId?: string | null;
	selectedSpeedValue?: PlaybackSpeed | null;
	onSpeedChange?: (speed: PlaybackSpeed) => void;
	onSpeedDelete?: (id: string) => void;
	hasWebcam?: boolean;
	webcamLayoutPreset?: WebcamLayoutPreset;
	onWebcamLayoutPresetChange?: (preset: WebcamLayoutPreset) => void;
	webcamMaskShape?: import("./types").WebcamMaskShape;
	onWebcamMaskShapeChange?: (shape: import("./types").WebcamMaskShape) => void;
	selectedZoomInDuration?: number;
	selectedZoomOutDuration?: number;
	onZoomDurationChange?: (zoomIn: number, zoomOut: number) => void;
	webcamSizePreset?: WebcamSizePreset;
	onWebcamSizePresetChange?: (size: WebcamSizePreset) => void;
	onWebcamSizePresetCommit?: () => void;
	onAspectRatioChange?: (ar: AspectRatio) => void;
	faceBlurEnabled?: boolean;
	onFaceBlurChange?: (enabled: boolean) => void;
	bgRemovalEnabled?: boolean;
	onBgRemovalChange?: (enabled: boolean) => void;
	primaryAudioVolume?: number;
	primaryAudioMuted?: boolean;
	onPrimaryAudioVolumeChange?: (volume: number) => void;
	onPrimaryAudioMutedChange?: (muted: boolean) => void;
}

export default SettingsPanel;

const ZOOM_DEPTH_OPTIONS: Array<{ depth: ZoomDepth; label: string }> = [
	{ depth: 1, label: "1.25×" },
	{ depth: 2, label: "1.5×" },
	{ depth: 3, label: "1.8×" },
	{ depth: 4, label: "2.2×" },
	{ depth: 5, label: "3.5×" },
	{ depth: 6, label: "5×" },
];

const ZOOM_SPEED_OPTIONS = [
	{ label: "Instant", zoomIn: 0, zoomOut: 0 },
	{ label: "Fast", zoomIn: 500, zoomOut: 350 },
	{ label: "Smooth", zoomIn: 1522, zoomOut: 1015 },
	{ label: "Lazy", zoomIn: 3000, zoomOut: 2000 },
];

export function SettingsPanel({
	selected,
	onWallpaperChange,
	selectedZoomDepth,
	onZoomDepthChange,
	selectedZoomFocusMode,
	onZoomFocusModeChange,
	hasCursorTelemetry = false,
	selectedZoomId,
	onZoomDelete,
	selectedTrimId,
	onTrimDelete,
	shadowIntensity = 0,
	onShadowChange,
	onShadowCommit,
	showBlur,
	onBlurChange,
	motionBlurAmount = 0,
	onMotionBlurChange,
	onMotionBlurCommit,
	borderRadius = 0,
	onBorderRadiusChange,
	onBorderRadiusCommit,
	padding = 50,
	onPaddingChange,
	onPaddingCommit,
	cropRegion,
	onCropChange,
	aspectRatio,
	videoElement,
	exportQuality = "good",
	onExportQualityChange,
	exportFormat = "mp4",
	onExportFormatChange,
	gifFrameRate = 15,
	onGifFrameRateChange,
	gifLoop = true,
	onGifLoopChange,
	gifSizePreset = "medium",
	onGifSizePresetChange,
	gifOutputDimensions = { width: 1280, height: 720 },
	onExport,
	unsavedExport,
	onSaveUnsavedExport,
	selectedAnnotationId,
	annotationRegions = [],
	onAnnotationContentChange,
	onAnnotationTypeChange,
	onAnnotationStyleChange,
	onAnnotationPatchChange,
	onAnnotationFigureDataChange,
	onAnnotationDelete,
	colorGrading,
	onColorGradingChange,
	selectedBlurId,
	blurRegions = [],
	onBlurDataChange,
	onBlurDataCommit,
	onBlurDelete,
	selectedSpeedId,
	selectedSpeedValue,
	onSpeedChange,
	onSpeedDelete,
	hasWebcam = false,
	webcamLayoutPreset = "picture-in-picture",
	onWebcamLayoutPresetChange,
	webcamMaskShape = "rectangle",
	onWebcamMaskShapeChange,
	selectedZoomInDuration,
	selectedZoomOutDuration,
	onZoomDurationChange,
	webcamSizePreset = DEFAULT_WEBCAM_SIZE_PRESET,
	onWebcamSizePresetChange,
	onWebcamSizePresetCommit,
	onAspectRatioChange,
	faceBlurEnabled = false,
	onFaceBlurChange,
	bgRemovalEnabled = false,
	onBgRemovalChange,
	primaryAudioVolume = 1.0,
	primaryAudioMuted = false,
	onPrimaryAudioVolumeChange,
	onPrimaryAudioMutedChange,
}: SettingsPanelProps) {
	const t = useScopedT("settings");
	const isPortraitCanvas = isPortraitAspectRatio(aspectRatio);

	const videoWidth = videoElement?.videoWidth || 1920;
	const videoHeight = videoElement?.videoHeight || 1080;

	const zoomEnabled = Boolean(selectedZoomDepth);
	const trimEnabled = Boolean(selectedTrimId);

	const handleDeleteClick = () => {
		if (selectedZoomId && onZoomDelete) {
			onZoomDelete(selectedZoomId);
		}
	};

	const handleTrimDeleteClick = () => {
		if (selectedTrimId && onTrimDelete) {
			onTrimDelete(selectedTrimId);
		}
	};

	// Find selected annotation
	const selectedAnnotation = selectedAnnotationId
		? annotationRegions.find((a) => a.id === selectedAnnotationId)
		: null;
	const selectedBlur = selectedBlurId
		? blurRegions.find((region) => region.id === selectedBlurId)
		: null;

	// If an annotation is selected, show annotation settings instead
	if (
		selectedAnnotation &&
		onAnnotationContentChange &&
		onAnnotationTypeChange &&
		onAnnotationStyleChange &&
		onAnnotationDelete
	) {
		return (
			<AnnotationSettingsPanel
				annotation={selectedAnnotation}
				onContentChange={(content) => onAnnotationContentChange(selectedAnnotation.id, content)}
				onTypeChange={(type) => onAnnotationTypeChange(selectedAnnotation.id, type)}
				onStyleChange={(style) => onAnnotationStyleChange(selectedAnnotation.id, style)}
				onPatchChange={
					onAnnotationPatchChange
						? (patch) => onAnnotationPatchChange(selectedAnnotation.id, patch)
						: undefined
				}
				onFigureDataChange={
					onAnnotationFigureDataChange
						? (figureData) => onAnnotationFigureDataChange(selectedAnnotation.id, figureData)
						: undefined
				}
				onDelete={() => onAnnotationDelete(selectedAnnotation.id)}
			/>
		);
	}

	if (selectedBlur && onBlurDataChange && onBlurDelete) {
		return (
			<BlurSettingsPanel
				blurRegion={selectedBlur}
				onBlurDataChange={(blurData) => onBlurDataChange(selectedBlur.id, blurData)}
				onBlurDataCommit={onBlurDataCommit}
				onDelete={() => onBlurDelete(selectedBlur.id)}
			/>
		);
	}

	return (
		<div className="flex-[2] min-w-0 bg-[#09090b] border border-white/5 rounded-2xl flex flex-col shadow-xl h-full overflow-hidden">
			<div className="flex-1 overflow-y-auto custom-scrollbar p-4 pb-0">
				<div className="mb-4">
					<div className="flex items-center justify-between mb-3">
						<span className="text-sm font-medium text-slate-200">{t("zoom.level")}</span>
						<div className="flex items-center gap-2">
							{zoomEnabled && selectedZoomDepth && (
								<span className="text-[10px] uppercase tracking-wider font-medium text-[#34B27B] bg-[#34B27B]/10 px-2 py-0.5 rounded-full">
									{ZOOM_DEPTH_OPTIONS.find((o) => o.depth === selectedZoomDepth)?.label}
								</span>
							)}
							<KeyboardShortcutsHelp />
						</div>
					</div>
					<div className="grid grid-cols-6 gap-1.5">
						{ZOOM_DEPTH_OPTIONS.map((option) => {
							const isActive = selectedZoomDepth === option.depth;
							return (
								<Button
									key={option.depth}
									type="button"
									disabled={!zoomEnabled}
									onClick={() => onZoomDepthChange?.(option.depth)}
									className={cn(
										"h-auto w-full rounded-lg border px-1 py-2 text-center shadow-sm transition-all",
										"duration-200 ease-out",
										zoomEnabled ? "opacity-100 cursor-pointer" : "opacity-40 cursor-not-allowed",
										isActive
											? "border-[#34B27B] bg-[#34B27B] text-white shadow-[#34B27B]/20"
											: "border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10 hover:text-slate-200",
									)}
								>
									<span className="text-xs font-semibold">{option.label}</span>
								</Button>
							);
						})}
					</div>
					{!zoomEnabled && (
						<p className="text-[10px] text-slate-500 mt-2 text-center">{t("zoom.selectRegion")}</p>
					)}
					{zoomEnabled && hasCursorTelemetry && (
						<div className="mt-3">
							<span className="text-sm font-medium text-slate-200 mb-2 block">
								{t("zoom.focusMode.title")}
							</span>
							<div className="grid grid-cols-2 gap-1.5">
								{(["manual", "auto"] as const).map((mode) => {
									const isActive = selectedZoomFocusMode === mode;
									return (
										<Button
											key={mode}
											type="button"
											onClick={() => onZoomFocusModeChange?.(mode)}
											className={cn(
												"h-auto w-full rounded-lg border px-2 py-2 text-center shadow-sm transition-all",
												"duration-200 ease-out cursor-pointer",
												isActive
													? "border-[#34B27B] bg-[#34B27B] text-white shadow-[#34B27B]/20"
													: "border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10 hover:text-slate-200",
											)}
										>
											<span className="text-xs font-semibold capitalize">
												{t(`zoom.focusMode.${mode}`)}
											</span>
										</Button>
									);
								})}
							</div>
							{selectedZoomFocusMode === "auto" && (
								<p className="text-[10px] text-slate-500 mt-1.5">
									{t("zoom.focusMode.autoDescription")}
								</p>
							)}
						</div>
					)}

					{zoomEnabled && (
						<div className="mt-3">
							<span className="text-sm font-medium text-slate-200 mb-2 block">
								{t("zoom.speed.title") || "Zoom Speed"}
							</span>
							<div className="grid grid-cols-4 gap-1.5">
								{ZOOM_SPEED_OPTIONS.map((opt) => {
									const isActive =
										selectedZoomInDuration !== undefined &&
										selectedZoomOutDuration !== undefined &&
										Math.round(selectedZoomInDuration) === Math.round(opt.zoomIn) &&
										Math.round(selectedZoomOutDuration) === Math.round(opt.zoomOut);
									return (
										<Button
											key={opt.label}
											type="button"
											onClick={() => onZoomDurationChange?.(opt.zoomIn, opt.zoomOut)}
											className={cn(
												"h-auto w-full rounded-lg border px-1 py-2 text-center shadow-sm transition-all",
												"duration-200 ease-out cursor-pointer",
												isActive
													? "border-[#34B27B] bg-[#34B27B] text-white shadow-[#34B27B]/20"
													: "border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10 hover:text-slate-200",
											)}
										>
											<span className="text-[10px] font-semibold">{opt.label}</span>
										</Button>
									);
								})}
							</div>
						</div>
					)}
					{zoomEnabled && (
						<Button
							onClick={handleDeleteClick}
							variant="destructive"
							size="sm"
							className="mt-2 w-full gap-2 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-all h-8 text-xs"
						>
							<Trash2 className="w-3 h-3" />
							{t("zoom.deleteZoom")}
						</Button>
					)}
				</div>

				{trimEnabled && (
					<div className="mb-4">
						<Button
							onClick={handleTrimDeleteClick}
							variant="destructive"
							size="sm"
							className="w-full gap-2 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-all h-8 text-xs"
						>
							<Trash2 className="w-3 h-3" />
							{t("trim.deleteRegion")}
						</Button>
					</div>
				)}

				<div className="mb-4">
					<div className="flex items-center justify-between mb-3">
						<span className="text-sm font-medium text-slate-200">{t("speed.playbackSpeed")}</span>
						{selectedSpeedId && selectedSpeedValue && (
							<span className="text-[10px] uppercase tracking-wider font-medium text-[#d97706] bg-[#d97706]/10 px-2 py-0.5 rounded-full">
								{SPEED_OPTIONS.find((o) => o.speed === selectedSpeedValue)?.label ??
									`${selectedSpeedValue}×`}
							</span>
						)}
					</div>
					<div className="grid grid-cols-5 gap-1.5">
						{SPEED_OPTIONS.map((option) => {
							const isActive = selectedSpeedValue === option.speed;
							return (
								<Button
									key={option.speed}
									type="button"
									disabled={!selectedSpeedId}
									onClick={() => onSpeedChange?.(option.speed)}
									className={cn(
										"h-auto w-full rounded-lg border px-1 py-2 text-center shadow-sm transition-all",
										"duration-200 ease-out",
										selectedSpeedId
											? "opacity-100 cursor-pointer"
											: "opacity-40 cursor-not-allowed",
										isActive
											? "border-[#d97706] bg-[#d97706] text-white shadow-[#d97706]/20"
											: "border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10 hover:text-slate-200",
									)}
								>
									<span className="text-xs font-semibold">{option.label}</span>
								</Button>
							);
						})}
					</div>
					<div className="mt-3">
						<div className="flex items-center justify-between">
							<span
								className={cn("text-[11px]", selectedSpeedId ? "text-slate-500" : "text-slate-600")}
							>
								{t("speed.customPlaybackSpeed")}
							</span>
							{selectedSpeedId ? (
								<CustomSpeedInput
									value={selectedSpeedValue ?? 1}
									onChange={(val) => onSpeedChange?.(val)}
									onError={() => toast.error(t("speed.maxSpeedError"))}
								/>
							) : (
								<div className="flex items-center gap-1 opacity-40">
									<div className="w-12 bg-white/5 border border-white/10 rounded-md px-1 py-0.5 text-[11px] font-semibold text-slate-600 text-center">
										--
									</div>
									<span className="text-[11px] font-semibold text-slate-600">×</span>
								</div>
							)}
						</div>
					</div>
					{!selectedSpeedId && (
						<p className="text-[10px] text-slate-500 mt-2 text-center">{t("speed.selectRegion")}</p>
					)}
					{selectedSpeedId && (
						<Button
							onClick={() => selectedSpeedId && onSpeedDelete?.(selectedSpeedId)}
							variant="destructive"
							size="sm"
							className="mt-2 w-full gap-2 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-all h-8 text-xs"
						>
							<Trash2 className="w-3 h-3" />
							{t("speed.deleteRegion")}
						</Button>
					)}
				</div>

				{onPrimaryAudioVolumeChange && (
					<div className="mb-4">
						<span className="text-sm font-medium text-slate-200 mb-2 block">Original Audio</span>
						<div className="flex items-center gap-2 mb-2">
							<button
								type="button"
								onClick={() => onPrimaryAudioMutedChange?.(!primaryAudioMuted)}
								className={`text-xs px-2 py-1 rounded border transition-colors ${primaryAudioMuted ? "bg-red-500/20 border-red-500/40 text-red-400" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"}`}
							>
								{primaryAudioMuted ? "🔇 Muted" : "🔊 Active"}
							</button>
							<span className="text-xs text-slate-500 ml-auto tabular-nums">
								{Math.round(primaryAudioVolume * 100)}%
							</span>
						</div>
						<Slider
							min={0}
							max={100}
							step={1}
							value={[Math.round(primaryAudioVolume * 100)]}
							onValueChange={([v]) => onPrimaryAudioVolumeChange(v / 100)}
							disabled={primaryAudioMuted}
							className="w-full"
						/>
					</div>
				)}

				{onAspectRatioChange && (
					<div className="mb-4">
						<span className="text-sm font-medium text-slate-200 mb-2 block">Canvas Ratio</span>
						<div className="grid grid-cols-5 gap-1.5">
							{(
								[
									{ label: "TikTok", ratio: "9:16" as AspectRatio },
									{ label: "Shorts", ratio: "9:16" as AspectRatio },
									{ label: "YouTube", ratio: "16:9" as AspectRatio },
									{ label: "Twitter", ratio: "16:9" as AspectRatio },
									{ label: "Post", ratio: "1:1" as AspectRatio },
								] as const
							).map((preset) => (
								<Button
									key={preset.label}
									type="button"
									onClick={() => onAspectRatioChange(preset.ratio)}
									className={cn(
										"h-auto w-full rounded-lg border px-1 py-2 text-center shadow-sm transition-all",
										"duration-200 ease-out cursor-pointer",
										aspectRatio === preset.ratio
											? "border-[#34B27B] bg-[#34B27B] text-white shadow-[#34B27B]/20"
											: "border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10 hover:text-slate-200",
									)}
								>
									<span className="text-[9px] font-semibold leading-tight block">{preset.label}</span>
									<span className="text-[8px] text-current opacity-70 block">{preset.ratio}</span>
								</Button>
							))}
						</div>
					</div>
				)}

				<Accordion
					type="multiple"
					defaultValue={hasWebcam ? ["layout", "effects", "background"] : ["effects", "background"]}
					className="space-y-1"
				>
					{hasWebcam && (
						<AccordionItem
							value="layout"
							className="border-white/5 rounded-xl bg-white/[0.02] px-3"
						>
							<AccordionTrigger className="py-2.5 hover:no-underline">
								<div className="flex items-center gap-2">
									<Sparkles className="w-4 h-4 text-[#34B27B]" />
									<span className="text-xs font-medium">{t("layout.title")}</span>
								</div>
							</AccordionTrigger>
							<AccordionContent className="pb-3">
								<div className="p-2 rounded-lg bg-white/5 border border-white/5">
									<div className="text-[10px] font-medium text-slate-300 mb-1.5">
										{t("layout.preset")}
									</div>
									<Select
										value={webcamLayoutPreset}
										onValueChange={(value: WebcamLayoutPreset) =>
											onWebcamLayoutPresetChange?.(value)
										}
									>
										<SelectTrigger className="h-8 bg-black/20 border-white/10 text-xs">
											<SelectValue placeholder={t("layout.selectPreset")} />
										</SelectTrigger>
										<SelectContent>
											{WEBCAM_LAYOUT_PRESETS.filter((preset) => {
												if (preset.value === "picture-in-picture") return true;
												if (preset.value === "vertical-stack") return isPortraitCanvas;
												return !isPortraitCanvas;
											}).map((preset) => (
												<SelectItem key={preset.value} value={preset.value} className="text-xs">
													{preset.value === "picture-in-picture"
														? t("layout.pictureInPicture")
														: preset.value === "vertical-stack"
															? t("layout.verticalStack")
															: t("layout.dualFrame")}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								{webcamLayoutPreset === "picture-in-picture" && (
									<div className="mt-2 p-2 rounded-lg bg-white/5 border border-white/5">
										<div className="text-[10px] font-medium text-slate-300 mb-1.5">
											{t("layout.webcamShape")}
										</div>
										<div className="grid grid-cols-4 gap-1.5">
											{(
												[
													{ value: "rectangle", label: "Rect" },
													{ value: "circle", label: "Circle" },
													{ value: "square", label: "Square" },
													{ value: "rounded", label: "Rounded" },
												] as Array<{ value: WebcamMaskShape; label: string }>
											).map((shape) => (
												<button
													key={shape.value}
													type="button"
													onClick={() => onWebcamMaskShapeChange?.(shape.value)}
													className={cn(
														"h-10 rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-all",
														webcamMaskShape === shape.value
															? "bg-[#34B27B] border-[#34B27B] text-white"
															: "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 text-slate-400",
													)}
												>
													<svg
														width="16"
														height="16"
														viewBox="0 0 16 16"
														fill="none"
														xmlns="http://www.w3.org/2000/svg"
													>
														{shape.value === "rectangle" && (
															<rect
																x="1"
																y="3"
																width="14"
																height="10"
																rx="2"
																stroke="currentColor"
																strokeWidth="1.5"
															/>
														)}
														{shape.value === "circle" && (
															<circle
																cx="8"
																cy="8"
																r="6.5"
																stroke="currentColor"
																strokeWidth="1.5"
															/>
														)}
														{shape.value === "square" && (
															<rect
																x="2"
																y="2"
																width="12"
																height="12"
																rx="1"
																stroke="currentColor"
																strokeWidth="1.5"
															/>
														)}
														{shape.value === "rounded" && (
															<rect
																x="1"
																y="3"
																width="14"
																height="10"
																rx="5"
																stroke="currentColor"
																strokeWidth="1.5"
															/>
														)}
													</svg>
													<span className="text-[8px] leading-none">{shape.label}</span>
												</button>
											))}
										</div>
									</div>
								)}
								{webcamLayoutPreset === "picture-in-picture" && (
									<div className="p-2 rounded-lg bg-white/5 border border-white/5 mt-2">
										<div className="flex items-center justify-between mb-1.5">
											<div className="text-[10px] font-medium text-slate-300">
												{t("layout.webcamSize")}
											</div>
											<div className="text-[10px] font-medium text-slate-400">
												{webcamSizePreset}%
											</div>
										</div>
										<Slider
											value={[webcamSizePreset]}
											onValueChange={(values) => onWebcamSizePresetChange?.(values[0])}
											onValueCommit={() => onWebcamSizePresetCommit?.()}
											min={10}
											max={50}
											step={1}
											className="w-full"
										/>
									</div>
								)}
							</AccordionContent>
						</AccordionItem>
					)}

					<AccordionItem value="effects" className="border-white/5 rounded-xl bg-white/[0.02] px-3">
						<AccordionTrigger className="py-2.5 hover:no-underline">
							<div className="flex items-center gap-2">
								<Sparkles className="w-4 h-4 text-[#34B27B]" />
								<span className="text-xs font-medium">{t("effects.title")}</span>
							</div>
						</AccordionTrigger>
						<AccordionContent className="pb-3">
							<div className="grid grid-cols-2 gap-2 mb-3">
								<div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
									<div className="text-[10px] font-medium text-slate-300">
										{t("effects.blurBg")}
									</div>
									<Switch
										checked={showBlur}
										onCheckedChange={onBlurChange}
										className="data-[state=checked]:bg-[#34B27B] scale-90"
									/>
								</div>
							</div>

							<div className="grid grid-cols-2 gap-2">
								<div className="p-2 rounded-lg bg-white/5 border border-white/5">
									<div className="flex items-center justify-between mb-1">
										<div className="text-[10px] font-medium text-slate-300">
											{t("effects.motionBlur")}
										</div>
										<span className="text-[10px] text-slate-500 font-mono">
											{motionBlurAmount === 0 ? t("effects.off") : motionBlurAmount.toFixed(2)}
										</span>
									</div>
									<Slider
										value={[motionBlurAmount]}
										onValueChange={(values) => onMotionBlurChange?.(values[0])}
										onValueCommit={() => onMotionBlurCommit?.()}
										min={0}
										max={1}
										step={0.01}
										className="w-full [&_[role=slider]]:bg-[#34B27B] [&_[role=slider]]:border-[#34B27B] [&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
									/>
								</div>
								<div className="p-2 rounded-lg bg-white/5 border border-white/5">
									<div className="flex items-center justify-between mb-1">
										<div className="text-[10px] font-medium text-slate-300">
											{t("effects.shadow")}
										</div>
										<span className="text-[10px] text-slate-500 font-mono">
											{Math.round(shadowIntensity * 100)}%
										</span>
									</div>
									<Slider
										value={[shadowIntensity]}
										onValueChange={(values) => onShadowChange?.(values[0])}
										onValueCommit={() => onShadowCommit?.()}
										min={0}
										max={1}
										step={0.01}
										className="w-full [&_[role=slider]]:bg-[#34B27B] [&_[role=slider]]:border-[#34B27B] [&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
									/>
								</div>
								<div className="p-2 rounded-lg bg-white/5 border border-white/5">
									<div className="flex items-center justify-between mb-1">
										<div className="text-[10px] font-medium text-slate-300">
											{t("effects.roundness")}
										</div>
										<span className="text-[10px] text-slate-500 font-mono">{borderRadius}px</span>
									</div>
									<Slider
										value={[borderRadius]}
										onValueChange={(values) => onBorderRadiusChange?.(values[0])}
										onValueCommit={() => onBorderRadiusCommit?.()}
										min={0}
										max={16}
										step={0.5}
										className="w-full [&_[role=slider]]:bg-[#34B27B] [&_[role=slider]]:border-[#34B27B] [&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
									/>
								</div>
								<div
									className={`p-2 rounded-lg bg-white/5 border border-white/5 ${webcamLayoutPreset === "vertical-stack" ? "opacity-40 pointer-events-none" : ""}`}
								>
									<div className="flex items-center justify-between mb-1">
										<div className="text-[10px] font-medium text-slate-300">
											{t("effects.padding")}
										</div>
										<span className="text-[10px] text-slate-500 font-mono">
											{webcamLayoutPreset === "vertical-stack" ? "—" : `${padding}%`}
										</span>
									</div>
									<Slider
										value={[webcamLayoutPreset === "vertical-stack" ? 0 : padding]}
										onValueChange={(values) => onPaddingChange?.(values[0])}
										onValueCommit={() => onPaddingCommit?.()}
										min={0}
										max={100}
										step={1}
										disabled={webcamLayoutPreset === "vertical-stack"}
										className="w-full [&_[role=slider]]:bg-[#34B27B] [&_[role=slider]]:border-[#34B27B] [&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
									/>
								</div>
							</div>

							<CropSettingsPanel
								cropRegion={cropRegion}
								onCropChange={onCropChange}
								videoWidth={videoWidth}
								videoHeight={videoHeight}
								videoElement={videoElement}
								aspectRatio={aspectRatio}
							/>
						</AccordionContent>
					</AccordionItem>

					{/* Color grading */}
					<AccordionItem
						value="color-grading"
						className="border-white/5 rounded-xl bg-white/[0.02] px-3"
					>
						<AccordionTrigger className="py-2.5 hover:no-underline">
							<div className="flex items-center gap-2">
								<Palette className="w-4 h-4 text-purple-400" />
								<span className="text-xs font-medium">Color Grading</span>
							</div>
						</AccordionTrigger>
						<AccordionContent className="pb-3 flex flex-col gap-2">
							{(["none","vivid","matte","cinematic","warm","cool","vintage","noir"] as const).length > 0 && (
								<div className="flex flex-col gap-1">
									<label className="text-[10px] text-slate-500">Preset</label>
									<select
										value={colorGrading?.preset ?? "none"}
										onChange={(e) => {
											const preset = e.target.value as import("./types").ColorGradingPreset;
											onColorGradingChange?.({
												brightness: colorGrading?.brightness ?? 0,
												contrast: colorGrading?.contrast ?? 0,
												saturation: colorGrading?.saturation ?? 0,
												hue: colorGrading?.hue ?? 0,
												preset,
											});
										}}
										className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-purple-400/50"
									>
										<option value="none" className="bg-[#1a1a1a]">None</option>
										<option value="vivid" className="bg-[#1a1a1a]">Vivid</option>
										<option value="matte" className="bg-[#1a1a1a]">Matte</option>
										<option value="cinematic" className="bg-[#1a1a1a]">Cinematic</option>
										<option value="warm" className="bg-[#1a1a1a]">Warm</option>
										<option value="cool" className="bg-[#1a1a1a]">Cool</option>
										<option value="vintage" className="bg-[#1a1a1a]">Vintage</option>
										<option value="noir" className="bg-[#1a1a1a]">Noir</option>
									</select>
								</div>
							)}
							{[
								{ key: "brightness" as const, label: "Brightness", min: -1, max: 1, step: 0.05 },
								{ key: "contrast" as const, label: "Contrast", min: -1, max: 1, step: 0.05 },
								{ key: "saturation" as const, label: "Saturation", min: -1, max: 1, step: 0.05 },
								{ key: "hue" as const, label: "Hue", min: -180, max: 180, step: 1 },
							].map(({ key, label, min, max, step }) => (
								<div key={key} className="p-2 rounded-lg bg-white/5 border border-white/5">
									<div className="flex items-center justify-between mb-1">
										<div className="text-[10px] font-medium text-slate-300">{label}</div>
										<span className="text-[10px] text-slate-500 font-mono">
											{(colorGrading?.[key] ?? 0).toFixed(key === "hue" ? 0 : 2)}
										</span>
									</div>
									<Slider
										value={[colorGrading?.[key] ?? 0]}
										onValueChange={(values) => {
											onColorGradingChange?.({
												brightness: colorGrading?.brightness ?? 0,
												contrast: colorGrading?.contrast ?? 0,
												saturation: colorGrading?.saturation ?? 0,
												hue: colorGrading?.hue ?? 0,
												preset: colorGrading?.preset,
												[key]: values[0],
											});
										}}
										min={min}
										max={max}
										step={step}
										className="w-full [&_[role=slider]]:bg-purple-400 [&_[role=slider]]:border-purple-400 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
									/>
								</div>
							))}
							<div className="p-2 rounded-lg bg-white/5 border border-white/5">
								<div className="text-[10px] font-medium text-slate-300 mb-2">Curves</div>
								<CurvesEditor
									value={colorGrading?.rgbCurves}
									onChange={(curves) => {
										onColorGradingChange?.({
											brightness: colorGrading?.brightness ?? 0,
											contrast: colorGrading?.contrast ?? 0,
											saturation: colorGrading?.saturation ?? 0,
											hue: colorGrading?.hue ?? 0,
											preset: colorGrading?.preset,
											rgbCurves: curves,
										});
									}}
								/>
							</div>
							<div className="p-2 rounded-lg bg-white/5 border border-white/5 flex flex-col gap-2">
								<div className="text-[10px] font-medium text-slate-300">AI Effects</div>
								<div className="flex items-center justify-between">
									<span className="text-[10px] text-slate-400">Face Blur (BlazeFace)</span>
									<Switch
										checked={faceBlurEnabled}
										onCheckedChange={onFaceBlurChange}
									/>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-[10px] text-slate-400">BG Removal (BodyPix)</span>
									<Switch
										checked={bgRemovalEnabled}
										onCheckedChange={onBgRemovalChange}
									/>
								</div>
								{(faceBlurEnabled || bgRemovalEnabled) && (
									<p className="text-[9px] text-amber-400/80">
										AI effects slow export significantly
									</p>
								)}
							</div>
						</AccordionContent>
					</AccordionItem>

					<AccordionItem
						value="background"
						className="border-white/5 rounded-xl bg-white/[0.02] px-3"
					>
						<AccordionTrigger className="py-2.5 hover:no-underline">
							<div className="flex items-center gap-2">
								<Palette className="w-4 h-4 text-[#34B27B]" />
								<span className="text-xs font-medium">{t("background.title")}</span>
							</div>
						</AccordionTrigger>
						<AccordionContent className="pb-3">
							<BackgroundSettingsPanel
								wallpaper={selected}
								onWallpaperChange={onWallpaperChange}
							/>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</div>

			<ExportSettingsPanel
				exportQuality={exportQuality}
				onExportQualityChange={onExportQualityChange}
				exportFormat={exportFormat}
				onExportFormatChange={onExportFormatChange}
				gifFrameRate={gifFrameRate}
				onGifFrameRateChange={onGifFrameRateChange}
				gifLoop={gifLoop}
				onGifLoopChange={onGifLoopChange}
				gifSizePreset={gifSizePreset}
				onGifSizePresetChange={onGifSizePresetChange}
				gifOutputDimensions={gifOutputDimensions}
				onExport={onExport}
				unsavedExport={unsavedExport}
				onSaveUnsavedExport={onSaveUnsavedExport}
			/>
		</div>
	);
}
