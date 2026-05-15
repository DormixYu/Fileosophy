import { useState } from "react";
import { Link, Loader2 } from "lucide-react";
import Modal from "@/components/common/Modal";
import { shareApi } from "@/lib/tauri-api";
import RemoteFileBrowserPanel from "@/components/sharing/RemoteFileBrowserPanel";

type ViewState = "form" | "browsing" | "connecting";

export default function JoinShareDialog({ onClose }: { onClose: () => void }) {
  const [addr, setAddr] = useState("");
  const [password, setPassword] = useState("");
  const [viewState, setViewState] = useState<ViewState>("form");
  const [errorMsg, setErrorMsg] = useState("");

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
      setViewState("browsing");
    } catch (e) {
      setErrorMsg(String(e));
      setViewState("form");
    }
  };

  const handleBackToForm = () => {
    setViewState("form");
  };

  const footerContent = viewState === "browsing" ? (
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
  );

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={viewState === "browsing" ? `远程文件 — ${addr}` : "链接项目"}
      width="max-w-md"
      footer={footerContent}
    >
      <div className="space-y-3">
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
            {errorMsg && (
              <div
                className="p-2 rounded-md text-xs"
                style={{
                  background: "var(--color-danger-light)",
                  color: "var(--color-danger)",
                  border: "1px solid var(--color-danger-medium)",
                }}
              >
                {errorMsg}
              </div>
            )}
          </>
        ) : (
          <RemoteFileBrowserPanel
            addr={addr.trim()}
            password={password.trim()}
            initialPath=""
            onBack={handleBackToForm}
            showUpload={true}
          />
        )}
      </div>
    </Modal>
  );
}