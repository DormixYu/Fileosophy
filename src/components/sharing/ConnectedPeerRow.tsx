import { useState } from "react";
import { RefreshCw, FolderOpen, X } from "lucide-react";
import { useShareStore } from "@/stores/useShareStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { shareApi } from "@/lib/tauri-api";
import type { SavedConnection } from "@/types";

import { formatTimeFull } from "@/lib/formatUtils";

interface ConnectedPeerRowProps {
  conn: SavedConnection;
  onBrowse: () => void;
}

export default function ConnectedPeerRow({ conn, onBrowse }: ConnectedPeerRowProps) {
  const { reconnect, removeConnection } = useShareStore();
  const { addToast } = useNotificationStore();
  const [reconnectPassword, setReconnectPassword] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);

  const handleReconnect = async () => {
    if (!reconnectPassword.trim()) return;
    try {
      await shareApi.join(conn.addr, reconnectPassword.trim());
      await reconnect(conn.addr);
      addToast({ type: "success", title: "重连成功", message: conn.label });
      setShowPasswordInput(false);
      setReconnectPassword("");
    } catch (e) {
      addToast({ type: "error", title: "重连失败", message: String(e) });
    }
  };

  const handleDisconnect = async () => {
    try {
      await removeConnection(conn.addr);
      addToast({ type: "info", title: "已断开", message: conn.label });
    } catch (e) {
      addToast({ type: "error", title: "断开失败", message: String(e) });
    }
  };

  return (
    <div className="card flex items-center gap-4 p-4 animate-slide-up">
      {/* 标签 */}
      <div className="flex-1 min-w-0">
        <p className="font-serif text-sm truncate" style={{ color: "var(--text-primary)" }}>
          {conn.label}
        </p>
      </div>

      {/* 地址 */}
      <span className="shrink-0 text-xs font-mono text-gold">
        {conn.addr}
      </span>

      {/* 上次连接 */}
      {conn.last_connected && (
        <span className="shrink-0 text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
          {formatTimeFull(conn.last_connected)}
        </span>
      )}

      {/* 重连密码输入 */}
      {showPasswordInput && (
        <input
          type="password"
          value={reconnectPassword}
          onChange={(e) => setReconnectPassword(e.target.value)}
          placeholder="输入密码"
          autoFocus
          className="input-base w-28 text-xs"
          onKeyDown={(e) => e.key === "Enter" && handleReconnect()}
        />
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-1 shrink-0">
        <button className="btn btn-ghost btn-sm" onClick={onBrowse}>
          <FolderOpen size={12} strokeWidth={1.5} />
          浏览
        </button>
        {showPasswordInput ? (
          <button className="btn btn-primary btn-sm" onClick={handleReconnect} disabled={!reconnectPassword.trim()}>
            确认
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowPasswordInput(true)}>
            <RefreshCw size={12} strokeWidth={1.5} />
            重连
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm hover-danger-text"
          onClick={handleDisconnect}
        >
          <X size={12} strokeWidth={1.5} />
          断开
        </button>
      </div>
    </div>
  );
}