import type { RowDefinition } from "dnd-timeline";
import { useRow } from "dnd-timeline";

interface RowProps extends RowDefinition {
	children: React.ReactNode;
	label?: string;
	hint?: string;
	isEmpty?: boolean;
	labelColor?: string;
	sidebar?: React.ReactNode;
}

export default function Row({ id, children, label, hint, isEmpty, labelColor = "#666", sidebar }: RowProps) {
	const { setNodeRef, rowWrapperStyle, rowStyle } = useRow({ id });

	return (
		<div
			className="border-b border-[#18181b] bg-[#18181b] relative flex"
			style={{ ...rowWrapperStyle, minHeight: 48, marginBottom: 4 }}
		>
			{sidebar && (
				<div
					className="shrink-0 border-r border-white/5 flex items-center bg-[#0f0f11]"
					style={{ width: 72, zIndex: 20 }}
				>
					{sidebar}
				</div>
			)}
			<div className="relative flex-1 min-w-0">
				{label && (
					<div
						className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase tracking-widest z-20 pointer-events-none select-none"
						style={{ color: labelColor, writingMode: "horizontal-tb" }}
					>
						{label}
					</div>
				)}
				{isEmpty && hint && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
						<span className="text-[11px] text-white/15 font-medium">{hint}</span>
					</div>
				)}
				<div ref={setNodeRef} style={rowStyle}>
					{children}
				</div>
			</div>
		</div>
	);
}
