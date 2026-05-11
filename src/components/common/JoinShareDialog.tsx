import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Link,
  FolderOpen,
  File,
  Download,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { shareApi } from "@/lib/tauri-api";

interface RemoteEntry {
  name: string;
  is_dir: boolean;
  size: number;
}

type ViewState = "form" | "browsing" | "connecting";

export default function JoinShareDialog({ onClose }: { onClose: () => void }) {
  const [addr, setAddr] = useState("");
  const [password, setPassword] = useState("");
  const [viewState, setViewState] = useState<ViewState>("form");
  const [errorMsg, setErrorMsg] = useState("");
  const [entries, setEntries] = useState<RemoteEntry[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleConnect = async () => {
    if (!addr.trim()) {
      setErrorMsg("请输入连接地址");
      return;
    }
    if (!password.trim()) {
      setErrorMsg("请输入密码");
      return;
    }
    setViewState("connecting");
    setErrorMsg("");
    try {
      await shareApi.join(addr.trim(), password.trim());
      // 连接成功，列出根目录
      const files = await shareApi.listRemote(addr.trim(), password.trim(), "");
      setEntries(files);
      setCurrentPath("");
      setViewState("browsing");
    } catch (e) {
      setErrorMsg(String(e));
      setViewState("form");
    }
  };

  const handleBrowseDir = async (dirName: string) => {
    const newPath = currentPath ? `${currentPath}/${dirName}` : dirName;
    try {
      const files = await shareApi.listRemote(addr.trim(), password.trim(), newPath);
      setEntries(files);
      setCurrentPath(newPath);
    } catch (e) {
      setErrorMsg(String(e));
    }
  };

  const handleGoBack = async () => {
    const parts = currentPath.split("/");
    parts.pop();
    const parentPath = parts.join("/");
    try {
      const files = await shareApi.listRemote(addr.trim(), password.trim(), parentPath);
      setEntries(files);
      setCurrentPath(parentPath);
    } catch (e) {
      setErrorMsg(String(e));
    }
  };

  const handleDownload = async (fileName: string) => {
    const remotePath = currentPath ? `${currentPath}/${fileName}` : fileName;
    setDownloading(fileName);
    try {
      // 保存到用户的下载目录
      const localPath = `~/Downloads/${fileName}`;
      await shareApi.downloadRemote(
        addr.trim(),
        password.trim(),
        remotePath,
        localPath,
      );
    } catch (e) {
      setErrorMsg(String(e));
    } finally {
      setDownloading(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

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
            <h2
              className="text-base font-serif tracking-wide"
              style={{ color: "var(--text-primary)" }}
            >
              {viewState === "browsing"
                ? `远程文件 — ${addr}`
                : "链接项目"}
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
            {viewState === "form" || viewState === "connecting" ? (
              <>
                <div>
                  <label
                    className="block text-xs mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    连接地址（IP:端口）
                  </label>
                  <input
                    type="text"
                    value={addr}
                    onChange={(e) => setAddr(e.target.value)}
                    placeholder="192.168.1.5:54321"
                    autoFocus
                    className="w-full px-3 py-2 text-sm rounded-md outline-none font-mono"
                    style={{
                      background: "var(--bg-surface-alt)",
                      border: "1px solid var(--border-default)",
                      color: "var(--text-primary)",
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                  />
                </div>
                <div>
                  <label
                    className="block text-xs mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    密码
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="输入共享密码"
                    className="w-full px-3 py-2 text-sm rounded-md outline-none"
                    style={{
                      background: "var(--bg-surface-alt)",
                      border: "1px solid var(--border-default)",
                      color: "var(--text-primary)",
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                  />
                </div>
                {viewState === "connecting" && (
                  <div
                    className="flex items-center gap-2 text-xs py-2"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    <Loader2 size={14} className="animate-spin" />
                    连接中…
                  </div>
                )}
              </>
            ) : (
              <>
                {/* 路径导航 */}
                <div
                  className="flex items-center gap-2 text-xs font-mono px-2 py-1.5 rounded-md"
                  style={{
                    background: "var(--bg-surface-alt)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span style={{ color: "var(--text-muted)" }}>/</span>
                  {currentPath
                    ? currentPath.split("/").map((part, i, arr) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && (
                            <span style={{ color: "var(--text-muted)" }}>/</span>
                          )}
                          <span
                            className={
                              i === arr.length - 1
                                ? "font-medium"
                                : "cursor-pointer hover:underline"
                            }
                            style={{
                              color:
                                i === arr.length - 1
                                  ? "var(--text-primary)"
                                  : "var(--text-tertiary)",
                            }}
                            onClick={() => {
                              if (i < arr.length - 1) {
                                const parentPath = arr.slice(0, i + 1).join("/");
                                shareApi
                                  .listRemote(addr.trim(), password.trim(), parentPath)
                                  .then(setEntries)
                                  .catch(() => {});
                                setCurrentPath(parentPath);
                              }
                            }}
                          >
                            {part}
                          </span>
                        </span>
                      ))
                    : "根目录"}
                </div>

                {/* 文件列表 */}
                <div className="max-h-60 overflow-auto space-y-0.5">
                  {currentPath && (
                    <button
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors"
                      style={{ color: "var(--text-tertiary)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--bg-surface-alt)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                      onClick={handleGoBack}
                    >
                      <ArrowLeft size={13} strokeWidth={1.5} />
                      ..
                    </button>
                  )}
                  {entries.length === 0 ? (
                    <div
                      className="text-xs py-4 text-center"
                      style={{ color: "var(--text-muted)" }}
                    >
                      空文件夹
                    </div>
                  ) : (
                    entries.map((entry) => (
                      <div
                        key={entry.name}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors group"
                        style={{ color: "var(--text-primary)" }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "var(--bg-surface-alt)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        {entry.is_dir ? (
                          <>
                            <FolderOpen
                              size={13}
                              strokeWidth={1.5}
                              style={{ color: "var(--gold)", flexShrink: 0 }}
                            />
                            <span
                              className="flex-1 truncate cursor-pointer"
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
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity"
                              style={{ color: "var(--text-muted)" }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.color = "var(--gold)")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.color = "var(--text-muted)")
                              }
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
              </>
            )}

            {/* 错误信息 */}
            {errorMsg && (
              <div
                className="p-2 rounded-md text-xs"
                style={{
                  background: "rgba(184,92,80,0.1)",
                  color: "var(--color-danger)",
                  border: "1px solid rgba(184,92,80,0.2)",
                }}
              >
                {errorMsg}
              </div>
            )}
          </div>

          {/* 底部 */}
          <div
            className="flex items-center justify-end gap-2 px-5 py-3 border-t"
            style={{ borderColor: "var(--border-light)" }}
          >
            {viewState === "browsing" ? (
              <button className="btn btn-ghost btn-sm" onClick={onClose}>
                关闭
              </button>
            ) : viewState === "connecting" ? null : (
              <>
                <button className="btn btn-ghost btn-sm" onClick={onClose}>
                  取消
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleConnect}
                  disabled={!addr.trim() || !password.trim()}
                >
                  <Link size={13} strokeWidth={1.5} />
                  连接
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
