import { Trash2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { AudioEqualizer, AudioRegion } from "./types";

interface AudioSettingsPanelProps {
	region: AudioRegion;
	onVolumeChange: (id: string, volume: number) => void;
	onDelete: (id: string) => void;
	onLabelChange: (id: string, label: string) => void;
	onEqualizerChange?: (id: string, eq: AudioEqualizer) => void;
	onFadeChange?: (id: string, fadeInMs: number, fadeOutMs: number) => void;
}

export default function AudioSettingsPanel({
	region,
	onVolumeChange,
	onDelete,
	onLabelChange,
	onEqualizerChange,
	onFadeChange,
}: AudioSettingsPanelProps) {
	const eq: AudioEqualizer = region.equalizer ?? { low: 0, mid: 0, high: 0 };
	const fadeInMs = region.fadeInMs ?? 0;
	const fadeOutMs = region.fadeOutMs ?? 0;
	const fileName = region.sourcePath.split("/").pop() ?? region.sourcePath;
	const volumePct = Math.round(region.volume * 100);

	return (
		<div className="flex flex-col gap-4 p-4">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-slate-200">Audio Track</h3>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-red-400/10"
					onClick={() => onDelete(region.id)}
					title="Remove audio track"
				>
					<Trash2 className="w-4 h-4" />
				</Button>
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

			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<label className="text-xs text-slate-500 flex items-center gap-1">
						<Volume2 className="w-3.5 h-3.5" />
						Volume
					</label>
					<span className="text-xs font-medium text-slate-300 tabular-nums">{volumePct}%</span>
				</div>
				<Slider
					min={0}
					max={100}
					step={1}
					value={[volumePct]}
					onValueChange={([v]) => onVolumeChange(region.id, v / 100)}
					className="w-full"
				/>
			</div>

			{onFadeChange && (
				<>
					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between text-xs text-slate-500">
							<span>Fade In</span>
							<span className="tabular-nums">{(fadeInMs / 1000).toFixed(2)}s</span>
						</div>
						<Slider
							min={0}
							max={2000}
							step={50}
							value={[fadeInMs]}
							onValueChange={([v]) => onFadeChange(region.id, v, fadeOutMs)}
							className="w-full"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between text-xs text-slate-500">
							<span>Fade Out</span>
							<span className="tabular-nums">{(fadeOutMs / 1000).toFixed(2)}s</span>
						</div>
						<Slider
							min={0}
							max={2000}
							step={50}
							value={[fadeOutMs]}
							onValueChange={([v]) => onFadeChange(region.id, fadeInMs, v)}
							className="w-full"
						/>
					</div>
				</>
			)}

			<div className="flex flex-col gap-1">
				<label className="text-xs text-slate-500">Start Offset</label>
				<p className="text-xs text-slate-400">
					{(region.sourceOffsetMs / 1000).toFixed(1)}s into source file
				</p>
			</div>

			{onEqualizerChange && (
				<div className="flex flex-col gap-2">
					<label className="text-xs text-slate-500 font-medium">Equalizer (dB)</label>
					{(["low", "mid", "high"] as const).map((band) => (
						<div key={band} className="flex flex-col gap-1">
							<div className="flex items-center justify-between text-xs text-slate-500">
								<span className="capitalize">{band}</span>
								<span className="tabular-nums">{eq[band] >= 0 ? "+" : ""}{eq[band].toFixed(1)}</span>
							</div>
							<Slider
								min={-12}
								max={12}
								step={0.5}
								value={[eq[band]]}
								onValueChange={([v]) =>
									onEqualizerChange(region.id, { ...eq, [band]: v })
								}
								className="w-full"
							/>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
