import { useState, useEffect, useCallback } from "react";
import {
  FolderOpen,
  File,
  Download,
  Upload,
  ArrowLeft,
  Loader2,
  Home,
} from "lucide-react";
import { shareApi } from "@/lib/tauri-api";
import { formatSize } from "@/lib/formatUtils";
import { useShareStore } from "@/stores/useShareStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import type { RemoteDirEntry } from "@/types";

interface RemoteFileBrowserPanelProps {
  addr: string;
  password: string;
  initialPath?: string;
  onBack?: () => void;
  showUpload?: boolean;
  useStoreUpload?: boolean;
  onPathChange?: (path: string) => void;
}

export default function RemoteFileBrowserPanel({
  addr,
  password,
  initialPath = "",
  onBack,
  showUpload = true,
  useStoreUpload = false,
  onPathChange,
}: RemoteFileBrowserPanelProps) {
  const { uploadRemote: storeUploadRemote } = useShareStore();
  const { addToast } = useNotificationStore();
  const [entries, setEntries] = useState<RemoteDirEntry[]>([]);
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const loadDir = useCallback(
    async (path: string) => {
      setLoading(true);
      setError("");
      try {
        const files = await shareApi.listRemote(addr, password, path);
        setEntries(files);
        setCurrentPath(path);
        onPathChange?.(path);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [addr, password, onPathChange],
  );

  useEffect(() => {
    loadDir(initialPath);
  }, [loadDir, initialPath]);

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
      const localPath = await save({ defaultPath: fileName });
      if (!localPath) {
        setDownloading(null);
        return;
      }
      const savedPath = await shareApi.downloadRemote(addr, password, remotePath, localPath);
      addToast({ type: "success", title: "下载成功", message: savedPath || localPath });
    } catch (e) {
      setError(String(e));
      addToast({ type: "error", title: "下载失败", message: String(e) });
    } finally {
      setDownloading(null);
    }
  };

  const handleUpload = async () => {
    setError("");
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ multiple: false });
      if (!selected) return;
      const filePath = selected as string;
      const fileName = filePath.split(/[\\/]/).pop() || "unknown";
      setUploading(fileName);
      if (useStoreUpload) {
        await storeUploadRemote(addr, password, currentPath, fileName, filePath);
      } else {
        await shareApi.uploadRemote(addr, password, currentPath, fileName, filePath);
      }
      await loadDir(currentPath);
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(null);
    }
  };

  const pathParts = currentPath ? currentPath.split("/") : [];

  return (
    <div className="space-y-3">
      {onBack && (
        <button className="btn btn-ghost btn-sm text-xs" onClick={onBack}>
          <ArrowLeft size={13} strokeWidth={1.5} />
          返回连接
        </button>
      )}

      {/* 面包屑导航 */}
      <div
        className="flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded-lg"
        style={{
          background: "var(--bg-surface-alt)",
          border: "1px solid var(--border-light)",
        }}
      >
        <Home
          size={12}
          strokeWidth={1.5}
          className="cursor-pointer hover-gold-text"
          style={{ color: "var(--text-muted)" }}
          onClick={() => loadDir("")}
        />
        <span style={{ color: "var(--border-default)" }}>/</span>
        {pathParts.length > 0 ? (
          pathParts.map((part, i) => (
            <span key={i} className="flex items-center gap-1">
              <span
                className={
                  i === pathParts.length - 1
                    ? "font-medium text-gold"
                    : "cursor-pointer hover-gold-text"
                }
                style={{
                  color:
                    i === pathParts.length - 1
                      ? undefined
                      : "var(--text-tertiary)",
                }}
                onClick={() =>
                  i < pathParts.length - 1 && handleBreadcrumb(i, pathParts)
                }
              >
                {part}
              </span>
              {i < pathParts.length - 1 && (
                <span style={{ color: "var(--border-default)" }}>/</span>
              )}
            </span>
          ))
        ) : (
          <span style={{ color: "var(--text-muted)" }}>根目录</span>
        )}
      </div>

      {/* 上传按钮 */}
      {showUpload && (
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleUpload}
            disabled={uploading !== null}
          >
            {uploading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Upload size={12} strokeWidth={1.5} />
            )}
            {uploading ? `上传 ${uploading}...` : "上传文件"}
          </button>
        </div>
      )}

      {/* 加载状态 */}
      {loading && (
        <div
          className="flex items-center gap-2 text-xs py-3"
          style={{ color: "var(--text-tertiary)" }}
        >
          <Loader2 size={14} className="animate-spin" />
          加载中...
        </div>
      )}

      {/* 文件列表 */}
      {!loading && (
        <div className="max-h-60 overflow-auto space-y-0.5">
          {currentPath && (
            <button
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors hover-surface-alt-bg"
              style={{ color: "var(--text-tertiary)" }}
              onClick={handleGoBack}
            >
              <ArrowLeft size={13} strokeWidth={1.5} />
              ..
            </button>
          )}
          {entries.length === 0 && !error ? (
            <div
              className="text-xs py-4 text-center font-serif"
              style={{ color: "var(--text-muted)" }}
            >
              空文件夹
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.name}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors group hover-surface-alt-bg"
                style={{ color: "var(--text-primary)" }}
              >
                {entry.is_dir ? (
                  <>
                    <FolderOpen
                      size={13}
                      strokeWidth={1.5}
                      style={{ color: "var(--gold)", flexShrink: 0 }}
                    />
                    <span
                      className="flex-1 truncate cursor-pointer text-gold hover-gold-text"
                      onClick={() => handleBrowseDir(entry.name)}
                    >
                      {entry.name}
                    </span>
                  </>
                ) : (
                  <>
                    <File
                      size={13}
                      strokeWidth={1.5}
                      style={{ color: "var(--text-muted)", flexShrink: 0 }}
                    />
                    <span className="flex-1 truncate">{entry.name}</span>
                    <span
                      className="text-[10px] mr-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {formatSize(entry.size)}
                    </span>
                    <button
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity hover-gold-text"
                      style={{
                        color: "var(--text-muted)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                      }}
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
          style={{
            background: "var(--color-danger-light)",
            color: "var(--color-danger)",
            border: "1px solid var(--color-danger-medium)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}