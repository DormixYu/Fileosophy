import { Trash2 } from "lucide-react";
import type { KanbanCard as CardType } from "@/types";

interface Props {
  card: CardType;
  onClick?: () => void;
  onDelete?: () => void;
}

export default function KanbanCard({ card, onClick, onDelete }: Props) {
  return (
    <div
      className="flex-1 rounded-md p-2.5 cursor-pointer transition-all hover-lift group/card relative"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-light)",
      }}
      onClick={onClick}
    >
      {/* 删除按钮 */}
      {onDelete && (
        <button
          className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover/card:opacity-100 transition-opacity"
          style={{ color: "var(--color-danger)" }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={12} strokeWidth={1.5} />
        </button>
      )}

      <p
        className="text-xs mb-1 pr-4"
        style={{ color: "var(--text-primary)" }}
      >
        {card.title}
      </p>
      {card.description && (
        <p
          className="text-[10px] line-clamp-2"
          style={{ color: "var(--text-tertiary)" }}
        >
          {card.description}
        </p>
      )}
      {card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {card.tags.map((tag) => (
            <span
              key={tag}
              className="badge badge-primary text-[9px]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
