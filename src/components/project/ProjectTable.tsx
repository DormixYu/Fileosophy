import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Share2,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { formatDate } from "@/lib/formatUtils";
import InCellStatusDropdown from "./InCellStatusDropdown";
import type {
  Project,
  ProjectStatus,
  ProjectStatusConfig,
  ProjectTypeConfig,
  ProjectTableColumn,
} from "@/types";

export type SortDir = "asc" | "desc" | null;

export interface SortState {
  key: string;
  dir: SortDir;
}

const ROW_HEIGHT = 35;
const HEADER_HEIGHT = 36;

// ── 单元格内容渲染 ─────────────────────────────────────────────

function CellContent({
  column,
  project,
  statuses,
  types,
  getStatusConfig,
  onStatusChange,
}: {
  column: ProjectTableColumn;
  project: Project;
  statuses: ProjectStatusConfig[];
  types: ProjectTypeConfig[];
  getStatusConfig: (id: string | null) => ProjectStatusConfig | undefined;
  onStatusChange?: (projectId: number, newStatus: ProjectStatus) => void;
}) {
  const value = (project as unknown as Record<string, unknown>)[column.key];

  switch (column.key) {
    case "project_number":
      return (
        <span className="font-mono text-[11px]" style={{ color: "var(--text-secondary)" }}>
          {String(value || "—")}
        </span>
      );

    case "name":
      return (
        <Link
          to={`/project/${project.id}`}
          className="hover:underline font-serif"
          style={{ color: "var(--text-primary)" }}
        >
          {String(value)}
        </Link>
      );

    case "status": {
      return (
        <InCellStatusDropdown
          project={project}
          statuses={statuses}
          getStatusConfig={getStatusConfig}
          onStatusChange={onStatusChange}
        />
      );
    }

    case "project_type": {
      const typeName = types.find(t => t.id === String(value))?.name;
      return (
        <span style={{ color: value ? "var(--text-secondary)" : "var(--text-muted)" }}>
          {typeName || String(value || "—")}
        </span>
      );
    }

    case "start_date":
    case "end_date":
    case "created_at":
    case "updated_at":
    case "status_changed_at":
      return (
        <span className="font-mono text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          {formatDate(String(value || ""))}
        </span>
      );

    case "created_by":
      return (
        <span style={{ color: value ? "var(--text-secondary)" : "var(--text-muted)" }}>
          {String(value || "—")}
        </span>
      );

    default:
      return (
        <span style={{ color: "var(--text-secondary)" }}>
          {String(value ?? "—")}
        </span>
      );
  }
}

// ── 表格组件 ──────────────────────────────────────────────────

export default function ProjectTable({
  filtered,
  visibleColumns,
  sort,
  selectedIds,
  selectAllRef,
  handleSort,
  handleSelectAll,
  handleToggleSelect,
  handleDoubleClick,
  handleStatusChange,
  setShareProject,
  setEditProject,
  handleDelete,
  statuses,
  types,
  shareStatus,
  onColumnResizeLive,
  onColumnResizeEnd,
}: {
  filtered: Project[];
  visibleColumns: ProjectTableColumn[];
  sort: SortState;
  selectedIds: Set<number>;
  selectAllRef: React.RefObject<HTMLInputElement>;
  handleSort: (key: string) => void;
  handleSelectAll: () => void;
  handleToggleSelect: (id: number) => void;
  handleDoubleClick: (project: Project) => void;
  handleStatusChange: (projectId: number, newStatus: ProjectStatus) => void;
  setShareProject: (p: Project) => void;
  setEditProject: (p: Project) => void;
  handleDelete: (e: React.MouseEvent, id: number) => void;
  statuses: ProjectStatusConfig[];
  types: ProjectTypeConfig[];
  shareStatus: { port: number; path: string }[];
  onColumnResizeLive: (colKey: string, newWidth: number) => void;
  onColumnResizeEnd: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fillRows, setFillRows] = useState(0);

  // 拖拽调宽状态（用 ref 避免 useEffect 重建）
  const resizingRef = useRef<{ colKey: string; startX: number; startWidth: number } | null>(null);
  const [resizingKey, setResizingKey] = useState<string | null>(null); // 仅用于视觉指示

  const getStatusConfig = useCallback(
    (statusId?: string | null) => statuses.find((s) => s.id === statusId),
    [statuses]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const calc = () => {
      const h = el.clientHeight;
      const available = Math.max(0, Math.floor((h - HEADER_HEIGHT) / ROW_HEIGHT));
      setFillRows(Math.max(0, available - filtered.length));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [filtered.length]);

  const handleResizeStart = (colKey: string, currentWidth: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { colKey, startX: e.clientX, startWidth: currentWidth };
    setResizingKey(colKey);

    const handleMouseMove = (ev: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const delta = ev.clientX - r.startX;
      onColumnResizeLive(r.colKey, r.startWidth + delta);
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      setResizingKey(null);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      onColumnResizeEnd();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div ref={containerRef} className="h-full overflow-auto">
      <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "var(--bg-surface-alt)" }}>
            <th
              className="px-3 py-2.5 select-none"
              style={{
                width: 36,
                borderBottom: "1px solid var(--border-default)",
              }}
            >
              <input
                type="checkbox"
                ref={selectAllRef}
                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                onChange={handleSelectAll}
                className="accent-[var(--gold)]"
              />
            </th>
            {visibleColumns.map((col, i) => (
              <th
                key={col.key}
                className="text-left px-3 py-2.5 select-none relative"
                style={{
                  width: col.key === "name" ? undefined : col.width,
                  minWidth: col.key === "name" ? 120 : 40,
                  cursor: col.sortable ? "pointer" : "default",
                  borderBottom: "1px solid var(--border-default)",
                  letterSpacing: "0.06em",
                  fontSize: "11px",
                  userSelect: resizingKey ? "none" : "auto",
                }}
                onClick={() => {
                  if (resizingKey) return;
                  if (col.sortable) handleSort(col.key);
                }}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && (
                    <span style={{ opacity: sort.key === col.key ? 1 : 0.25 }}>
                      {sort.key === col.key && sort.dir === "asc" ? (
                        <ArrowUp size={11} strokeWidth={1.5} />
                      ) : sort.key === col.key && sort.dir === "desc" ? (
                        <ArrowDown size={11} strokeWidth={1.5} />
                      ) : (
                        <ArrowUp size={11} strokeWidth={1.5} style={{ opacity: 0.3 }} />
                      )}
                    </span>
                  )}
                </span>

                {/* 列宽拖拽把手（右侧） */}
                {i < visibleColumns.length - 1 && (
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[var(--gold)] transition-colors"
                    style={{ opacity: resizingKey === col.key ? 1 : 0.15 }}
                    onMouseDown={(e) => handleResizeStart(col.key, col.width, e)}
                  />
                )}
              </th>
            ))}
            <th
              className="text-right px-3 py-2.5"
              style={{
                color: "var(--text-muted)",
                width: 80,
                borderBottom: "1px solid var(--border-default)",
                fontSize: "11px",
              }}
            >
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((project) => (
            <tr
              key={project.id}
              className="group transition-colors hover-elevated-bg"
              style={{ borderBottom: "1px solid var(--border-light)" }}
              onDoubleClick={() => handleDoubleClick(project)}
            >
              <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(project.id)}
                  onChange={() => handleToggleSelect(project.id)}
                  className="accent-[var(--gold)]"
                />
              </td>
              {visibleColumns.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-2 ${col.key === "name" ? "" : "whitespace-nowrap"}`}
                  style={{ color: "var(--text-primary)" }}
                >
                  <CellContent
                    column={col}
                    project={project}
                    statuses={statuses}
                    types={types}
                    getStatusConfig={getStatusConfig}
                    onStatusChange={handleStatusChange}
                  />
                </td>
              ))}
              <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-1">
                  {shareStatus.find(s => s.path === project.folder_path) && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] mr-1"
                      style={{ background: "var(--gold-glow-strong)", color: "var(--gold)", border: "1px solid var(--color-primary-200)" }}
                      title={`共享中 · 端口 ${shareStatus.find(s => s.path === project.folder_path)!.port}`}
                    >
                      <Share2 size={10} strokeWidth={1.5} />
                      共享中
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShareProject(project);
                    }}
                    className="p-1 rounded transition-colors hover-gold-bg hover-gold-text"
                    style={{ color: "var(--text-muted)", cursor: "pointer", background: "none", border: "none" }}
                    title="分享项目"
                    aria-label="分享项目"
                  >
                    <Share2 size={13} strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditProject(project);
                    }}
                    className="p-1 rounded transition-colors hover-gold-bg hover-gold-text"
                    style={{ color: "var(--text-muted)", cursor: "pointer", background: "none", border: "none" }}
                    title="编辑项目"
                    aria-label="编辑项目"
                  >
                    <Pencil size={13} strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, project.id)}
                    className="p-1 rounded transition-colors hover-danger-text"
                    style={{ color: "var(--text-muted)", cursor: "pointer", background: "none", border: "none" }}
                    title="删除项目"
                    aria-label="删除项目"
                  >
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {fillRows > 0 &&
            Array.from({ length: fillRows }, (_, i) => (
              <tr
                key={`_empty_${i}`}
                style={{ height: ROW_HEIGHT, borderBottom: "1px solid var(--border-light)" }}
              >
                <td colSpan={visibleColumns.length + 2} />
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}