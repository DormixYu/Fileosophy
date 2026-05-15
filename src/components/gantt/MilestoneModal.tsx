import { useState } from "react";
import { Diamond, Plus, Pencil, Trash2 } from "lucide-react";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { projectApi } from "@/lib/tauri-api";
import type { Project, ProjectMilestone } from "@/types";
import Modal from "@/components/common/Modal";
import DatePicker from "@/components/common/DatePicker";

interface MilestoneModalProps {
  project: Project;
  milestones: ProjectMilestone[];
  onClose: () => void;
  onRefresh: () => void;
}

export default function MilestoneModal({
  project,
  milestones,
  onClose,
  onRefresh,
}: MilestoneModalProps) {
  const { addToast } = useNotificationStore();
  const [editing, setEditing] = useState<ProjectMilestone | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setDate("");
    setDescription("");
  };

  const startEdit = (ms: ProjectMilestone) => {
    setEditing(ms);
    setName(ms.name);
    setDate(ms.date);
    setDescription(ms.description || "");
  };

  const handleSave = async () => {
    if (!name.trim() || !date) return;
    setSaving(true);
    try {
      if (editing) {
        await projectApi.updateMilestone(editing.id, {
          name: name.trim(),
          date,
          description: description || undefined,
        });
      } else {
        await projectApi.addMilestone({
          project_id: project.id,
          name: name.trim(),
          date,
          description: description || undefined,
        });
      }
      onRefresh();
      resetForm();
      addToast({ type: "success", title: editing ? "里程碑已更新" : "里程碑已添加", message: name.trim() });
    } catch (e) {
      addToast({ type: "error", title: "操作失败", message: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await projectApi.deleteMilestone(id);
      onRefresh();
      addToast({ type: "success", title: "里程碑已删除", message: "" });
    } catch (e) {
      addToast({ type: "error", title: "删除失败", message: String(e) });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${project.name} — 里程碑管理`}
      footer={
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          关闭
        </button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1 max-h-48 overflow-auto">
          {milestones.length === 0 ? (
            <p className="text-xs py-2" style={{ color: "var(--text-muted)" }}>
              暂无里程碑
            </p>
          ) : (
            milestones.map((ms) => (
              <div
                key={ms.id}
                className="flex items-center gap-2 px-2.5 py-2 rounded-md text-xs transition-colors hover-gold-bg"
                style={{ color: "var(--text-primary)", background: "var(--bg-elevated)" }}
              >
                <Diamond size={10} strokeWidth={1.5} style={{ color: "var(--gold)", flexShrink: 0 }} />
                <span className="flex-1 truncate">{ms.name}</span>
                <span style={{ color: "var(--text-tertiary)" }}>{ms.date}</span>
                <button
                  className="p-0.5 rounded transition-colors text-[var(--text-muted)] hover-gold-text"
                  onClick={() => startEdit(ms)}
                >
                  <Pencil size={11} strokeWidth={1.5} />
                </button>
                <button
                  className="p-0.5 rounded transition-colors text-[var(--text-muted)] hover-danger-text"
                  onClick={() => handleDelete(ms.id)}
                >
                  <Trash2 size={11} strokeWidth={1.5} />
                </button>
              </div>
            ))
          )}
        </div>

        <div
          className="rounded-md p-3 space-y-2"
          style={{ background: "var(--bg-surface-alt)", border: "1px solid var(--border-light)" }}
        >
          <div className="text-[10px] font-medium" style={{ color: "var(--text-secondary)" }}>
            {editing ? "编辑里程碑" : "新增里程碑"}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 input-base !py-1 !text-xs"
            />
            <DatePicker value={date} onChange={setDate} style={{ background: "var(--bg-surface-alt)", border: "1px solid var(--border-light)", color: "var(--text-primary)", fontSize: "0.75rem" }} />
          </div>
          <input
            type="text"
            placeholder="描述（可选）"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full input-base !py-1 !text-xs"
          />
          <div className="flex gap-2 justify-end">
            {editing && (
              <button className="btn btn-ghost btn-sm" onClick={resetForm}>
                取消
              </button>
            )}
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving || !name.trim() || !date}
            >
              <Plus size={12} strokeWidth={1.5} />
              {saving ? "保存中..." : editing ? "更新" : "添加"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}