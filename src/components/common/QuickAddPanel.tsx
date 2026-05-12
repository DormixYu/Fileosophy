import { useEffect, useState, useRef } from "react";
import Modal from "@/components/common/Modal";
import { useProjectStore } from "@/stores/useProjectStore";
import { useKanbanStore } from "@/stores/useKanbanStore";
import { useGanttStore } from "@/stores/useGanttStore";
import { kanbanApi } from "@/lib/tauri-api";
import { getToday } from "@/lib/ganttUtils";

interface Props {
  open: boolean;
  onClose: () => void;
}

type CreateType = "card" | "task";

export default function QuickAddPanel({ open, onClose }: Props) {
  const { projects, fetchProjects } = useProjectStore();
  const { createCard } = useKanbanStore();
  const { addTask } = useGanttStore();

  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [type, setType] = useState<CreateType>("card");
  const [projectSearch, setProjectSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      fetchProjects();
      setTitle("");
      setProjectId(null);
      setType("card");
      setProjectSearch("");
      setSubmitting(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, fetchProjects]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredProjects = projects.filter(
    (p) =>
      !projectSearch ||
      p.name.toLowerCase().includes(projectSearch.toLowerCase()),
  );

  const selectedProject = projects.find((p) => p.id === projectId);

  const handleSubmit = async () => {
    if (!title.trim() || !projectId) return;
    setSubmitting(true);

    try {
      if (type === "card") {
        // 找到项目的第一个列，没有则创建默认列
        const board = await kanbanApi.getBoard(projectId);
        let column = board.columns[0];

        if (!column) {
          column = await kanbanApi.addColumn({
            project_id: projectId,
            title: "待办",
          });
        }

        await createCard({
          column_id: column.id,
          title: title.trim(),
        });
      } else {
        await addTask({
          project_id: projectId,
          name: title.trim(),
          start_date: getToday(),
          duration_days: 3,
          dependencies: [],
        });
      }

      onClose();
    } catch (e) {
      console.error("Quick add failed:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="快速新建"
      width="max-w-sm"
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={!title.trim() || !projectId || submitting}
          >
            {submitting ? "创建中…" : "创建"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {/* 任务标题 */}
        <div>
          <label
            className="text-xs mb-1 block"
            style={{ color: "var(--text-muted)" }}
          >
            标题
          </label>
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入任务标题"
            className="w-full px-3 py-2 text-sm rounded outline-none"
            style={{
              background: "var(--bg-surface-alt)",
              border: "1px solid var(--border-light)",
              color: "var(--text-primary)",
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </div>

        {/* 类型选择 */}
        <div>
          <label
            className="text-xs mb-1 block"
            style={{ color: "var(--text-muted)" }}
          >
            类型
          </label>
          <div className="flex gap-2">
            {(["card", "task"] as CreateType[]).map((t) => (
              <button
                key={t}
                className="flex-1 px-3 py-1.5 rounded text-xs transition-all"
                style={{
                  background:
                    type === t
                      ? "var(--gold-glow)"
                      : "var(--bg-surface-alt)",
                  color:
                    type === t ? "var(--gold)" : "var(--text-secondary)",
                  border:
                    type === t
                      ? "1px solid var(--gold)"
                      : "1px solid var(--border-light)",
                }}
                onClick={() => setType(t)}
              >
                {t === "card" ? "看板卡片" : "甘特图任务"}
              </button>
            ))}
          </div>
        </div>

        {/* 项目选择 */}
        <div ref={dropdownRef} className="relative">
          <label
            className="text-xs mb-1 block"
            style={{ color: "var(--text-muted)" }}
          >
            所属项目
          </label>
          <input
            type="text"
            value={
              showDropdown
                ? projectSearch
                : selectedProject
                  ? selectedProject.name
                  : ""
            }
            placeholder="搜索项目…"
            onChange={(e) => {
              setProjectSearch(e.target.value);
              setProjectId(null);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            className="w-full px-3 py-2 text-sm rounded outline-none"
            style={{
              background: "var(--bg-surface-alt)",
              border: "1px solid var(--border-light)",
              color: "var(--text-primary)",
            }}
          />
          {showDropdown && (
            <div
              className="absolute left-0 right-0 top-full mt-1 max-h-36 overflow-y-auto rounded-lg shadow-lg z-10"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
              }}
            >
              {filteredProjects.length === 0 ? (
                <div
                  className="px-3 py-2 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  无匹配项目
                </div>
              ) : (
                filteredProjects.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-1.5 text-xs transition-colors"
                    style={{
                      color: "var(--text-primary)",
                      background:
                        projectId === p.id
                          ? "var(--gold-glow)"
                          : "transparent",
                    }}
                    onClick={() => {
                      setProjectId(p.id);
                      setProjectSearch("");
                      setShowDropdown(false);
                    }}
                  >
                    {p.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
