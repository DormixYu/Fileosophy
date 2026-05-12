import { Trash2, Target, Calendar } from "lucide-react";
import type { KanbanCard as CardType } from "@/types";

interface Props {
  card: CardType;
  columnType?: string | null;
  onComplete?: () => void;
  onClick?: () => void;
  onDelete?: () => void;
}

export default function KanbanCard({ card, columnType, onComplete, onClick, onDelete }: Props) {
  const isTodoPending = columnType === "todo_pending";
  const isTodoDone = columnType === "todo_done";
  const isTodo = isTodoPending || isTodoDone;

  return (
    <div
      className="flex-1 rounded-md p-2.5 cursor-pointer transition-all hover-lift group/card relative"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-light)",
        opacity: isTodoDone ? 0.6 : 1,
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

      {/* 甘特关联图标 */}
      {card.gantt_task_id && (
        <span
          className="absolute top-1 left-1"
          style={{ color: "var(--gold)" }}
          title="已关联甘特图任务"
        >
          <Target size={10} strokeWidth={1.5} />
        </span>
      )}

      <div className="flex items-start gap-1.5">
        {/* Todo checkbox */}
        {isTodo && onComplete && (
          <button
            className="mt-0.5 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onComplete();
            }}
            style={{ color: isTodoDone ? "var(--gold)" : "var(--text-muted)" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle
                cx="7" cy="7" r="6"
                fill={isTodoDone ? "var(--gold)" : "transparent"}
                stroke={isTodoDone ? "var(--gold)" : "var(--text-muted)"}
                strokeWidth="1.5"
              />
              {isTodoDone && (
                <path
                  d="M4 7 L6.5 9.5 L10 4.5"
                  stroke="#fff"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              )}
            </svg>
          </button>
        )}

        <div className="flex-1 min-w-0">
          <p
            className="text-xs mb-1 pr-4"
            style={{
              color: "var(--text-primary)",
              textDecoration: isTodoDone ? "line-through" : "none",
            }}
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
          {/* 截止日期 */}
          {card.due_date && (
            <div
              className="flex items-center gap-1 mt-1 text-[9px]"
              style={{ color: "var(--text-muted)" }}
            >
              <Calendar size={9} strokeWidth={1.5} />
              {card.due_date}
            </div>
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
      </div>
    </div>
  );
}