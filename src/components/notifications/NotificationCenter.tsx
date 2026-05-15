import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  Trash2,
  FileDown,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { useNotificationStore } from "@/stores/useNotificationStore";
import Modal from "@/components/common/Modal";
import { formatTimeRelative } from "@/lib/formatUtils";

// 通知类型图标
const typeIconMap: Record<string, typeof Info> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  "file-received": FileDown,
};

const typeColorMap: Record<string, string> = {
  info: "var(--color-info)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  error: "var(--color-danger)",
  "file-received": "var(--gold)",
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function NotificationCenter({ open, onClose }: Props) {
  const navigate = useNavigate();
  const {
    history,
    historyLoading,
    fetchHistory,
    markRead,
    markAllRead,
    clearHistory,
  } = useNotificationStore();

  useEffect(() => {
    if (open) fetchHistory();
  }, [open, fetchHistory]);

  const unreadCount = history.filter((n) => !n.read).length;

  const handleNotificationClick = (n: typeof history[0]) => {
    if (!n.read) markRead(n.id);
    if (n.link) {
      navigate(n.link);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="通知中心"
      width="max-w-md"
      footer={
        history.length > 0 ? (
          <div className="flex items-center justify-between w-full">
            <button
              className="btn btn-ghost btn-sm"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              style={{ color: unreadCount > 0 ? "var(--gold)" : "var(--text-muted)", opacity: unreadCount > 0 ? 1 : 0.5 }}
            >
              <CheckCheck size={12} strokeWidth={1.5} />
              全部已读
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={clearHistory}
              style={{ color: "var(--text-muted)" }}
            >
              <Trash2 size={12} strokeWidth={1.5} />
              清空历史
            </button>
          </div>
        ) : undefined
      }
    >
      {historyLoading ? (
        <div
          className="text-center py-8 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          加载中…
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-8">
          <Bell
            size={28}
            strokeWidth={1}
            className="mx-auto mb-2"
            style={{ color: "var(--text-muted)" }}
          />
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            暂无通知
          </p>
        </div>
      ) : (
        <div className="space-y-0.5 -mx-1">
          {history.map((n) => {
            const Icon = typeIconMap[n.type] || Info;
            const color = typeColorMap[n.type] || "var(--gold)";
            const clickable = !!n.link;

            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-3 py-2 rounded-md transition-all ${
                  clickable ? "cursor-pointer" : ""
                } ${n.read ? "opacity-60" : ""} ${
                  n.read ? "" : "bg-[var(--gold-glow)]"
                } ${
                  (!n.read || clickable) ? "hover-gold-bg" : ""
                }`}
                onClick={() => handleNotificationClick(n)}
              >
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full shrink-0 mt-0.5"
                  style={{
                    background: `${color}20`,
                    color: color,
                  }}
                >
                  <Icon size={12} strokeWidth={1.5} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p
                      className="text-xs font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {n.title}
                    </p>
                    {clickable && (
                      <ExternalLink
                        size={9}
                        strokeWidth={1.5}
                        style={{ color: "var(--text-muted)", flexShrink: 0 }}
                      />
                    )}
                    {!n.read && (
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0 ml-auto"
                        style={{ background: "var(--gold)" }}
                      />
                    )}
                  </div>
                  <p
                    className="text-[10px] mt-0.5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {n.message}
                  </p>
                  <p
                    className="text-[9px] mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {formatTimeRelative(n.created_at)}
                  </p>
                </div>
                {!n.read && (
                  <button
                    className="p-0.5 rounded shrink-0"
                    style={{ color: "var(--text-muted)" }}
                    title="标为已读"
                    onClick={(e) => {
                      e.stopPropagation();
                      markRead(n.id);
                    }}
                  >
                    <CheckCheck size={12} strokeWidth={1.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}