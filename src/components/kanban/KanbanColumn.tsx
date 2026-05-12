import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
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
  onCardComplete?: (cardId: number) => void;
  onAddTask?: (columnId: number) => void;
}

export default function KanbanColumn({ column, onCardClick, onCardDelete, onCardComplete, onAddTask }: Props) {
  const { updateColumn, deleteColumn } = useKanbanStore();
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `column-${column.id}`,
    data: { columnId: column.id, isColumn: true },
  });
  const [showRename, setShowRename] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
            className="text-sm font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {column.title}
          </h3>
          {column.column_type && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded ml-1"
              style={{
                background: "var(--gold-glow)",
                color: "var(--gold)",
              }}
            >
              {column.column_type === "todo_pending" ? "待办" : column.column_type === "todo_done" ? "已完成" : ""}
            </span>
          )}
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
        <div ref={setDroppableRef} className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
          {(column.cards ?? []).map((card, index) => (
            <SortableCard
              key={card.id}
              card={card}
              columnId={column.id}
              columnType={column.column_type}
              index={index}
              onClick={onCardClick ? () => onCardClick(card) : undefined}
              onDelete={onCardDelete ? () => onCardDelete(card.id) : undefined}
              onComplete={onCardComplete && column.column_type === "todo_pending" ? () => onCardComplete(card.id) : undefined}
            />
          ))}

          <button
            onClick={() => onAddTask?.(column.id)}
            className="w-full py-1.5 flex items-center justify-center gap-1 text-[10px] rounded transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <Plus size={12} strokeWidth={1.5} />
            添加任务
          </button>
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
  columnType,
  index,
  onClick,
  onDelete,
  onComplete,
}: {
  card: CardType;
  columnId: number;
  columnType?: string | null;
  index: number;
  onClick?: () => void;
  onDelete?: () => void;
  onComplete?: () => void;
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
        <KanbanCard card={card} columnType={columnType} onComplete={onComplete} onClick={onClick} onDelete={onDelete} />
      </div>
    </div>
  );
}
