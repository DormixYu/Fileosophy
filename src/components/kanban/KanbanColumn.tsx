import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Pencil, Trash2 } from "lucide-react";
import type { KanbanColumn as ColumnType, KanbanCard as CardType } from "@/types";
import { useKanbanStore } from "@/stores/useKanbanStore";
import KanbanCard from "./KanbanCard";
import Modal from "@/components/common/Modal";

interface Props {
  column: ColumnType;
  onCardClick?: (card: CardType) => void;
  onCardDelete?: (cardId: number) => void;
}

export default function KanbanColumn({ column, onCardClick, onCardDelete }: Props) {
  const { createCard, updateColumn, deleteColumn } = useKanbanStore();
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [showRename, setShowRename] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleAddCard = async () => {
    if (!newTitle.trim()) return;
    await createCard({ column_id: column.id, title: newTitle.trim() });
    setNewTitle("");
    setShowAdd(false);
  };

  const handleRename = async () => {
    if (!renameTitle.trim()) return;
    await updateColumn(column.id, renameTitle.trim());
    setShowRename(false);
  };

  const handleDeleteColumn = async () => {
    await deleteColumn(column.id);
    setShowDeleteConfirm(false);
  };

  return (
    <>
      <div
        className="w-72 shrink-0 rounded-lg flex flex-col max-h-full group/col"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
        }}
      >
        {/* 列头 */}
        <div
          className="flex items-center justify-between px-3 py-2.5 border-b"
          style={{ borderColor: "var(--border-light)" }}
        >
          <h3
            className="text-sm font-medium truncate flex-1"
            style={{ color: "var(--text-primary)" }}
          >
            {column.title}
          </h3>
          <div className="flex items-center gap-0.5 ml-1">
            <button
              className="p-0.5 rounded opacity-0 group-hover/col:opacity-100 transition-opacity"
              style={{ color: "var(--text-muted)" }}
              onClick={() => {
                setRenameTitle(column.title);
                setShowRename(true);
              }}
            >
              <Pencil size={12} strokeWidth={1.5} />
            </button>
            <button
              className="p-0.5 rounded opacity-0 group-hover/col:opacity-100 transition-opacity"
              style={{ color: "var(--color-danger)" }}
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 size={12} strokeWidth={1.5} />
            </button>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full ml-1"
              style={{
                background: "var(--gold-glow)",
                color: "var(--gold)",
              }}
            >
              {column.cards?.length ?? 0}
            </span>
          </div>
        </div>

        {/* 卡片列表 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
          {(column.cards ?? []).map((card, index) => (
            <SortableCard
              key={card.id}
              card={card}
              columnId={column.id}
              index={index}
              onClick={onCardClick ? () => onCardClick(card) : undefined}
              onDelete={onCardDelete ? () => onCardDelete(card.id) : undefined}
            />
          ))}

          {showAdd ? (
            <div className="p-2">
              <input
                type="text"
                placeholder="卡片标题"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
                className="w-full px-2 py-1 text-xs rounded outline-none mb-2"
                style={{
                  background: "var(--bg-surface-alt)",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-primary)",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddCard();
                  if (e.key === "Escape") setShowAdd(false);
                }}
              />
              <div className="flex gap-1">
                <button
                  className="btn btn-primary btn-sm text-[10px]"
                  onClick={handleAddCard}
                >
                  添加
                </button>
                <button
                  className="btn btn-ghost btn-sm text-[10px]"
                  onClick={() => setShowAdd(false)}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="w-full py-1.5 flex items-center justify-center gap-1 text-[10px] rounded transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <Plus size={12} strokeWidth={1.5} />
              添加卡片
            </button>
          )}
        </div>
      </div>

      {/* 重命名 Modal */}
      <Modal
        open={showRename}
        onClose={() => setShowRename(false)}
        title="重命名列"
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowRename(false)}>
              取消
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleRename}>
              保存
            </button>
          </>
        }
      >
        <input
          type="text"
          value={renameTitle}
          onChange={(e) => setRenameTitle(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded outline-none"
          style={{
            background: "var(--bg-surface-alt)",
            border: "1px solid var(--border-light)",
            color: "var(--text-primary)",
          }}
          onKeyDown={(e) => e.key === "Enter" && handleRename()}
          autoFocus
        />
      </Modal>

      {/* 删除确认 Modal */}
      <Modal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="删除列"
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowDeleteConfirm(false)}>
              取消
            </button>
            <button
              className="btn btn-sm"
              style={{
                background: "var(--color-danger)",
                color: "#fff",
              }}
              onClick={handleDeleteColumn}
            >
              删除
            </button>
          </>
        }
      >
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          确定删除此列及其所有卡片？此操作不可撤销。
        </p>
      </Modal>
    </>
  );
}

function SortableCard({
  card,
  columnId,
  index,
  onClick,
  onDelete,
}: {
  card: CardType;
  columnId: number;
  index: number;
  onClick?: () => void;
  onDelete?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { cardId: card.id, columnId, position: index },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="flex items-start gap-1">
        <button
          {...listeners}
          className="mt-2 p-0.5 cursor-grab active:cursor-grabbing"
          style={{ color: "var(--text-muted)" }}
        >
          <GripVertical size={12} strokeWidth={1.5} />
        </button>
        <KanbanCard card={card} onClick={onClick} onDelete={onDelete} />
      </div>
    </div>
  );
}
