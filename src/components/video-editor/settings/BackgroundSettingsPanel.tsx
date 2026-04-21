import Block from "@uiw/react-color-block";
import { Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useScopedT } from "@/contexts/I18nContext";
import { getAssetPath } from "@/lib/assetPath";
import { cn } from "@/lib/utils";

const WALLPAPER_COUNT = 18;
const WALLPAPER_RELATIVE = Array.from(
	{ length: WALLPAPER_COUNT },
	(_, i) => `wallpapers/wallpaper${i + 1}.jpg`,
);

const GRADIENTS = [
	"linear-gradient( 111.6deg,  rgba(114,167,232,1) 9.4%, rgba(253,129,82,1) 43.9%, rgba(253,129,82,1) 54.8%, rgba(249,202,86,1) 86.3% )",
	"linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)",
	"radial-gradient( circle farthest-corner at 3.2% 49.6%,  rgba(80,12,139,0.87) 0%, rgba(161,10,144,0.72) 83.6% )",
	"linear-gradient( 111.6deg,  rgba(0,56,68,1) 0%, rgba(163,217,185,1) 51.5%, rgba(231, 148, 6, 1) 88.6% )",
	"linear-gradient( 107.7deg,  rgba(235,230,44,0.55) 8.4%, rgba(252,152,15,1) 90.3% )",
	"linear-gradient( 91deg,  rgba(72,154,78,1) 5.2%, rgba(251,206,70,1) 95.9% )",
	"radial-gradient( circle farthest-corner at 10% 20%,  rgba(2,37,78,1) 0%, rgba(4,56,126,1) 19.7%, rgba(85,245,221,1) 100.2% )",
	"linear-gradient( 109.6deg,  rgba(15,2,2,1) 11.2%, rgba(36,163,190,1) 91.1% )",
	"linear-gradient(135deg, #FBC8B4, #2447B1)",
	"linear-gradient(109.6deg, #F635A6, #36D860)",
	"linear-gradient(90deg, #FF0101, #4DFF01)",
	"linear-gradient(315deg, #EC0101, #5044A9)",
	"linear-gradient(45deg, #ff9a9e 0%, #fad0c4 99%, #fad0c4 100%)",
	"linear-gradient(to top, #a18cd1 0%, #fbc2eb 100%)",
	"linear-gradient(to right, #ff8177 0%, #ff867a 0%, #ff8c7f 21%, #f99185 52%, #cf556c 78%, #b12a5b 100%)",
	"linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%)",
	"linear-gradient(to right, #4facfe 0%, #00f2fe 100%)",
	"linear-gradient(to top, #fcc5e4 0%, #fda34b 15%, #ff7882 35%, #c8699e 52%, #7046aa 71%, #0c1db8 87%, #020f75 100%)",
	"linear-gradient(to right, #fa709a 0%, #fee140 100%)",
	"linear-gradient(to top, #30cfd0 0%, #330867 100%)",
	"linear-gradient(to top, #c471f5 0%, #fa71cd 100%)",
	"linear-gradient(to right, #f78ca0 0%, #f9748f 19%, #fd868c 60%, #fe9a8b 100%)",
	"linear-gradient(to top, #48c6ef 0%, #6f86d6 100%)",
	"linear-gradient(to right, #0acffe 0%, #495aff 100%)",
];

const COLOR_PALETTE = [
	"#FF0000",
	"#FFD700",
	"#00FF00",
	"#FFFFFF",
	"#0000FF",
	"#FF6B00",
	"#9B59B6",
	"#E91E63",
	"#00BCD4",
	"#FF5722",
	"#8BC34A",
	"#FFC107",
	"#34B27B",
	"#000000",
	"#607D8B",
	"#795548",
];

interface BackgroundSettingsPanelProps {
	/** Currently selected wallpaper path / colour / gradient string */
	wallpaper: string;
	onWallpaperChange: (path: string) => void;
}

export function BackgroundSettingsPanel({ wallpaper, onWallpaperChange }: BackgroundSettingsPanelProps) {
	const t = useScopedT("settings");
	const [wallpaperPaths, setWallpaperPaths] = useState<string[]>([]);
	const [customImages, setCustomImages] = useState<string[]>([]);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [selectedColor, setSelectedColor] = useState("#ADADAD");
	const [gradient, setGradient] = useState<string>(GRADIENTS[0]);

	useEffect(() => {
		let mounted = true;
		(async () => {
			try {
				const resolved = await Promise.all(WALLPAPER_RELATIVE.map((p) => getAssetPath(p)));
				if (mounted) setWallpaperPaths(resolved);
			} catch (_err) {
				if (mounted) setWallpaperPaths(WALLPAPER_RELATIVE.map((p) => `/${p}`));
			}
		})();
		return () => {
			mounted = false;
		};
	}, []);

	const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = event.target.files;
		if (!files || files.length === 0) return;

		const file = files[0];

		// Validate file type - only allow JPG/JPEG
		const validTypes = ["image/jpeg", "image/jpg"];
		if (!validTypes.includes(file.type)) {
			toast.error(t("imageUpload.invalidFileType"), {
				description: t("imageUpload.jpgOnly"),
			});
			event.target.value = "";
			return;
		}

		const reader = new FileReader();

		reader.onload = (e) => {
			const dataUrl = e.target?.result as string;
			if (dataUrl) {
				setCustomImages((prev) => [...prev, dataUrl]);
				onWallpaperChange(dataUrl);
				toast.success(t("imageUpload.uploadSuccess"));
			}
		};

		reader.onerror = () => {
			toast.error(t("imageUpload.failedToUpload"), {
				description: t("imageUpload.errorReading"),
			});
		};

		reader.readAsDataURL(file);
		// Reset input so the same file can be selected again
		event.target.value = "";
	};

	const handleRemoveCustomImage = (imageUrl: string, event: React.MouseEvent) => {
		event.stopPropagation();
		setCustomImages((prev) => prev.filter((img) => img !== imageUrl));
		// If the removed image was selected, clear selection
		if (wallpaper === imageUrl) {
			onWallpaperChange(wallpaperPaths[0] || WALLPAPER_RELATIVE[0]);
		}
	};

	return (
		<Tabs defaultValue="image" className="w-full">
			<TabsList className="mb-2 bg-white/5 border border-white/5 p-0.5 w-full grid grid-cols-3 rounded-lg">
				<TabsTrigger
					value="image"
					className="data-[state=active]:bg-[#34B27B] data-[state=active]:text-white text-slate-400 text-[10px] py-1 rounded-md transition-all"
				>
					{t("background.image")}
				</TabsTrigger>
				<TabsTrigger
					value="color"
					className="data-[state=active]:bg-[#34B27B] data-[state=active]:text-white text-slate-400 text-[10px] py-1 rounded-md transition-all"
				>
					{t("background.color")}
				</TabsTrigger>
				<TabsTrigger
					value="gradient"
					className="data-[state=active]:bg-[#34B27B] data-[state=active]:text-white text-slate-400 text-[10px] py-1 rounded-md transition-all"
				>
					{t("background.gradient")}
				</TabsTrigger>
			</TabsList>

			<div className="max-h-[min(200px,25vh)] overflow-y-auto custom-scrollbar">
				<TabsContent value="image" className="mt-0 space-y-2">
					<input
						type="file"
						ref={fileInputRef}
						onChange={handleImageUpload}
						accept=".jpg,.jpeg,image/jpeg"
						className="hidden"
					/>
					<Button
						onClick={() => fileInputRef.current?.click()}
						variant="outline"
						className="w-full gap-2 bg-white/5 text-slate-200 border-white/10 hover:bg-[#34B27B] hover:text-white hover:border-[#34B27B] transition-all h-7 text-[10px]"
					>
						<Upload className="w-3 h-3" />
						{t("background.uploadCustom")}
					</Button>

					<div className="grid grid-cols-7 gap-1.5">
						{customImages.map((imageUrl, idx) => {
							const isSelected = wallpaper === imageUrl;
							return (
								<div
									key={`custom-${idx}`}
									className={cn(
										"aspect-square w-9 h-9 rounded-md border-2 overflow-hidden cursor-pointer transition-all duration-200 relative group shadow-sm",
										isSelected
											? "border-[#34B27B] ring-1 ring-[#34B27B]/30"
											: "border-white/10 hover:border-[#34B27B]/40 opacity-80 hover:opacity-100 bg-white/5",
									)}
									style={{
										backgroundImage: `url(${imageUrl})`,
										backgroundSize: "cover",
										backgroundPosition: "center",
									}}
									onClick={() => onWallpaperChange(imageUrl)}
									role="button"
								>
									<button
										onClick={(e) => handleRemoveCustomImage(imageUrl, e)}
										className="absolute top-0.5 right-0.5 w-3 h-3 bg-red-500/90 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
									>
										<X className="w-2 h-2 text-white" />
									</button>
								</div>
							);
						})}

						{(wallpaperPaths.length > 0
							? wallpaperPaths
							: WALLPAPER_RELATIVE.map((p) => `/${p}`)
						).map((path) => {
							const isSelected = (() => {
								if (!wallpaper) return false;
								if (wallpaper === path) return true;
								try {
									const clean = (s: string) =>
										s.replace(/^file:\/\//, "").replace(/^\//, "");
									if (clean(wallpaper).endsWith(clean(path))) return true;
									if (clean(path).endsWith(clean(wallpaper))) return true;
								} catch {
									// Best-effort comparison; fallback to strict match.
								}
								return false;
							})();
							return (
								<div
									key={path}
									className={cn(
										"aspect-square w-9 h-9 rounded-md border-2 overflow-hidden cursor-pointer transition-all duration-200 shadow-sm",
										isSelected
											? "border-[#34B27B] ring-1 ring-[#34B27B]/30"
											: "border-white/10 hover:border-[#34B27B]/40 opacity-80 hover:opacity-100 bg-white/5",
									)}
									style={{
										backgroundImage: `url(${path})`,
										backgroundSize: "cover",
										backgroundPosition: "center",
									}}
									onClick={() => onWallpaperChange(path)}
									role="button"
								/>
							);
						})}
					</div>
				</TabsContent>

				<TabsContent value="color" className="mt-0">
					<div className="p-1">
						<Block
							color={selectedColor}
							colors={COLOR_PALETTE}
							onChange={(color) => {
								setSelectedColor(color.hex);
								onWallpaperChange(color.hex);
							}}
							style={{
								width: "100%",
								borderRadius: "8px",
							}}
						/>
					</div>
				</TabsContent>

				<TabsContent value="gradient" className="mt-0">
					<div className="grid grid-cols-7 gap-1.5">
						{GRADIENTS.map((g, idx) => (
							<div
								key={g}
								className={cn(
									"aspect-square w-9 h-9 rounded-md border-2 overflow-hidden cursor-pointer transition-all duration-200 shadow-sm",
									gradient === g
										? "border-[#34B27B] ring-1 ring-[#34B27B]/30"
										: "border-white/10 hover:border-[#34B27B]/40 opacity-80 hover:opacity-100 bg-white/5",
								)}
								style={{ background: g }}
								aria-label={t("background.gradientLabel", {
									index: idx + 1,
								})}
								onClick={() => {
									setGradient(g);
									onWallpaperChange(g);
								}}
								role="button"
							/>
						))}
					</div>
				</TabsContent>
			</div>
		</Tabs>
	);
}
