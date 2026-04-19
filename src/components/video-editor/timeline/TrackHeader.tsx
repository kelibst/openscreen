import { Lock, Unlock, Volume2, VolumeX } from "lucide-react";
import { useRef, useState } from "react";

interface TrackHeaderProps {
	label: string;
	muted: boolean;
	locked: boolean;
	onMuteToggle: () => void;
	onLockToggle: () => void;
	onLabelChange: (label: string) => void;
}

export default function TrackHeader({
	label,
	muted,
	locked,
	onMuteToggle,
	onLockToggle,
	onLabelChange,
}: TrackHeaderProps) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(label);
	const inputRef = useRef<HTMLInputElement>(null);

	const commitEdit = () => {
		setEditing(false);
		const trimmed = draft.trim();
		if (trimmed && trimmed !== label) {
			onLabelChange(trimmed);
		} else {
			setDraft(label);
		}
	};

	return (
		<div
			className="flex items-center gap-1 px-1.5 h-full"
			style={{ width: 72, minWidth: 72, userSelect: "none" }}
		>
			<button
				type="button"
				onClick={onMuteToggle}
				className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
				title={muted ? "Unmute" : "Mute"}
			>
				{muted ? (
					<VolumeX className="w-3 h-3 text-slate-500" />
				) : (
					<Volume2 className="w-3 h-3 text-slate-400" />
				)}
			</button>

			{editing ? (
				<input
					ref={inputRef}
					className="flex-1 min-w-0 text-[10px] bg-white/10 border border-white/20 rounded px-1 py-0.5 text-white outline-none"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={commitEdit}
					onKeyDown={(e) => {
						if (e.key === "Enter") commitEdit();
						if (e.key === "Escape") { setDraft(label); setEditing(false); }
					}}
					autoFocus
				/>
			) : (
				<span
					className="flex-1 min-w-0 text-[10px] text-slate-400 truncate cursor-text hover:text-slate-200 transition-colors"
					onDoubleClick={() => { setDraft(label); setEditing(true); }}
					title={label}
				>
					{label}
				</span>
			)}

			<button
				type="button"
				onClick={onLockToggle}
				className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
				title={locked ? "Unlock" : "Lock"}
			>
				{locked ? (
					<Lock className="w-3 h-3 text-amber-400" />
				) : (
					<Unlock className="w-3 h-3 text-slate-500" />
				)}
			</button>
		</div>
	);
}
