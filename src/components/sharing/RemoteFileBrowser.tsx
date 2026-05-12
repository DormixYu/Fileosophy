import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, FolderOpen, File, Download, ArrowLeft, Loader2 } from "lucide-react";
import { shareApi } from "@/lib/tauri-api";
import type { RemoteDirEntry, SavedConnection } from "@/types";

interface RemoteFileBrowserProps {
  conn: SavedConnection;
  onClose: () => void;
}

export default function RemoteFileBrowser({ conn, onClose }: RemoteFileBrowserProps) {
  const [entries, setEntries] = useState<RemoteDirEntry[]>([]);
  const [currentPath, setCurrentPath] = useState(conn.last_path || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  // 加载目录内容
  const loadDir = useCallback(async (path: string) => {
    setLoading(true);
    setError("");
    try {
      const files = await shareApi.listRemote(conn.addr, conn.password, path);
      setEntries(files);
      setCurrentPath(path);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [conn.addr, conn.password]);

  // 挂载时加载根目录或上次路径
  useEffect(() => {
    loadDir(conn.last_path || "");
  }, [loadDir, conn.last_path]);

  // ESC 关闭
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleBrowseDir = (dirName: string) => {
    const newPath = currentPath ? `${currentPath}/${dirName}` : dirName;
    loadDir(newPath);
  };

  const handleGoBack = () => {
    const parts = currentPath.split("/");
    parts.pop();
    const parentPath = parts.join("/");
    loadDir(parentPath);
  };

  const handleBreadcrumb = (index: number, pathParts: string[]) => {
    const targetPath = pathParts.slice(0, index + 1).join("/");
    loadDir(targetPath);
  };

  const handleDownload = async (fileName: string) => {
    const remotePath = currentPath ? `${currentPath}/${fileName}` : fileName;
    setDownloading(fileName);
    setError("");
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const localPath = await save({
        defaultPath: fileName,
      });
      if (!localPath) {
        setDownloading(null);
        return;
      }
      await shareApi.downloadRemote(conn.addr, conn.password, remotePath, localPath);
    } catch (e) {
      setError(String(e));
    } finally {
      setDownloading(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const pathParts = currentPath ? currentPath.split("/") : [];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="rounded-xl shadow-xl"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
          }}
        >
          {/* 头部 */}
          <div
            className="flex items-center justify-between px-5 py-3.5 border-b"
            style={{ borderColor: "var(--border-light)" }}
          >
            <h2 className="text-base font-serif tracking-wide" style={{ color: "var(--text-primary)" }}>
              远程文件 — {conn.label}
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-md transition-colors hover:bg-[var(--bg-surface-alt)]"
              style={{ color: "var(--text-tertiary)" }}
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>

          {/* 内容 */}
          <div className="px-5 py-4 space-y-3">
            {/* 路径导航 */}
            <div
              className="flex items-center gap-2 text-xs font-mono px-2 py-1.5 rounded-md"
              style={{ background: "var(--bg-surface-alt)", color: "var(--text-secondary)" }}
            >
              <span
                className="cursor-pointer hover:underline"
                style={{ color: "var(--text-tertiary)" }}
                onClick={() => loadDir("")}
              >
                /
              </span>
              {pathParts.map((part, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span style={{ color: "var(--text-muted)" }}>/</span>
                  <span
                    className={i === pathParts.length - 1 ? "font-medium" : "cursor-pointer hover:underline"}
                    style={{ color: i === pathParts.length - 1 ? "var(--text-primary)" : "var(--text-tertiary)" }}
                    onClick={() => i < pathParts.length - 1 && handleBreadcrumb(i, pathParts)}
                  >
                    {part}
                  </span>
                </span>
              ))}
            </div>

            {/* 加载状态 */}
            {loading && (
              <div className="flex items-center gap-2 text-xs py-3" style={{ color: "var(--text-tertiary)" }}>
                <Loader2 size={14} className="animate-spin" />
                加载中…
              </div>
            )}

            {/* 文件列表 */}
            {!loading && (
              <div className="max-h-60 overflow-auto space-y-0.5">
                {currentPath && (
                  <button
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors"
                    style={{ color: "var(--text-tertiary)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-alt)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    onClick={handleGoBack}
                  >
                    <ArrowLeft size={13} strokeWidth={1.5} />
                    ..
                  </button>
                )}
                {entries.length === 0 && !error ? (
                  <div className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>
                    空文件夹
                  </div>
                ) : (
                  entries.map((entry) => (
                    <div
                      key={entry.name}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors group"
                      style={{ color: "var(--text-primary)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-alt)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {entry.is_dir ? (
                        <>
                          <FolderOpen size={13} strokeWidth={1.5} style={{ color: "var(--gold)", flexShrink: 0 }} />
                          <span
                            className="flex-1 truncate cursor-pointer"
                            onClick={() => handleBrowseDir(entry.name)}
                          >
                            {entry.name}
                          </span>
                        </>
                      ) : (
                        <>
                          <File size={13} strokeWidth={1.5} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                          <span className="flex-1 truncate">{entry.name}</span>
                          <span className="text-[10px] mr-1" style={{ color: "var(--text-muted)" }}>
                            {formatSize(entry.size)}
                          </span>
                          <button
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity"
                            style={{ color: "var(--text-muted)" }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold)")}
                            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                            onClick={() => handleDownload(entry.name)}
                            disabled={downloading === entry.name}
                          >
                            {downloading === entry.name ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Download size={12} strokeWidth={1.5} />
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 错误信息 */}
            {error && (
              <div
                className="p-2 rounded-md text-xs"
                style={{ background: "rgba(184,92,80,0.1)", color: "var(--color-danger)", border: "1px solid rgba(184,92,80,0.2)" }}
              >
                {error}
              </div>
            )}
          </div>

          {/* 底部 */}
          <div
            className="flex items-center justify-end px-5 py-3 border-t"
            style={{ borderColor: "var(--border-light)" }}
          >
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}