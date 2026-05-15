import { useState } from "react";
import { Link, Loader2, Wifi } from "lucide-react";
import { useShareStore } from "@/stores/useShareStore";
import { useNotificationStore } from "@/stores/useNotificationStore";

interface Props {
  onSwitchToMyShares: () => void;
}

export default function ConnectShare({ onSwitchToMyShares }: Props) {
  const { addConnection, peers } = useShareStore();
  const { addToast } = useNotificationStore();

  const [addr, setAddr] = useState("");
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = async () => {
    if (!addr.trim() || !password.trim()) return;
    setConnecting(true);
    setError("");

    try {
      await addConnection(addr.trim(), password.trim(), label.trim() || undefined);
      addToast({ type: "success", title: "连接成功", message: addr.trim() });
      setAddr("");
      setPassword("");
      setLabel("");
      onSwitchToMyShares();
    } catch (e) {
      setError(String(e));
      addToast({ type: "error", title: "连接失败", message: String(e) });
    } finally {
      setConnecting(false);
    }
  };

  const handleFillFromPeer = (peer: { addresses: string[]; port: number }) => {
    const ip = peer.addresses[0] || "";
    setAddr(ip);
  };

  return (
    <div className="animate-slide-up">
      {/* 连接表单 */}
      <div className="card p-5 max-w-md">
        <div className="flex items-center gap-3 mb-1">
          <h3 className="font-serif text-base" style={{ color: "var(--text-primary)" }}>
            连接到远程项目
          </h3>
          <div
            className="w-8 h-[2px] rounded-full"
            style={{ background: "var(--gold)", opacity: 0.5 }}
          />
        </div>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          输入对方的 IP 地址和密码来连接
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
              连接名称（可选）
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="为这个连接起个名字"
              className="input-base w-full"
              disabled={connecting}
            />
          </div>

          <div>
            <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
              连接地址
            </label>
            <input
              type="text"
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder="192.168.1.5:54321"
              className="input-base w-full font-mono"
              disabled={connecting}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            />
          </div>

          <div>
            <label className="block text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="共享密码"
              className="input-base w-full"
              disabled={connecting}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            />
          </div>

          {error && (
            <p
              className="text-xs px-2 py-1.5 rounded-md"
              style={{ background: "var(--color-danger-light)", color: "var(--color-danger)", border: "1px solid var(--color-danger-medium)" }}
            >
              {error}
            </p>
          )}

          <button
            className="btn btn-primary w-full"
            onClick={handleConnect}
            disabled={connecting || !addr.trim() || !password.trim()}
            style={{ opacity: connecting || !addr.trim() || !password.trim() ? 0.5 : 1 }}
          >
            {connecting ? (
              <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
            ) : (
              <Link size={14} strokeWidth={1.5} />
            )}
            {connecting ? "连接中..." : "连接"}
          </button>
        </div>
      </div>

      {/* 局域网发现 */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Wifi size={12} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
          <h3 className="text-xs font-serif" style={{ color: "var(--text-secondary)" }}>
            局域网实例
          </h3>
          <div
            className="w-6 h-[1px] rounded-full"
            style={{ background: "var(--gold)", opacity: 0.4 }}
          />
        </div>

        {peers.length > 0 ? (
          <div className="space-y-1.5">
            {peers.map((peer) => (
              <button
                key={peer.name}
                className="card flex items-center gap-3 p-3 text-left transition-all w-full hover-gold-border"
                style={{ cursor: "pointer" }}
                onClick={() => handleFillFromPeer(peer)}
              >
                <Wifi size={14} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
                    {peer.name}
                  </p>
                  <p className="text-xs font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
                    {peer.addresses[0]}:{peer.port}
                  </p>
                </div>
              </button>
            ))}
            <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
              点击可自动填充 IP 地址，分享端口需对方另行告知
            </p>
          </div>
        ) : (
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            未发现局域网实例
          </p>
        )}
      </div>
    </div>
  );
}