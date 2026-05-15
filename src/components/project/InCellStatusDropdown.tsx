import { useState, useEffect, useRef } from "react";
import type { Project, ProjectStatus, ProjectStatusConfig } from "@/types";

export default function InCellStatusDropdown({
  project,
  statuses,
  getStatusConfig,
  onStatusChange,
}: {
  project: Project;
  statuses: ProjectStatusConfig[];
  getStatusConfig: (id: string | null) => ProjectStatusConfig | undefined;
  onStatusChange?: (projectId: number, newStatus: ProjectStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const config = getStatusConfig(project.status);

  // 点击外部关闭
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
    <span ref={containerRef} className="relative inline-block">
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] cursor-pointer select-none transition-all"
        style={{
          background: config ? `${config.color}15` : "var(--bg-surface-alt)",
          color: config?.color ?? "var(--text-muted)",
          border: `1px solid ${config ? `${config.color}25` : "var(--border-default)"}`,
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (onStatusChange) setOpen(!open);
        }}
        title="点击更改状态"
      >
        <span
          className="w-2 h-2 rounded-full inline-block shrink-0"
          style={{ background: config?.color ?? "var(--text-muted)" }}
        />
        {config?.name ?? "—"}
      </span>
      {open && (
        <div
          className="absolute z-50 top-full left-0 mt-1 min-w-[130px] py-1 rounded-lg animate-scale-in"
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
                color: s.id === project.status ? s.color : "var(--text-secondary)",
                background: s.id === project.status ? `${s.color}15` : "transparent",
                cursor: "pointer",
                border: "none",
              }}
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange?.(project.id, s.id as ProjectStatus);
                setOpen(false);
              }}
            >
              <span
                className="w-2 h-2 rounded-full inline-block shrink-0"
                style={{ background: s.color }}
              />
              {s.name}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}