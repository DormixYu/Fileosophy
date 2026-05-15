import { useState, useEffect } from "react";
import { Square, Copy, Download, Upload, ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useShareStore } from "@/stores/useShareStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { formatSize, formatTimeShort } from "@/lib/formatUtils";
import type { Project } from "@/types";
import { DEFAULT_PROJECT_STATUSES } from "@/types";

function normalizePath(p: string): string {
  return p
    .replace(/^\\\\\?\\/, "")
    .replace(/[\\/]+$/, "")
    .toLowerCase();
}

function getStatusLabel(status: string | null): { name: string; color: string } {
  const found = DEFAULT_PROJECT_STATUSES.find((s) => s.id === status);
  return found || { name: status ?? "未知", color: "#94a3b8" };
}

interface ActiveShareRowProps {
  share: { port: number; path: string };
  project?: Project;
}

export default function ActiveShareRow({ share, project }: ActiveShareRowProps) {
  const { localIp, connectedClients, activityLog, stopShare, fetchActivityLog, fetchConnectedClients } = useShareStore();
  const { addToast } = useNotificationStore();
  const [showActivity, setShowActivity] = useState(false);

  useEffect(() => {
    fetchActivityLog(share.port);
    fetchConnectedClients(share.port);
    const timer = setInterval(() => {
      fetchActivityLog(share.port);
      fetchConnectedClients(share.port);
    }, 5000);
    return () => clearInterval(timer);
  }, [share.port, fetchActivityLog, fetchConnectedClients]);

  const fullAddr = `${localIp}:${share.port}`;
  const pathName = project?.name || share.path.split(/[\\/]/).pop() || share.path;
  const statusInfo = project ? getStatusLabel(project.status) : null;
  const recentActivity = activityLog.slice(-10).reverse();

  const handleCopyAddr = async () => {
    try {
      await navigator.clipboard.writeText(fullAddr);
      addToast({ type: "info", title: "已复制", message: fullAddr });
    } catch {
      addToast({ type: "error", title: "复制失败", message: "请手动复制: " + fullAddr });
    }
  };

  const handleStop = async () => {
    try {
      await stopShare(share.port);
      addToast({ type: "info", title: "共享已停止", message: pathName });
    } catch (e) {
      addToast({ type: "error", title: "停止失败", message: String(e) });
    }
  };

  return (
    <div>
      <div className="card flex items-center gap-4 p-4 animate-slide-up">
        {/* 项目名 */}
        <div className="flex-1 min-w-0">
          {project ? (
            <Link
              to={`/project/${project.id}`}
              className="font-serif text-sm text-gold hover-gold-text"
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
            className="shrink-0 rounded-full text-[10px] px-2.5 py-0.5 font-mono"
            style={{
              background: `${statusInfo.color}18`,
              border: `1px solid ${statusInfo.color}30`,
              color: statusInfo.color,
              letterSpacing: "0.04em",
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
          <span className="font-mono text-xs text-gold">
            {fullAddr}
          </span>
          <button
            className="p-1 rounded transition-colors hover-gold-text"
            style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
            onClick={handleCopyAddr}
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

        {/* 活动记录折叠按钮 */}
        {activityLog.length > 0 && (
          <button
            className="p-1 rounded transition-colors shrink-0 hover-gold-text"
            style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
            onClick={() => setShowActivity(!showActivity)}
          >
            {showActivity ? <ChevronDown size={12} strokeWidth={1.5} /> : <ChevronRight size={12} strokeWidth={1.5} />}
          </button>
        )}

        {/* 停止按钮 */}
        <button
          className="btn btn-outline btn-sm shrink-0"
          onClick={handleStop}
        >
          <Square size={12} strokeWidth={1.5} />
          停止共享
        </button>
      </div>

      {/* 可折叠活动记录区 */}
      {showActivity && recentActivity.length > 0 && (
        <div
          className="mt-1 p-3 rounded-lg animate-slide-up"
          style={{ background: "var(--bg-surface-alt)", border: "1px solid var(--border-light)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-serif" style={{ color: "var(--text-secondary)" }}>
              活动记录
            </p>
            <div
              className="w-6 h-[1px] rounded-full"
              style={{ background: "var(--gold)", opacity: 0.4 }}
            />
          </div>
          <div className="space-y-1">
            {recentActivity.map((entry, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-[11px] font-mono px-2 py-1 rounded-md transition-colors hover-surface-alt-bg"
                style={{ color: "var(--text-tertiary)" }}
              >
                <span>{formatTimeShort(entry.timestamp)}</span>
                {entry.action === "download" ? (
                  <Download size={10} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
                ) : (
                  <Upload size={10} strokeWidth={1.5} style={{ color: "var(--color-success)" }} />
                )}
                <span className="truncate" style={{ color: "var(--text-secondary)" }}>
                  {entry.client_addr}
                </span>
                <span className="flex-1 truncate">
                  {entry.file_path}
                </span>
                <span>{formatSize(entry.file_size)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { normalizePath };