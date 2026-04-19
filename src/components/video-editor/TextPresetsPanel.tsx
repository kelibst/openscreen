import type { AnnotationRegion, AnnotationTextStyle } from "./types";

interface TextPreset {
	name: string;
	style: Partial<AnnotationTextStyle>;
	content: string;
}

const TEXT_PRESETS: TextPreset[] = [
	{
		name: "Title",
		content: "Title Text",
		style: {
			fontSize: 56,
			fontWeight: "bold",
			fontStyle: "normal",
			color: "#ffffff",
			backgroundColor: "transparent",
			fontFamily: "Inter",
			textAlign: "center",
		},
	},
	{
		name: "Subtitle",
		content: "Subtitle",
		style: {
			fontSize: 36,
			fontWeight: "normal",
			fontStyle: "italic",
			color: "#cccccc",
			backgroundColor: "transparent",
			fontFamily: "Inter",
			textAlign: "center",
		},
	},
	{
		name: "Caption",
		content: "Caption text goes here",
		style: {
			fontSize: 24,
			fontWeight: "normal",
			fontStyle: "normal",
			color: "#ffffff",
			backgroundColor: "rgba(0,0,0,0.6)",
			fontFamily: "Inter",
			textAlign: "center",
		},
	},
	{
		name: "Neon",
		content: "NEON",
		style: {
			fontSize: 48,
			fontWeight: "bold",
			fontStyle: "normal",
			color: "#00ffcc",
			backgroundColor: "transparent",
			fontFamily: "Inter",
			textAlign: "center",
		},
	},
	{
		name: "Vintage",
		content: "Vintage",
		style: {
			fontSize: 44,
			fontWeight: "bold",
			fontStyle: "italic",
			color: "#d4a574",
			backgroundColor: "transparent",
			fontFamily: "Georgia",
			textAlign: "center",
		},
	},
	{
		name: "Minimal",
		content: "minimal",
		style: {
			fontSize: 28,
			fontWeight: "normal",
			fontStyle: "normal",
			color: "#ffffff",
			backgroundColor: "transparent",
			fontFamily: "Inter",
			textAlign: "left",
			textDecoration: "none",
		},
	},
];

interface TextPresetsPanelProps {
	onApplyPreset: (partial: Partial<AnnotationRegion>) => void;
}

export default function TextPresetsPanel({ onApplyPreset }: TextPresetsPanelProps) {
	return (
		<div className="flex flex-col gap-3 p-4">
			<h3 className="text-sm font-semibold text-slate-200">Text Presets</h3>
			<div className="flex flex-col gap-2">
				{TEXT_PRESETS.map((preset) => (
					<button
						key={preset.name}
						type="button"
						onClick={() =>
							onApplyPreset({
								type: "text",
								content: preset.content,
								style: {
									color: "#ffffff",
									backgroundColor: "transparent",
									fontSize: 32,
									fontFamily: "Inter",
									fontWeight: "normal",
									fontStyle: "normal",
									textDecoration: "none",
									textAlign: "center",
									...preset.style,
								},
								position: { x: 35, y: 45 },
								size: { width: 30, height: 15 },
							})
						}
						className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
					>
						<span
							className="text-sm font-medium"
							style={{ color: preset.style.color ?? "#ffffff" }}
						>
							{preset.name}
						</span>
						<p className="text-xs text-slate-500 mt-0.5 truncate">{preset.content}</p>
					</button>
				))}
			</div>
		</div>
	);
}
