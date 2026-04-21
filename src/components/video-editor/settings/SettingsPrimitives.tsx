/**
 * Shared primitive UI atoms used across SettingsPanel sub-panels.
 */
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// LabeledSlider
// ---------------------------------------------------------------------------

interface LabeledSliderProps {
	label: string;
	valueLabel: string;
	value: number[];
	onValueChange: (values: number[]) => void;
	onValueCommit?: () => void;
	min: number;
	max: number;
	step: number;
	disabled?: boolean;
	className?: string;
	sliderClassName?: string;
}

export function LabeledSlider({
	label,
	valueLabel,
	value,
	onValueChange,
	onValueCommit,
	min,
	max,
	step,
	disabled,
	className,
	sliderClassName,
}: LabeledSliderProps) {
	return (
		<div className={cn("p-2 rounded-lg bg-white/5 border border-white/5", className)}>
			<div className="flex items-center justify-between mb-1">
				<div className="text-[10px] font-medium text-slate-300">{label}</div>
				<span className="text-[10px] text-slate-500 font-mono">{valueLabel}</span>
			</div>
			<Slider
				value={value}
				onValueChange={onValueChange}
				onValueCommit={onValueCommit}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				className={cn(
					"w-full [&_[role=slider]]:bg-[#34B27B] [&_[role=slider]]:border-[#34B27B] [&_[role=slider]]:h-3 [&_[role=slider]]:w-3",
					sliderClassName,
				)}
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
// PresetButton
// ---------------------------------------------------------------------------

interface PresetButtonProps {
	label: string;
	isActive: boolean;
	onClick: () => void;
	disabled?: boolean;
	/** Tailwind colour token used for active state border/bg/shadow. Defaults to #34B27B. */
	activeColor?: string;
	className?: string;
	children?: React.ReactNode;
}

export function PresetButton({
	label,
	isActive,
	onClick,
	disabled,
	activeColor = "#34B27B",
	className,
	children,
}: PresetButtonProps) {
	const activeStyle = activeColor === "#34B27B"
		? "border-[#34B27B] bg-[#34B27B] text-white shadow-[#34B27B]/20"
		: activeColor === "#d97706"
		? "border-[#d97706] bg-[#d97706] text-white shadow-[#d97706]/20"
		: "border-[#34B27B] bg-[#34B27B] text-white shadow-[#34B27B]/20";

	return (
		<Button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"h-auto w-full rounded-lg border px-1 py-2 text-center shadow-sm transition-all",
				"duration-200 ease-out",
				disabled ? "opacity-40 cursor-not-allowed" : "opacity-100 cursor-pointer",
				isActive
					? activeStyle
					: "border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:border-white/10 hover:text-slate-200",
				className,
			)}
		>
			{children ?? <span className="text-xs font-semibold">{label}</span>}
		</Button>
	);
}
