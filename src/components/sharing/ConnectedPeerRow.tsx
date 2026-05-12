import { RefreshCw, FolderOpen, X } from "lucide-react";
import { useShareStore } from "@/stores/useShareStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import type { SavedConnection } from "@/types";

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("zh-CN") + " " + d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

interface ConnectedPeerRowProps {
  conn: SavedConnection;
  onBrowse: () => void;
}

export default function ConnectedPeerRow({ conn, onBrowse }: ConnectedPeerRowProps) {
  const { reconnect, removeConnection } = useShareStore();
  const { addToast } = useNotificationStore();

  const handleReconnect = async () => {
    try {
      await reconnect(conn.addr, conn.password);
      addToast({ type: "success", title: "重连成功", message: conn.label });
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
      <span className="shrink-0 text-xs font-mono" style={{ color: "var(--text-muted)" }}>
        {conn.addr}
      </span>

      {/* 上次连接 */}
      {conn.last_connected && (
        <span className="shrink-0 text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
          {formatTime(conn.last_connected)}
        </span>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-1 shrink-0">
        <button className="btn btn-ghost btn-sm" onClick={onBrowse}>
          <FolderOpen size={12} strokeWidth={1.5} />
          浏览
        </button>
        <button className="btn btn-ghost btn-sm" onClick={handleReconnect}>
          <RefreshCw size={12} strokeWidth={1.5} />
          重连
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleDisconnect}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "")}
        >
          <X size={12} strokeWidth={1.5} />
          断开
        </button>
      </div>
    </div>
  );
}