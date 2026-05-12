import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, FileDown, Info, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { useNotificationStore, type ToastItem } from "@/stores/useNotificationStore";
import { listen } from "@tauri-apps/api/event";
import type { NotificationPayload, FileSharedPayload, NotificationPreferences } from "@/types";

const iconMap = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertTriangle,
  "file-received": FileDown,
};

const colorMap = {
  info: "var(--color-info)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  error: "var(--color-danger)",
  "file-received": "var(--gold)",
};

function Toast({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const navigate = useNavigate();
  const Icon = iconMap[toast.type] || Info;
  const accent = colorMap[toast.type] || "var(--gold)";
  const clickable = !!toast.link;

  const handleClick = () => {
    if (toast.link) {
      navigate(toast.link);
      onClose();
    }
  };

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg shadow-lg animate-slide-up pointer-events-auto transition-all ${
        clickable ? "cursor-pointer hover:scale-[1.02]" : ""
      }`}
      style={{
        background: "var(--bg-elevated)",
        border: `1px solid ${accent}40`,
        minWidth: 280,
        maxWidth: 380,
      }}
      onClick={handleClick}
    >
      <div
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
        style={{ background: `${accent}15`, color: accent }}
      >
        <Icon size={14} strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p
            className="text-xs font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {toast.title}
          </p>
          {clickable && (
            <ExternalLink size={10} strokeWidth={1.5} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          )}
        </div>
        <p
          className="text-[11px] mt-0.5 line-clamp-2"
          style={{ color: "var(--text-secondary)" }}
        >
          {toast.message}
        </p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="shrink-0 p-0.5 rounded transition-colors"
        style={{ color: "var(--text-muted)" }}
      >
        <X size={12} strokeWidth={1.5} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts, addToast, removeToast } = useNotificationStore();

  // 监听后端通知事件
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];

    unlisteners.push(
      listen<NotificationPayload>("app-notification", (event) => {
        const type = (event.payload.type as ToastItem["type"]) || "info";
        // 根据后端通知标题推断偏好 key
        let prefKey: keyof NotificationPreferences | undefined;
        const title = event.payload.title;
        if (title.includes("项目") && title.includes("创建")) prefKey = "project_created";
        else if (title.includes("项目") && title.includes("删除")) prefKey = "project_deleted";
        else if (title.includes("状态") || title.includes("变更")) prefKey = "project_status_changed";
        else if (title.includes("卡片") || title.includes("任务")) prefKey = "card_created";
        else if (title.includes("文件") && title.includes("上传")) prefKey = "file_uploaded";
        else if (title.includes("文件") && title.includes("删除")) prefKey = "file_deleted";
        else if (title.includes("共享") && title.includes("开启")) prefKey = "share_started";
        else if (title.includes("共享") && title.includes("停止")) prefKey = "share_stopped";

        addToast({
          type,
          title: event.payload.title,
          message: event.payload.message,
          link: event.payload.link,
          prefKey,
        });
      })
    );

    unlisteners.push(
      listen<FileSharedPayload>("file-shared", (event) => {
        if (event.payload.status === "sent") {
          addToast({
            type: "success",
            title: "文件已发送",
            message: `已发送 "${event.payload.file_name}"`,
            prefKey: "file_uploaded",
          });
        } else if (event.payload.status === "received") {
          addToast({
            type: "file-received",
            title: "收到文件",
            message: `来自 ${event.payload.peer_addr} 的文件已接收`,
            prefKey: "file_received",
          });
        }
      })
    );

    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()));
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}
