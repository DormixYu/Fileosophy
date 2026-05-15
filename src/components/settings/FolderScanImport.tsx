import { useState } from "react";
import { FolderOpen, Search, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { folderApi } from "@/lib/tauri-api";
import { useProjectStore } from "@/stores/useProjectStore";
import type { ScannedFolder } from "@/types";

export default function FolderScanImport({ addToast }: { addToast: (t: { type: "info" | "success" | "warning" | "error" | "file-received"; title: string; message: string }) => void }) {
  const [scanPath, setScanPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScannedFolder[]>([]);
  const [importing, setImporting] = useState<string | null>(null);

  const handleScan = async () => {
    if (!scanPath.trim()) return;
    setScanning(true);
    setResults([]);
    try {
      const data = await folderApi.scanFolders(scanPath);
      setResults(data);
      addToast({ type: "success", title: "扫描完成", message: `发现 ${data.length} 个文件夹` });
    } catch (e) {
      addToast({ type: "error", title: "扫描失败", message: String(e) });
    } finally {
      setScanning(false);
    }
  };

  const handleImport = async (folder: ScannedFolder) => {
    setImporting(folder.path);
    try {
      await folderApi.importFromFolder(folder);
      addToast({ type: "success", title: "导入成功", message: `已导入 "${folder.folder_name}"` });
      setResults((prev) => prev.filter((r) => r.path !== folder.path));
      await useProjectStore.getState().fetchProjects();
    } catch (e) {
      addToast({ type: "error", title: "导入失败", message: String(e) });
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="mb-6 mt-6">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-sm font-serif" style={{ color: "var(--text-secondary)" }}>
          文件夹扫描导入
        </h3>
        <div
          className="w-6 h-[1px] rounded-full"
          style={{ background: "var(--gold)", opacity: 0.4 }}
        />
      </div>
      <p className="text-xs mb-3 font-mono" style={{ color: "var(--text-tertiary)" }}>
        选择一个目录，自动识别子文件夹中的项目编号和名称，一键导入为项目。
      </p>
      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          value={scanPath}
          onChange={(e) => setScanPath(e.target.value)}
          placeholder="选择或输入目录路径"
          className="input-base flex-1"
        />
        <button
          className="btn btn-outline btn-sm"
          onClick={async () => {
            const { open } = await import("@tauri-apps/plugin-dialog");
            const selected = await open({ directory: true, multiple: false });
            if (selected) setScanPath(selected as string);
          }}
        >
          <FolderOpen size={13} strokeWidth={1.5} />
          选择
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleScan}
          disabled={scanning || !scanPath.trim()}
        >
          {scanning ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" /> : <Search size={13} strokeWidth={1.5} />}
          {scanning ? "扫描中..." : "扫描"}
        </button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2 mt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
              共 {results.length} 个文件夹，{results.filter((r) => r.matched).length} 个已匹配
            </span>
            <button
              className="btn btn-primary btn-sm"
              onClick={async () => {
                const matched = results.filter((r) => r.matched);
                let failedCount = 0;
                for (const folder of matched) {
                  try { await folderApi.importFromFolder(folder); } catch { failedCount++; }
                }
                setResults([]);
                useProjectStore.getState().fetchProjects();
                if (failedCount > 0) {
                  addToast({ type: "warning", title: "批量导入完成", message: `已导入 ${matched.length - failedCount} 个项目，${failedCount} 个失败` });
                } else {
                  addToast({ type: "success", title: "批量导入完成", message: `已导入 ${matched.length} 个项目` });
                }
              }}
            >
              全部导入（已匹配）
            </button>
          </div>
          {results.map((folder) => (
            <div
              key={folder.path}
              className="card flex items-center gap-3 py-2 px-3 transition-colors"
            >
              {/* 品牌化状态图标 */}
              {folder.matched ? (
                <CheckCircle2 size={14} strokeWidth={1.5} style={{ color: "var(--color-success)", flexShrink: 0 }} />
              ) : (
                <AlertCircle size={14} strokeWidth={1.5} style={{ color: "var(--color-danger)", flexShrink: 0 }} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate font-serif" style={{ color: "var(--text-primary)" }}>{folder.folder_name}</p>
                <p className="text-xs truncate font-mono" style={{ color: "var(--text-tertiary)" }}>
                  {folder.matched
                    ? `${folder.parsed_code} | ${folder.parsed_name} | ${folder.inferred_type}`
                    : folder.path}
                </p>
              </div>
              <button
                className="btn btn-outline btn-sm"
                disabled={importing === folder.path}
                onClick={() => handleImport(folder)}
              >
                {importing === folder.path ? "导入中..." : "导入"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}