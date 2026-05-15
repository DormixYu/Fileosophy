import { useState } from "react";
import { FolderOpen } from "lucide-react";
import Modal from "@/components/common/Modal";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { getToday } from "@/lib/ganttUtils";
import DatePicker from "@/components/common/DatePicker";
import type { Project, ProjectStatus, ProjectStatusConfig, ProjectTypeConfig } from "@/types";

export interface ProjectDialogProps {
  title: string;
  project?: Project;
  types: ProjectTypeConfig[];
  statuses: ProjectStatusConfig[];
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    description?: string;
    project_type?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
    parent_path?: string;
  }) => Promise<void>;
}

export default function ProjectDialog({ title, project, types, statuses, onClose, onSubmit }: ProjectDialogProps) {
  const { settings } = useSettingsStore();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [projectType, setProjectType] = useState(project?.project_type ?? "");
  const [status, setStatus] = useState(project?.status ?? "planning");
  const [startDate, setStartDate] = useState(project?.start_date?.slice(0, 10) ?? getToday());
  const [endDate, setEndDate] = useState(project?.end_date?.slice(0, 10) ?? "");
  const [parentPath, setParentPath] = useState(
    project ? (project.folder_path || "") : (settings["default_project_path"] || "")
  );
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        project_type: projectType || undefined,
        status: status || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        parent_path: parentPath || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={title}
      width="max-w-[480px]"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
          >
            {saving ? "保存中…" : project ? "保存" : "创建"}
          </button>
        </>
      }
    >
      {project && (
        <div className="mb-4 text-[11px] font-mono tracking-wider" style={{ color: "var(--text-dim)" }}>
          编号：{project.project_number || "—"}
        </div>
      )}

      <div className="space-y-4">
        <input
          type="text"
          placeholder="项目名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="input-base w-full"
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />

        <textarea
          placeholder="项目描述（可选）"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="input-base w-full resize-none"
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] mb-1.5 block font-mono tracking-wider" style={{ color: "var(--text-muted)" }}>
              项目分类
            </label>
            <select
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
              className="input-base w-full"
            >
              <option value="">未选择</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] mb-1.5 block font-mono tracking-wider" style={{ color: "var(--text-muted)" }}>
              项目状态
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className="input-base w-full"
            >
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] mb-1.5 block font-mono tracking-wider" style={{ color: "var(--text-muted)" }}>
              开始日期
            </label>
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              style={{
                background: "var(--bg-surface-alt)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
              }}
            />
          </div>
          <div>
            <label className="text-[11px] mb-1.5 block font-mono tracking-wider" style={{ color: "var(--text-muted)" }}>
              截止日期
            </label>
            <DatePicker
              value={endDate}
              onChange={setEndDate}
              style={{
                background: "var(--bg-surface-alt)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
              }}
            />
          </div>
        </div>

        {/* 项目文件夹位置 */}
        {!project && (
          <div>
            <label className="text-[11px] mb-1.5 block font-mono tracking-wider" style={{ color: "var(--text-muted)" }}>
              项目文件夹位置（可选）
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={parentPath}
                onChange={(e) => setParentPath(e.target.value)}
                placeholder="留空则使用默认根目录"
                className="input-base flex-1"
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={async () => {
                  const { open } = await import("@tauri-apps/plugin-dialog");
                  const selected = await open({ directory: true, multiple: false });
                  if (selected) setParentPath(selected as string);
                }}
              >
                <FolderOpen size={13} strokeWidth={1.5} />
                选择
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}