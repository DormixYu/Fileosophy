import { useEffect, useState } from "react";
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useKanbanStore } from "@/stores/useKanbanStore";
import type { KanbanCard as CardType } from "@/types";
import Modal from "@/components/common/Modal";
import KanbanColumn from "./KanbanColumn";

interface Props {
  projectId: number;
}

export default function KanbanBoard({ projectId }: Props) {
  const { board, fetchBoard, addColumn, moveCard, updateCard, deleteCard } = useKanbanStore();
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [showAddColumn, setShowAddColumn] = useState(false);

  // 卡片编辑状态
  const [editingCard, setEditingCard] = useState<CardType | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");

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

    if (!activeData || !overData) return;

    const cardId = activeData.cardId as number;
    const targetColumnId = overData.columnId as number;
    const position = overData.position as number;

    moveCard(cardId, targetColumnId, position);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // 可在此处理跨列拖拽的视觉反馈
  };

  const handleAddColumn = async () => {
    if (!newColumnTitle.trim()) return;
    await addColumn({ project_id: projectId, title: newColumnTitle.trim() });
    setNewColumnTitle("");
    setShowAddColumn(false);
  };

  // 卡片编辑
  const handleCardClick = (card: CardType) => {
    setEditingCard(card);
    setEditTitle(card.title);
    setEditDescription(card.description ?? "");
    setEditTags(card.tags.join(", "));
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
    } as Parameters<typeof updateCard>[1]);
    setEditingCard(null);
  };

  const handleDeleteCard = (cardId: number) => {
    deleteCard(cardId);
    if (editingCard?.id === cardId) setEditingCard(null);
  };

  if (!board) {
    return (
      <div
        className="text-center py-12 text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        加载看板…
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
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
        </div>
      </Modal>
    </>
  );
}
