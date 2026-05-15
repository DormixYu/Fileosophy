import { useState, useEffect, useRef } from "react";
import type { ProjectStatus, ProjectStatusConfig } from "@/types";

export default function BatchStatusDropdown({
  statuses,
  onApply,
}: {
  statuses: ProjectStatusConfig[];
  onApply: (status: ProjectStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        className="btn btn-outline btn-sm hover-gold-text"
        onClick={() => setOpen(!open)}
      >
        批量改状态
      </button>
      {open && (
        <div
          className="absolute z-50 right-0 top-full mt-1 min-w-[140px] py-1 rounded-lg animate-scale-in"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-gold)",
          }}
        >
          {statuses.map((s) => (
            <button
              key={s.id}
              className="w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 hover-gold-bg"
              style={{
                color: "var(--text-secondary)",
                cursor: "pointer",
                border: "none",
              }}
              onClick={() => {
                onApply(s.id as ProjectStatus);
                setOpen(false);
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                style={{ background: s.color }}
              />
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}