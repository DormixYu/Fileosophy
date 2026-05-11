import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Check, Share2 } from "lucide-react";
import { shareApi, systemApi } from "@/lib/tauri-api";
import type { Project } from "@/types";

interface ShareProjectDialogProps {
  project: Project;
  onClose: () => void;
  initialSharing?: boolean;
  initialPort?: number;
}

type ShareState = "idle" | "sharing" | "error";

export default function ShareProjectDialog({
  project,
  onClose,
  initialSharing = false,
  initialPort = 0,
}: ShareProjectDialogProps) {
  const [state, setState] = useState<ShareState>(initialSharing ? "sharing" : "idle");
  const [password, setPassword] = useState("");
  const [port, setPort] = useState(initialPort);
  const [localIp, setLocalIp] = useState("");
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // 获取本机 IP
  useEffect(() => {
    systemApi.localIp().then(setLocalIp).catch(() => setLocalIp("获取失败"));
  }, []);

  const handleStart = async () => {
    if (!password.trim() || password.length < 4) {
      setErrorMsg("密码至少 4 位");
      return;
    }
    if (!project.folder_path) {
      setErrorMsg("此项目未设置文件夹路径，无法分享");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const p = await shareApi.start(project.folder_path, password.trim());
      setPort(p);
      setState("sharing");
    } catch (e) {
      setErrorMsg(String(e));
      setState("error");
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await shareApi.stop();
      setState("idle");
    } catch (e) {
      setErrorMsg(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    const text = `${localIp}:${port}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级：选中文本
    }
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm mx-4 animate-scale-in"
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
              分享项目
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
            {/* 项目信息 */}
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              <div className="font-serif mb-1" style={{ color: "var(--text-secondary)" }}>
                {project.name}
              </div>
              <code className="font-mono text-[11px]">
                {project.project_number || "—"}
              </code>
            </div>

            {/* 文件夹路径 */}
            <div
              className="p-2 rounded-md text-[11px] font-mono break-all"
              style={{
                background: "var(--bg-surface-alt)",
                color: "var(--text-tertiary)",
                border: "1px solid var(--border-default)",
              }}
            >
              {project.folder_path || "未设置文件夹路径"}
            </div>

            {state === "sharing" ? (
              <>
                {/* 分享中 — 连接信息 */}
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  其他用户可通过以下地址连接：
                </div>
                <div
                  className="flex items-center gap-2 p-2.5 rounded-md cursor-pointer select-all"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-default)",
                  }}
                  onClick={handleCopy}
                  title="点击复制"
                >
                  <code
                    className="flex-1 font-mono text-sm tracking-wide"
                    style={{ color: "var(--gold)" }}
                  >
                    {localIp}:{port}
                  </code>
                  <button
                    className="p-1 rounded transition-colors hover:bg-[var(--bg-surface-alt)]"
                    style={{
                      color: copied ? "var(--gold)" : "var(--text-muted)",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                    }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* 密码输入 */}
                <div>
                  <label
                    className="block text-xs mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    设置访问密码
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少 4 位"
                    autoFocus
                    className="w-full px-3 py-2 text-sm rounded-md outline-none"
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-default)",
                      color: "var(--text-primary)",
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleStart()}
                  />
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
            {state === "sharing" ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleStop}
                disabled={loading}
              >
                {loading ? "停止中…" : "停止共享"}
              </button>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm" onClick={onClose}>
                  取消
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleStart}
                  disabled={loading || !project.folder_path}
                >
                  {loading ? (
                    "启动中…"
                  ) : (
                    <>
                      <Share2 size={13} strokeWidth={1.5} />
                      开始共享
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
