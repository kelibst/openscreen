import type { AnnotationRegion } from "./types";
import { DEFAULT_ANNOTATION_STYLE } from "./types";

const STICKERS = [
	"🎉", "🔥", "⭐", "❤️", "😂", "👍", "🎵", "🌈",
	"💯", "🚀", "✨", "🎯", "💥", "🤩", "😎", "🎊",
	"💪", "🌟", "👏", "🎶",
];

interface StickerPickerPanelProps {
	onAddSticker: (region: Omit<AnnotationRegion, "id" | "zIndex">) => void;
}

export default function StickerPickerPanel({ onAddSticker }: StickerPickerPanelProps) {
	const handleStickerClick = (char: string) => {
		onAddSticker({
			startMs: 0,
			endMs: 3000,
			type: "text",
			content: char,
			position: { x: 40, y: 40 },
			size: { width: 10, height: 10 },
			style: {
				...DEFAULT_ANNOTATION_STYLE,
				fontSize: 64,
				backgroundColor: "transparent",
				textAlign: "center",
			},
		});
	};

	return (
		<div className="flex flex-col gap-3 p-4">
			<h3 className="text-sm font-semibold text-slate-200">Stickers</h3>
			<div className="grid grid-cols-5 gap-2">
				{STICKERS.map((sticker) => (
					<button
						key={sticker}
						type="button"
						onClick={() => handleStickerClick(sticker)}
						className="text-2xl h-10 w-10 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
						title={`Add ${sticker}`}
					>
						{sticker}
					</button>
				))}
			</div>
		</div>
	);
}
