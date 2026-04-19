import { Film, FolderOpen, Monitor, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

interface RecentFile {
	path: string;
	name: string;
	lastOpened: number;
}

export function HomeScreen() {
	const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		window.electronAPI.getRecentFiles().then((files) => {
			setRecentFiles(files);
			setLoading(false);
		});
	}, []);

	async function handleOpenFile() {
		const result = await window.electronAPI.openVideoFilePicker();
		if (result.success && result.path) {
			await window.electronAPI.addRecentFile({
				path: result.path,
				name: result.path.split("/").pop() ?? result.path,
				lastOpened: Date.now(),
			});
			await window.electronAPI.openEditorFromFile(result.path);
		}
	}

	async function handleNewProject() {
		await window.electronAPI.switchToEditor();
	}

	async function handleStartRecording() {
		await window.electronAPI.switchToHud();
	}

	async function handleOpenRecent(file: RecentFile) {
		await window.electronAPI.addRecentFile({ ...file, lastOpened: Date.now() });
		await window.electronAPI.openEditorFromFile(file.path);
	}

	async function handleClearRecent() {
		await window.electronAPI.clearRecentFiles();
		setRecentFiles([]);
	}

	function formatDate(ts: number) {
		const d = new Date(ts);
		return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
	}

	return (
		<div
			className="flex flex-col h-full bg-[#0a0a0b] text-white select-none"
			style={{ fontFamily: "Inter, system-ui, sans-serif" }}
		>
			{/* Header */}
			<div className="flex items-center gap-3 px-8 pt-8 pb-6">
				<div className="w-8 h-8 rounded-lg bg-[#34B27B] flex items-center justify-center">
					<Film className="w-4 h-4 text-white" />
				</div>
				<span className="text-lg font-semibold tracking-tight">OpenScreen</span>
			</div>

			{/* Action cards */}
			<div className="grid grid-cols-3 gap-3 px-8 mb-8">
				<button
					type="button"
					onClick={handleNewProject}
					className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-center"
				>
					<Plus className="w-6 h-6 text-[#34B27B]" />
					<span className="text-sm font-medium text-slate-200">New Project</span>
					<span className="text-xs text-slate-500">Start fresh</span>
				</button>

				<button
					type="button"
					onClick={handleOpenFile}
					className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-center"
				>
					<FolderOpen className="w-6 h-6 text-blue-400" />
					<span className="text-sm font-medium text-slate-200">Open Video</span>
					<span className="text-xs text-slate-500">mp4, mov, webm…</span>
				</button>

				<button
					type="button"
					onClick={handleStartRecording}
					className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-center"
				>
					<Monitor className="w-6 h-6 text-red-400" />
					<span className="text-sm font-medium text-slate-200">Record Screen</span>
					<span className="text-xs text-slate-500">Capture & edit</span>
				</button>
			</div>

			{/* Recent files */}
			<div className="flex-1 overflow-hidden flex flex-col px-8">
				<div className="flex items-center justify-between mb-3">
					<span className="text-sm font-medium text-slate-400">Recent Projects</span>
					{recentFiles.length > 0 && (
						<button
							type="button"
							onClick={handleClearRecent}
							className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors"
						>
							<Trash2 className="w-3 h-3" />
							Clear
						</button>
					)}
				</div>

				{loading ? (
					<p className="text-xs text-slate-600">Loading…</p>
				) : recentFiles.length === 0 ? (
					<div className="flex-1 flex items-center justify-center">
						<p className="text-sm text-slate-600">No recent projects</p>
					</div>
				) : (
					<div className="overflow-y-auto flex flex-col gap-1 pb-6">
						{recentFiles.map((file) => (
							<button
								type="button"
								key={file.path}
								onClick={() => handleOpenRecent(file)}
								className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left group"
							>
								<Film className="w-4 h-4 text-slate-600 shrink-0" />
								<div className="flex-1 min-w-0">
									<p className="text-sm text-slate-300 truncate group-hover:text-white transition-colors">
										{file.name}
									</p>
									<p className="text-xs text-slate-600 truncate">{file.path}</p>
								</div>
								<span className="text-xs text-slate-600 shrink-0">{formatDate(file.lastOpened)}</span>
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
