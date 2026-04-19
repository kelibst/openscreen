import { Music, Scissors, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { ClipRegion, TransitionType } from "./types";

interface ClipSettingsPanelProps {
	region: ClipRegion;
	isPrimary?: boolean;
	onDelete: (id: string) => void;
	onLabelChange: (id: string, label: string) => void;
	onTransitionChange: (id: string, transition: TransitionType, durationMs: number) => void;
	onClipUpdate?: (id: string, patch: Partial<ClipRegion>) => void;
	onExtractAudio?: (outputPath: string, startMs: number, sourceOffsetMs: number) => void;
}

const TRANSITIONS: { value: TransitionType; label: string }[] = [
	{ value: "cut", label: "Cut" },
	{ value: "fade", label: "Fade" },
	{ value: "dissolve", label: "Dissolve" },
	{ value: "wipe-left", label: "Wipe Left" },
	{ value: "wipe-right", label: "Wipe Right" },
	{ value: "slide-left", label: "Slide Left" },
];

export default function ClipSettingsPanel({
	region,
	isPrimary = false,
	onDelete,
	onLabelChange,
	onTransitionChange,
	onClipUpdate,
	onExtractAudio,
}: ClipSettingsPanelProps) {
	const [extracting, setExtracting] = useState(false);
	const fileName = region.sourcePath.split("/").pop() ?? region.sourcePath;
	const durationMs = region.endMs - region.startMs;

	async function handleExtractAudio() {
		if (!window.electronAPI?.extractAudio) return;
		setExtracting(true);
		try {
			const result = await window.electronAPI.extractAudio(region.sourcePath);
			if (result.success && result.outputPath) {
				onExtractAudio?.(result.outputPath, region.startMs, region.sourceOffsetMs);
				toast.success("Audio extracted");
			} else {
				toast.error(result.error ?? "Extract failed");
			}
		} finally {
			setExtracting(false);
		}
	}

	async function handleDetachAudio() {
		if (!window.electronAPI?.extractAudio) return;
		setExtracting(true);
		try {
			const result = await window.electronAPI.extractAudio(region.sourcePath);
			if (result.success && result.outputPath) {
				onExtractAudio?.(result.outputPath, region.startMs, region.sourceOffsetMs);
				onClipUpdate?.(region.id, { audioMuted: true });
				toast.success("Audio detached");
			} else {
				toast.error(result.error ?? "Detach failed");
			}
		} finally {
			setExtracting(false);
		}
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-slate-200">
					{isPrimary ? "Primary Clip" : "Video Clip"}
				</h3>
				{!isPrimary && (
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-red-400/10"
						onClick={() => onDelete(region.id)}
						title="Remove clip"
					>
						<Trash2 className="w-4 h-4" />
					</Button>
				)}
			</div>

			<div className="flex flex-col gap-1">
				<label className="text-xs text-slate-500">Label</label>
				<input
					type="text"
					value={region.label ?? fileName}
					onChange={(e) => onLabelChange(region.id, e.target.value)}
					className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-[#34B27B]/50"
				/>
			</div>

			<div className="flex flex-col gap-1">
				<label className="text-xs text-slate-500">Source File</label>
				<p className="text-xs text-slate-400 truncate" title={region.sourcePath}>
					{fileName}
				</p>
			</div>

			<div className="grid grid-cols-2 gap-2">
				<div className="flex flex-col gap-1">
					<label className="text-xs text-slate-500">Duration</label>
					<p className="text-xs text-slate-300 tabular-nums">{(durationMs / 1000).toFixed(1)}s</p>
				</div>
				<div className="flex flex-col gap-1">
					<label className="text-xs text-slate-500">Source offset</label>
					<p className="text-xs text-slate-300 tabular-nums">
						{(region.sourceOffsetMs / 1000).toFixed(1)}s
					</p>
				</div>
			</div>

			{onClipUpdate && (
				<div className="flex items-center justify-between">
					<label className="text-xs text-slate-500">Loop</label>
					<button
						type="button"
						onClick={() => onClipUpdate(region.id, { loop: !region.loop })}
						className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${region.loop ? "bg-[#34B27B]" : "bg-white/20"}`}
					>
						<span
							className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${region.loop ? "translate-x-4" : "translate-x-0.5"}`}
						/>
					</button>
				</div>
			)}

			{onExtractAudio && (
				<div className="flex flex-col gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={extracting}
						onClick={handleExtractAudio}
						className="w-full justify-start gap-2 text-xs text-slate-300 hover:text-white border border-white/10 hover:border-white/20"
					>
						<Music className="w-3.5 h-3.5" />
						{extracting ? "Extracting…" : "Extract Audio"}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={extracting}
						onClick={handleDetachAudio}
						className="w-full justify-start gap-2 text-xs text-slate-300 hover:text-white border border-white/10 hover:border-white/20"
					>
						<Scissors className="w-3.5 h-3.5" />
						{extracting ? "Detaching…" : "Detach Audio"}
					</Button>
				</div>
			)}

			{!isPrimary && (
				<div className="flex flex-col gap-2">
					<label className="text-xs text-slate-500">Transition In</label>
					<select
						value={region.transitionIn ?? "cut"}
						onChange={(e) =>
							onTransitionChange(
								region.id,
								e.target.value as TransitionType,
								region.transitionInDurationMs ?? 500,
							)
						}
						className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-[#34B27B]/50"
					>
						{TRANSITIONS.map((t) => (
							<option key={t.value} value={t.value} className="bg-[#1a1a1a]">
								{t.label}
							</option>
						))}
					</select>
					{(region.transitionIn ?? "cut") !== "cut" && (
						<div className="flex flex-col gap-1">
							<div className="flex items-center justify-between text-xs text-slate-500">
								<span>Duration</span>
								<span className="tabular-nums">{((region.transitionInDurationMs ?? 500) / 1000).toFixed(2)}s</span>
							</div>
							<Slider
								value={[region.transitionInDurationMs ?? 500]}
								onValueChange={([val]) =>
									onTransitionChange(region.id, region.transitionIn!, val)
								}
								min={100}
								max={2000}
								step={50}
								className="w-full"
							/>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
