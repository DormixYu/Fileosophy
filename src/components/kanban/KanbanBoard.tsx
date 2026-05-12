import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, Link2, Unlink } from "lucide-react";
import Spinner from "@/components/common/Spinner";
import { useKanbanStore } from "@/stores/useKanbanStore";
import { useGanttStore } from "@/stores/useGanttStore";
import type { KanbanCard as CardType } from "@/types";
import { kanbanApi, ganttApi } from "@/lib/tauri-api";
import { getToday } from "@/lib/ganttUtils";
import DatePicker from "@/components/common/DatePicker";
import Modal from "@/components/common/Modal";
import KanbanColumn from "./KanbanColumn";

interface Props {
  projectId: number;
}

export default function KanbanBoard({ projectId }: Props) {
  const { board, fetchBoard, addColumn, moveCard, updateCard, deleteCard, createCard } = useKanbanStore();
  const { fetchTasks } = useGanttStore();
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [showAddColumn, setShowAddColumn] = useState(false);

  // 添加任务 Modal
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskColumnId, setAddTaskColumnId] = useState<number | null>(null);
  const [addTaskName, setAddTaskName] = useState("");
  const [addTaskStartDate, setAddTaskStartDate] = useState(getToday());
  const [addTaskDuration, setAddTaskDuration] = useState(3);
  const [addTaskDescription, setAddTaskDescription] = useState("");
  const [addTaskSyncGantt, setAddTaskSyncGantt] = useState(true);

  // 卡片编辑状态
  const [editingCard, setEditingCard] = useState<CardType | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editDueDate, setEditDueDate] = useState("");

  // 甘特关联
  const [linkName, setLinkName] = useState("");
  const [linkStartDate, setLinkStartDate] = useState("");
  const [linkDuration, setLinkDuration] = useState("1");

  useEffect(() => {
    fetchBoard(projectId);
  }, [projectId, fetchBoard]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current;
    const overData = over.data.current;
    if (!activeData) return;

    const cardId = activeData.cardId as number;

    if (overData?.isColumn) {
      moveCard(cardId, overData.columnId as number, 0, projectId);
      // 拖入 todo 列后刷新甘特图
      fetchTasks(projectId);
      return;
    }

    if (!overData) return;
    const targetColumnId = overData.columnId as number;
    const position = overData.position as number;
    moveCard(cardId, targetColumnId, position, projectId);
    fetchTasks(projectId);
  };

  const handleAddColumn = async () => {
    if (!newColumnTitle.trim()) return;
    await addColumn({ project_id: projectId, title: newColumnTitle.trim() });
    setNewColumnTitle("");
    setShowAddColumn(false);
  };

  // 添加任务
  const handleAddTask = async () => {
    if (!addTaskName.trim() || !addTaskColumnId) return;
    if (addTaskSyncGantt) {
      const task = await ganttApi.addTask({
        project_id: projectId,
        name: addTaskName.trim(),
        start_date: addTaskStartDate,
        duration_days: addTaskDuration,
        dependencies: [],
      });
      if (task) {
        await createCard({
          column_id: addTaskColumnId,
          title: addTaskName.trim(),
          description: addTaskDescription || undefined,
          due_date: addTaskStartDate || undefined,
          gantt_task_id: task.id,
        });
        fetchTasks(projectId);
      }
    } else {
      await createCard({
        column_id: addTaskColumnId,
        title: addTaskName.trim(),
        description: addTaskDescription || undefined,
      });
    }
    resetAddTaskForm();
  };

  const resetAddTaskForm = () => {
    setShowAddTask(false);
    setAddTaskColumnId(null);
    setAddTaskName("");
    setAddTaskStartDate(getToday());
    setAddTaskDuration(3);
    setAddTaskDescription("");
    setAddTaskSyncGantt(true);
  };

  // Todo 完成：移动到 todo_done 列
  const handleCardComplete = (cardId: number) => {
    const todoDoneCol = board?.columns.find(c => c.column_type === "todo_done");
    if (!todoDoneCol) return;
    moveCard(cardId, todoDoneCol.id, 0, projectId);
    fetchTasks(projectId);
  };

  // 卡片编辑
  const handleCardClick = (card: CardType) => {
    setEditingCard(card);
    setEditTitle(card.title);
    setEditDescription(card.description ?? "");
    setEditTags(card.tags.join(", "));
    setEditDueDate(card.due_date ?? "");
    setLinkName(card.title);
    setLinkStartDate(card.due_date ?? new Date().toISOString().slice(0, 10));
    setLinkDuration("1");
  };

  const handleSaveCard = async () => {
    if (!editingCard || !editTitle.trim()) return;
    const tags = editTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    await updateCard(editingCard.id, {
      title: editTitle.trim(),
      description: editDescription || null,
      tags,
      due_date: editDueDate || null,
    } as Parameters<typeof updateCard>[1]);
    setEditingCard(null);
  };

  // 甘特关联
  const handleLinkToGantt = async () => {
    if (!editingCard || !linkName.trim() || !linkStartDate) return;
    await kanbanApi.linkCardToGantt(editingCard.id, linkName.trim(), linkStartDate, parseInt(linkDuration) || 1);
    fetchBoard(projectId);
    fetchTasks(projectId);
    setEditingCard(null);
  };

  const handleUnlinkFromGantt = async () => {
    if (!editingCard) return;
    await kanbanApi.unlinkCardFromGantt(editingCard.id);
    fetchBoard(projectId);
    setEditingCard(null);
  };

  const handleDeleteCard = (cardId: number) => {
    deleteCard(cardId);
    if (editingCard?.id === cardId) setEditingCard(null);
  };

  if (!board) {
    return (
      <div className="text-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 h-full overflow-x-auto pb-4">
          {board.columns.map((column) => (
            <SortableContext
              key={column.id}
              items={(column.cards ?? []).map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <KanbanColumn
                column={column}
                onCardClick={handleCardClick}
                onCardDelete={handleDeleteCard}
                onCardComplete={handleCardComplete}
                onAddTask={(columnId) => {
                  setAddTaskColumnId(columnId);
                  setAddTaskName("");
                  setAddTaskStartDate(getToday());
                  setAddTaskDuration(3);
                  setAddTaskDescription("");
                  setAddTaskSyncGantt(true);
                  setShowAddTask(true);
                }}
              />
            </SortableContext>
          ))}

          {/* 添加列 */}
          {showAddColumn ? (
            <div
              className="w-72 shrink-0 rounded-lg p-3"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
              }}
            >
              <input
                type="text"
                placeholder="列标题"
                value={newColumnTitle}
                onChange={(e) => setNewColumnTitle(e.target.value)}
                autoFocus
                className="w-full px-2 py-1 text-sm rounded outline-none mb-2"
                style={{
                  background: "var(--bg-surface-alt)",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-primary)",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddColumn();
                  if (e.key === "Escape") setShowAddColumn(false);
                }}
              />
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm" onClick={handleAddColumn}>
                  添加
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowAddColumn(false)}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddColumn(true)}
              className="w-72 shrink-0 rounded-lg p-3 flex items-center justify-center gap-2 text-xs transition-all"
              style={{
                background: "var(--bg-surface-alt)",
                border: "1px dashed var(--border-default)",
                color: "var(--text-muted)",
              }}
            >
              <Plus size={14} strokeWidth={1.5} />
              添加列
            </button>
          )}
        </div>
      </DndContext>

      {/* 卡片编辑 Modal */}
      <Modal
        open={editingCard !== null}
        onClose={() => setEditingCard(null)}
        title="编辑卡片"
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditingCard(null)}>
              取消
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSaveCard}>
              保存
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
              标题
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
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
              描述
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
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
              标签（逗号分隔）
            </label>
            <input
              type="text"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              placeholder="例如：前端, 高优先级"
              className="w-full px-3 py-2 text-sm rounded outline-none"
              style={{
                background: "var(--bg-surface-alt)",
                border: "1px solid var(--border-light)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
              截止日期
            </label>
            <DatePicker value={editDueDate} onChange={setEditDueDate} style={{ background: "var(--bg-surface-alt)", border: "1px solid var(--border-light)", color: "var(--text-primary)" }} />
          </div>

          {/* 甘特图关联 */}
          <div
            className="pt-3 border-t"
            style={{ borderColor: "var(--border-light)" }}
          >
            <label className="text-xs mb-2 block font-medium" style={{ color: "var(--gold)" }}>
              <Link2 size={12} strokeWidth={1.5} className="inline mr-1" />
              甘特图关联
            </label>
            {editingCard?.gantt_task_id ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                  已关联甘特图任务 #{editingCard.gantt_task_id}
                </span>
                <button
                  className="btn btn-ghost btn-sm text-[10px]"
                  style={{ color: "var(--color-danger)" }}
                  onClick={handleUnlinkFromGantt}
                >
                  <Unlink size={10} strokeWidth={1.5} className="inline mr-1" />
                  解除关联
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                  placeholder="任务名称"
                  className="w-full px-2 py-1.5 text-xs rounded outline-none"
                  style={{
                    background: "var(--bg-surface-alt)",
                    border: "1px solid var(--border-light)",
                    color: "var(--text-primary)",
                  }}
                />
                <div className="flex gap-2">
                  <DatePicker value={linkStartDate} onChange={setLinkStartDate} className="flex-1" style={{ background: "var(--bg-surface-alt)", border: "1px solid var(--border-light)", color: "var(--text-primary)" }} />
                  <input
                    type="number"
                    value={linkDuration}
                    onChange={(e) => setLinkDuration(e.target.value)}
                    placeholder="天数"
                    min="1"
                    className="w-20 px-2 py-1.5 text-xs rounded outline-none"
                    style={{
                      background: "var(--bg-surface-alt)",
                      border: "1px solid var(--border-light)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
                <button
                  className="btn btn-ghost btn-sm text-[10px] w-full"
                  style={{ color: "var(--gold)" }}
                  onClick={handleLinkToGantt}
                >
                  同步到甘特图
                </button>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* 添加任务 Modal */}
      <Modal
        open={showAddTask}
        onClose={resetAddTaskForm}
        title="添加任务"
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={resetAddTaskForm}>
              取消
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleAddTask}>
              添加
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
              任务名称
            </label>
            <input
              type="text"
              value={addTaskName}
              onChange={(e) => setAddTaskName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded outline-none"
              style={{
                background: "var(--bg-surface-alt)",
                border: "1px solid var(--border-light)",
                color: "var(--text-primary)",
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
                开始日期
              </label>
              <DatePicker value={addTaskStartDate} onChange={setAddTaskStartDate} style={{ background: "var(--bg-surface-alt)", border: "1px solid var(--border-light)", color: "var(--text-primary)" }} />
            </div>
            <div className="w-24">
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
                持续天数
              </label>
              <input
                type="number"
                min={1}
                value={addTaskDuration}
                onChange={(e) => setAddTaskDuration(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 text-sm rounded outline-none"
                style={{
                  background: "var(--bg-surface-alt)",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
              描述
            </label>
            <textarea
              value={addTaskDescription}
              onChange={(e) => setAddTaskDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm rounded outline-none resize-none"
              style={{
                background: "var(--bg-surface-alt)",
                border: "1px solid var(--border-light)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <label
            className="flex items-center gap-2 mt-2 cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            <input
              type="checkbox"
              checked={addTaskSyncGantt}
              onChange={(e) => setAddTaskSyncGantt(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs">同步到甘特图</span>
          </label>
        </div>
      </Modal>
    </>
  );
}