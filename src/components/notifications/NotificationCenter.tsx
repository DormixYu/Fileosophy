import { useEffect, useState } from "react";
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

type FilterKey = "all" | "project" | "file" | "system";

const filters: { key: FilterKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "project", label: "项目" },
  { key: "file", label: "文件" },
  { key: "system", label: "系统" },
];

// 根据通知标题判断分类
function getCategory(title: string): FilterKey {
  if (title.includes("项目") || title.includes("卡片") || title.includes("状态")) return "project";
  if (title.includes("文件") || title.includes("上传") || title.includes("删除")) return "file";
  if (title.includes("共享")) return "file";
  return "system";
}

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
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    if (open) {
      fetchHistory();
      setFilter("all");
    }
  }, [open, fetchHistory]);

  const filtered = filter === "all"
    ? history
    : history.filter((n) => getCategory(n.title) === filter);

  const unreadInFilter = filtered.filter((n) => !n.read).length;

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
              disabled={unreadInFilter === 0}
              style={{ color: unreadInFilter > 0 ? "var(--gold)" : "var(--text-muted)", opacity: unreadInFilter > 0 ? 1 : 0.5 }}
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
      {/* 分类筛选 */}
      {history.length > 0 && (
        <div
          className="flex gap-1 mb-3 p-1 rounded-md"
          style={{ background: "var(--bg-surface-alt)" }}
        >
          {filters.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className="flex-1 px-2 py-1 rounded text-[11px] transition-all"
              style={{
                background: filter === key ? "var(--bg-elevated)" : "transparent",
                color: filter === key ? "var(--gold)" : "var(--text-muted)",
                cursor: "pointer",
                border: "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {historyLoading ? (
        <div
          className="text-center py-8 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          加载中…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8">
          <Bell
            size={28}
            strokeWidth={1}
            className="mx-auto mb-2"
            style={{ color: "var(--text-muted)" }}
          />
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            {filter === "all" ? "暂无通知" : "该分类暂无通知"}
          </p>
        </div>
      ) : (
        <div className="space-y-0.5 -mx-1 max-h-80 overflow-y-auto">
          {filtered.map((n) => {
            const Icon = typeIconMap[n.type] || Info;
            const color = typeColorMap[n.type] || "var(--gold)";
            const clickable = !!n.link;

            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-3 py-2 rounded-md transition-all ${
                  clickable ? "cursor-pointer" : ""
                } ${n.read ? "opacity-60" : ""}`}
                style={{
                  background: n.read ? "transparent" : "var(--gold-glow)",
                }}
                onClick={() => handleNotificationClick(n)}
                onMouseEnter={(e) => {
                  if (!n.read || clickable) {
                    e.currentTarget.style.background = "var(--gold-glow)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (n.read) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
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
                    {formatTime(n.created_at)}
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

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();

    if (diff < 60_000) return "刚刚";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} 小时前`;

    return d.toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
