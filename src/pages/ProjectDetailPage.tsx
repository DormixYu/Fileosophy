import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Clock, Calendar, FolderOpen } from "lucide-react";
import { useProjectStore } from "@/stores/useProjectStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import Modal from "@/components/common/Modal";
import FileExplorer from "@/components/files/FileExplorer";
import FilePanel from "@/components/files/FilePanel";
import Spinner from "@/components/common/Spinner";
import KanbanBoard from "@/components/kanban/KanbanBoard";
import GanttChart from "@/components/gantt/GanttChart";
import type { ProjectStatusConfig } from "@/types";
import { DEFAULT_PROJECT_STATUSES } from "@/types";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = Number(id);
  const { currentProject, fetchProjectById, updateProject, loading } =
    useProjectStore();
  const { settings } = useSettingsStore();

  const statuses: ProjectStatusConfig[] = useMemo(() => {
    try {
      const raw = settings["project_statuses"];
      return raw ? JSON.parse(raw) : DEFAULT_PROJECT_STATUSES;
    } catch {
      return DEFAULT_PROJECT_STATUSES;
    }
  }, [settings]);

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [activeView, setActiveView] = useState<"detail" | "kanban" | "gantt">("detail");

  useEffect(() => {
    if (projectId) fetchProjectById(projectId);
    return () => {
      // 仅组件卸载时清理，避免项目间切换时闪烁
    };
  }, [projectId, fetchProjectById]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleString("zh-CN");
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div
        className="flex items-center justify-center h-full text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        项目不存在
      </div>
    );
  }

  const statusConfig = statuses.find((s) => s.id === currentProject.status);

  return (
    <div className="flex flex-col h-full animate-slide-up">
      {/* 页头 */}
      <div
        className="flex items-center gap-4 px-6 h-14 shrink-0 border-b"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-light)",
        }}
      >
        <button
          onClick={() => navigate("/projects")}
          className="p-1.5 rounded-md transition-colors"
          style={{ color: "var(--text-tertiary)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--gold-glow)")
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <h1
            className="text-title truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {currentProject.name}
          </h1>
          <button
            className="p-1 rounded-md transition-colors flex-shrink-0"
            style={{ color: "var(--text-tertiary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--gold-glow)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            onClick={() => {
              setEditName(currentProject.name);
              setEditDescription(currentProject.description ?? "");
              setShowEdit(true);
            }}
          >
            <Pencil size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* 视图切换 Tab */}
      <div
        className="flex items-center gap-1 px-6 h-10 shrink-0 border-b"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border-light)" }}
      >
        {([
          { key: "detail", label: "项目详情" },
          { key: "kanban", label: "项目看板" },
          { key: "gantt", label: "项目甘特图" },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveView(tab.key)}
            className="px-3 py-1.5 text-xs rounded-md transition-all"
            style={{
              color: activeView === tab.key ? "var(--gold)" : "var(--text-muted)",
              background: activeView === tab.key ? "var(--gold-glow)" : "transparent",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto">
        {activeView === "detail" && (
          <div className="p-6 space-y-6">
        {/* 项目信息卡片 */}
        <div
          className="rounded-lg p-5"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-light)",
          }}
        >
          <h2
            className="text-sm font-medium mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            项目信息
          </h2>

          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {/* 项目名称 */}
            <InfoItem
              label="项目名称"
              value={currentProject.name}
            />
            {/* 项目编号 */}
            <InfoItem
              label="项目编号"
              value={currentProject.project_number || "—"}
            />
            {/* 项目分类 */}
            <InfoItem
              label="项目分类"
              value={currentProject.project_type || "—"}
            />
            {/* 项目状态 */}
            <div>
              <span
                className="text-[11px] block mb-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                项目状态
              </span>
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs"
                style={{
                  background: statusConfig ? `${statusConfig.color}18` : "var(--bg-surface-alt)",
                  color: statusConfig?.color ?? "var(--text-secondary)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{ background: statusConfig?.color ?? "var(--text-muted)" }}
                />
                {(statusConfig?.name ?? currentProject.status) || "—"}
              </span>
            </div>
            {/* 开始日期 */}
            <InfoItem
              label="开始日期"
              value={formatDate(currentProject.start_date)}
              icon={<Calendar size={12} strokeWidth={1.5} />}
            />
            {/* 截止日期 */}
            <InfoItem
              label="截止日期"
              value={formatDate(currentProject.end_date)}
              icon={<Calendar size={12} strokeWidth={1.5} />}
            />
            {/* 状态变更时间 */}
            <InfoItem
              label="状态变更时间"
              value={formatDateTime(currentProject.status_changed_at)}
              icon={<Clock size={12} strokeWidth={1.5} />}
            />
            {/* 创建时间 */}
            <InfoItem
              label="创建时间"
              value={formatDateTime(currentProject.created_at)}
              icon={<Clock size={12} strokeWidth={1.5} />}
            />
            {/* 更新时间 */}
            <InfoItem
              label="更新时间"
              value={formatDateTime(currentProject.updated_at)}
              icon={<Clock size={12} strokeWidth={1.5} />}
            />
            {/* 创建人 */}
            <InfoItem
              label="创建人"
              value={currentProject.created_by || "—"}
            />
          </div>

          {/* 项目描述 */}
          {currentProject.description && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--border-light)" }}>
              <span
                className="text-[11px] block mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                项目描述
              </span>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {currentProject.description}
              </p>
            </div>
          )}
        </div>

        {/* 文件列表 */}
        <div
          className="rounded-lg p-5"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-light)",
          }}
        >
          <h2
            className="text-sm font-medium mb-4 flex items-center gap-2"
            style={{ color: "var(--text-primary)" }}
          >
            <FolderOpen size={16} strokeWidth={1.5} />
            项目文件
          </h2>
          {currentProject?.folder_path
            ? <FileExplorer folderPath={currentProject.folder_path} />
            : <FilePanel projectId={projectId} />}
        </div>
          </div>
        )}
        {activeView === "kanban" && (
          <div className="p-6">
            <KanbanBoard projectId={projectId} />
          </div>
        )}
        {activeView === "gantt" && (
          <div className="p-6">
            <GanttChart projectId={projectId} />
          </div>
        )}
      </div>

      {/* 编辑项目 Modal */}
      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="编辑项目"
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(false)}>
              取消
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={async () => {
                if (!editName.trim()) return;
                await updateProject(projectId, {
                  name: editName.trim(),
                  description: editDescription || undefined,
                });
                setShowEdit(false);
              }}
            >
              保存
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
              项目名称
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded outline-none"
              style={{
                background: "var(--bg-surface-alt)",
                border: "1px solid var(--border-light)",
                color: "var(--text-primary)",
              }}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
              项目描述
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded outline-none resize-none"
              style={{
                background: "var(--bg-surface-alt)",
                border: "1px solid var(--border-light)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function InfoItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <span
        className="text-[11px] block mb-0.5"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <span
        className="text-sm flex items-center gap-1.5"
        style={{ color: "var(--text-primary)" }}
      >
        {icon}
        {value}
      </span>
    </div>
  );
}
