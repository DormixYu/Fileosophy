import { useState, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { projectApi } from "@/lib/tauri-api";
import type {
  Project,
  ProjectStatusConfig,
  ProjectStatusHistory,
} from "@/types";
import Modal from "@/components/common/Modal";
import DatePicker from "@/components/common/DatePicker";
import { getToday, buildPreviewSegments, INITIAL_STATUS } from "@/lib/ganttUtils";

interface StatusHistoryModalProps {
  project: Project;
  histories: ProjectStatusHistory[];
  statuses: ProjectStatusConfig[];
  onClose: () => void;
  onRefresh: () => void;
}

export default function StatusHistoryModal({
  project,
  histories,
  statuses,
  onClose,
  onRefresh,
}: StatusHistoryModalProps) {
  const { addToast } = useNotificationStore();
  const [localItems, setLocalItems] = useState(() =>
    [...histories].sort((a, b) => a.changed_at.localeCompare(b.changed_at)),
  );
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const getStatusColor = (statusId: string) =>
    statuses.find((s) => s.id === statusId)?.color || "#94a3b8";

  const addItem = () => {
    const today = getToday();
    setLocalItems((prev) =>
      [
        ...prev,
        { id: -Date.now(), project_id: project.id, status: project.status || INITIAL_STATUS, changed_at: today },
      ].sort((a, b) => a.changed_at.localeCompare(b.changed_at)),
    );
  };

  const updateItem = (id: number, field: "status" | "changed_at", value: string) => {
    setLocalItems((prev) =>
      prev.map((item) => item.id === id ? { ...item, [field]: value } : item),
    );
  };

  const markDeleted = (id: number) => {
    if (id > 0) setDeletedIds((prev) => [...prev, id]);
    setLocalItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const id of deletedIds) {
        await projectApi.deleteStatusHistory(id);
      }
      for (const item of localItems) {
        if (item.id < 0) {
          await projectApi.addStatusHistory({
            project_id: project.id,
            status: item.status,
            changed_at: item.changed_at,
          });
        } else {
          await projectApi.updateStatusHistory(item.id, {
            status: item.status,
            changed_at: item.changed_at,
          });
        }
      }
      onRefresh();
      onClose();
      addToast({ type: "success", title: "状态历史已保存", message: project.name });
    } catch (e) {
      addToast({ type: "error", title: "保存失败", message: String(e) });
    } finally {
      setSaving(false);
    }
  };

  // 使用 ganttUtils 的 buildPreviewSegments 替代有 bug 的内联版本
  const previewSegments = useMemo(
    () => buildPreviewSegments(project, localItems, statuses),
    [project, localItems, statuses],
  );

  const currentConfig = statuses.find((s) => s.id === project.status);

  return (
    <Modal
      open
      onClose={onClose}
      title={`状态变更历史 — ${project.name}`}
      footer={
        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>当前状态</span>
          <span
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{
              background: getStatusColor(project.status || "") + "20",
              color: getStatusColor(project.status || ""),
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: getStatusColor(project.status || "") }}
            />
            {currentConfig?.name || project.status || "—"}
          </span>
        </div>

        <div className="space-y-1.5 max-h-64 overflow-auto">
          {localItems.length === 0 ? (
            <p className="text-xs py-2" style={{ color: "var(--text-muted)" }}>
              暂无状态变更记录
            </p>
          ) : (
            localItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <DatePicker value={item.changed_at.split(" ")[0]} onChange={(v) => updateItem(item.id, "changed_at", v)} style={{ background: "var(--bg-surface-alt)", border: "1px solid var(--border-light)", color: "var(--text-primary)", fontSize: "0.75rem" }} />
                <select
                  value={item.status}
                  onChange={(e) => updateItem(item.id, "status", e.target.value)}
                  className="input-base !py-1 !text-xs"
                >
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getStatusColor(item.status) }} />
                <button
                  className="p-0.5 rounded transition-colors shrink-0 text-[var(--text-muted)] hover-danger-text"
                  onClick={() => markDeleted(item.id)}
                >
                  <Trash2 size={11} strokeWidth={1.5} />
                </button>
              </div>
            ))
          )}
        </div>

        <button
          className="btn btn-outline btn-sm hover-gold-text flex items-center gap-1"
          onClick={addItem}
        >
          <Plus size={11} strokeWidth={1.5} />
          添加状态变更
        </button>

        <div className="border-t pt-3" style={{ borderColor: "var(--border-default)" }}>
          <div className="text-[10px] mb-1.5" style={{ color: "var(--text-secondary)" }}>色段预览</div>
          <div className="flex overflow-hidden" style={{ height: 20, borderRadius: "var(--radius-md)" }}>
            {previewSegments.map((seg, i) => (
              <div
                key={i}
                style={{ width: `${seg.width}%`, background: seg.color, minWidth: 2 }}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}