import { Square, Copy } from "lucide-react";
import { Link } from "react-router-dom";
import { useShareStore } from "@/stores/useShareStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import type { Project } from "@/types";
import { DEFAULT_PROJECT_STATUSES } from "@/types";

function normalizePath(p: string): string {
  return p
    .replace(/^\\\\\?\\/, "")
    .replace(/[\\/]+$/, "")
    .toLowerCase();
}

function getStatusLabel(status: string): { name: string; color: string } {
  const found = DEFAULT_PROJECT_STATUSES.find((s) => s.id === status);
  return found || { name: status, color: "#94a3b8" };
}

interface ActiveShareRowProps {
  project?: Project;
}

export default function ActiveShareRow({ project }: ActiveShareRowProps) {
  const { shareStatus, localIp, connectedClients, stopShare } = useShareStore();
  const { addToast } = useNotificationStore();

  if (!shareStatus) return null;

  const fullAddr = `${localIp}:${shareStatus.port}`;
  const pathName = project?.name || shareStatus.path.split(/[\\/]/).pop() || shareStatus.path;
  const statusInfo = project ? getStatusLabel(project.status) : null;

  const handleCopyAddr = () => {
    navigator.clipboard.writeText(fullAddr);
    addToast({ type: "info", title: "已复制", message: fullAddr });
  };

  const handleStop = async () => {
    try {
      await stopShare();
      addToast({ type: "info", title: "共享已停止", message: "" });
    } catch (e) {
      addToast({ type: "error", title: "停止失败", message: String(e) });
    }
  };

  return (
    <div className="card flex items-center gap-4 p-4 animate-slide-up">
      {/* 项目名 */}
      <div className="flex-1 min-w-0">
        {project ? (
          <Link
            to={`/project/${project.id}`}
            className="font-serif text-sm hover:underline"
            style={{ color: "var(--gold)" }}
          >
            {project.name}
          </Link>
        ) : (
          <span className="font-serif text-sm" style={{ color: "var(--text-primary)" }}>
            {pathName}
          </span>
        )}
        <p className="text-xs font-mono truncate mt-0.5" style={{ color: "var(--text-tertiary)" }}>
          {project?.project_number || "—"}
        </p>
      </div>

      {/* 状态 */}
      {statusInfo && (
        <span
          className="shrink-0 rounded-full text-[10px] px-2 py-0.5"
          style={{
            background: `${statusInfo.color}18`,
            border: `1px solid ${statusInfo.color}30`,
            color: statusInfo.color,
          }}
        >
          {statusInfo.name}
        </span>
      )}

      {/* 分类 */}
      <span className="shrink-0 text-xs" style={{ color: "var(--text-secondary)" }}>
        {project?.project_type || "—"}
      </span>

      {/* 共享地址 */}
      <div className="shrink-0 flex items-center gap-1.5">
        <span className="font-mono text-xs" style={{ color: "var(--gold)" }}>
          {fullAddr}
        </span>
        <button
          className="p-1 rounded transition-colors"
          style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
          onClick={handleCopyAddr}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          <Copy size={12} strokeWidth={1.5} />
        </button>
      </div>

      {/* 连接人数 */}
      {connectedClients.length > 0 && (
        <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
          {connectedClients.length} 人已连接
        </span>
      )}

      {/* 停止按钮 */}
      <button
        className="btn btn-ghost btn-sm shrink-0"
        style={{ border: "1px solid var(--border-default)" }}
        onClick={handleStop}
      >
        <Square size={12} strokeWidth={1.5} />
        停止共享
      </button>
    </div>
  );
}

export { normalizePath };