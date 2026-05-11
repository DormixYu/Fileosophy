import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  Trash2,
  Share2,
  Pencil,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  FolderOpen,
  Link as LinkIcon,
} from "lucide-react";
import { useProjectStore } from "@/stores/useProjectStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { projectApi, shareApi } from "@/lib/tauri-api";
import ShareProjectDialog from "@/components/common/ShareProjectDialog";
import JoinShareDialog from "@/components/common/JoinShareDialog";
import type {
  Project,
  ProjectStatus,
  ProjectStatusConfig,
  ProjectTypeConfig,
  ProjectTableColumn,
} from "@/types";
import {
  DEFAULT_PROJECT_STATUSES,
  DEFAULT_PROJECT_TYPES,
  DEFAULT_PROJECT_TABLE_COLUMNS,
} from "@/types";

type SortDir = "asc" | "desc" | null;

interface SortState {
  key: string;
  dir: SortDir;
}

export default function ProjectListPage() {
  const { projects, fetchProjects, createProject, updateProject, deleteProject, loading } =
    useProjectStore();
  const { settings } = useSettingsStore();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "">("");
  const [sort, setSort] = useState<SortState>({ key: "updated_at", dir: "desc" });
  const [showCreate, setShowCreate] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [shareProject, setShareProject] = useState<Project | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [shareStatus, setShareStatus] = useState<{ port: number; path: string } | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const refreshShareStatus = useCallback(() => {
    shareApi.getStatus().then(setShareStatus).catch(() => setShareStatus(null));
  }, []);

  useEffect(() => {
    fetchProjects();
    refreshShareStatus();
  }, [fetchProjects, refreshShareStatus]);

  // 从设置中读取项目状态配置
  const statuses: ProjectStatusConfig[] = useMemo(() => {
    try {
      const raw = settings["project_statuses"];
      return raw ? JSON.parse(raw) : DEFAULT_PROJECT_STATUSES;
    } catch {
      return DEFAULT_PROJECT_STATUSES;
    }
  }, [settings]);

  // 从设置中读取项目分类配置
  const types: ProjectTypeConfig[] = useMemo(() => {
    try {
      const raw = settings["project_types"];
      return raw ? JSON.parse(raw) : DEFAULT_PROJECT_TYPES;
    } catch {
      return DEFAULT_PROJECT_TYPES;
    }
  }, [settings]);

  // 从设置中读取表格列配置
  const columns: ProjectTableColumn[] = useMemo(() => {
    try {
      const raw = settings["project_table_columns"];
      return raw ? JSON.parse(raw) : DEFAULT_PROJECT_TABLE_COLUMNS;
    } catch {
      return DEFAULT_PROJECT_TABLE_COLUMNS;
    }
  }, [settings]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => c.visible || c.fixed),
    [columns]
  );

  const getStatusConfig = useCallback(
    (statusId: string) => statuses.find((s) => s.id === statusId),
    [statuses]
  );

  // 筛选 + 排序
  const filtered = useMemo(() => {
    let result = [...projects];

    // 搜索
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.project_number || "").toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q)
      );
    }

    // 状态筛选
    if (statusFilter) {
      result = result.filter((p) => p.status === statusFilter);
    }

    // 排序
    if (sort.key && sort.dir) {
      result.sort((a, b) => {
        const aVal = (a as unknown as Record<string, unknown>)[sort.key] ?? "";
        const bVal = (b as unknown as Record<string, unknown>)[sort.key] ?? "";
        const cmp = String(aVal).localeCompare(String(bVal), "zh-CN");
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [projects, search, statusFilter, sort]);

  const handleSort = (key: string) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: "", dir: null };
    });
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("确定删除该项目？所有数据将被清除。")) {
      await deleteProject(id);
    }
  };

  const handleDoubleClick = async (project: Project) => {
    if (!project.folder_path) return;
    try {
      await projectApi.openFolder(project.folder_path);
    } catch (e) {
      console.error("打开文件夹失败:", e);
    }
  };

  const handleStatusChange = async (projectId: number, newStatus: ProjectStatus) => {
    try {
      await updateProject(projectId, { status: newStatus });
    } catch (e) {
      console.error("更新状态失败:", e);
    }
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((p) => p.id)));
    }
  };

  const handleBatchStatusChange = async (newStatus: ProjectStatus) => {
    const ids = [...selectedIds];
    let successCount = 0;
    for (const id of ids) {
      try {
        await updateProject(id, { status: newStatus });
        successCount++;
      } catch {
        // 单个失败不影响其他
      }
    }
    setSelectedIds(new Set());
    if (successCount < ids.length) {
      console.warn(`批量更新状态: ${successCount}/${ids.length} 成功`);
    }
  };

  // indeterminate 状态同步
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedIds.size > 0 && selectedIds.size < filtered.length;
    }
  }, [selectedIds.size, filtered.length]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleDateString("zh-CN");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="h-full flex flex-col p-6 animate-slide-up">
      {/* 页头 */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h1 className="text-headline" style={{ color: "var(--text-primary)" }}>
          项目
        </h1>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost"
            onClick={() => setShowJoinDialog(true)}
            style={{ border: "1px solid var(--border-default)" }}
          >
            <LinkIcon size={14} strokeWidth={1.5} />
            链接项目
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={14} strokeWidth={1.5} />
            新建项目
          </button>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="flex items-center gap-3 mb-3 shrink-0">
        {/* 搜索 */}
        <div className="relative flex-1 max-w-xs">
          <Search
            size={14}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            placeholder="搜索编号、名称…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-md outline-none transition-all"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        {/* 状态筛选标签 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setStatusFilter("")}
            className="px-2.5 py-1 text-[11px] rounded-full transition-all"
            style={{
              background: statusFilter === "" ? "var(--gold-glow-strong)" : "var(--bg-elevated)",
              color: statusFilter === "" ? "var(--gold)" : "var(--text-tertiary)",
              border: `1px solid ${statusFilter === "" ? "var(--gold)" : "var(--border-default)"}`,
              cursor: "pointer",
            }}
          >
            全部
          </button>
          {statuses.map((s) => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(statusFilter === s.id ? "" : s.id)}
              className="px-2.5 py-1 text-[11px] rounded-full transition-all flex items-center gap-1"
              style={{
                background: statusFilter === s.id ? `${s.color}18` : "var(--bg-elevated)",
                color: statusFilter === s.id ? s.color : "var(--text-tertiary)",
                border: `1px solid ${statusFilter === s.id ? s.color : "var(--border-default)"}`,
                cursor: "pointer",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ background: s.color }}
              />
              {s.name}
            </button>
          ))}
        </div>

        <span className="text-[11px] ml-auto" style={{ color: "var(--text-muted)" }}>
          {filtered.length} 个项目
        </span>
      </div>

      {/* 批量操作工具栏 */}
      {selectedIds.size > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-2 rounded-lg mb-3 shrink-0 animate-slide-up"
          style={{
            background: "var(--gold-glow-strong)",
            border: "1px solid var(--gold)",
          }}
        >
          <span className="text-xs" style={{ color: "var(--text-primary)" }}>
            已选 {selectedIds.size} 项
          </span>
          <button
            className="text-xs underline cursor-pointer"
            style={{ color: "var(--text-muted)", background: "none", border: "none" }}
            onClick={() => setSelectedIds(new Set())}
          >
            取消选择
          </button>
          <div className="flex-1" />
          <BatchStatusDropdown
            statuses={statuses}
            onApply={handleBatchStatusChange}
          />
        </div>
      )}

      {/* 表格 */}
      <div className="flex-1 overflow-auto rounded-lg" style={{ border: "1px solid var(--border-default)" }}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--text-muted)" }}>
            加载中…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--text-tertiary)" }}>
            {search || statusFilter ? "没有匹配的项目" : "还没有项目"}
          </div>
        ) : (
          <TableWithFill filtered={filtered} visibleColumns={visibleColumns} sort={sort} selectedIds={selectedIds} selectAllRef={selectAllRef} getStatusConfig={getStatusConfig} formatDate={formatDate} handleSort={handleSort} handleSelectAll={handleSelectAll} handleToggleSelect={handleToggleSelect} handleStatusChange={handleStatusChange} handleDoubleClick={handleDoubleClick} setShareProject={setShareProject} setEditProject={setEditProject} handleDelete={handleDelete} statuses={statuses} shareStatus={shareStatus} />
        )}
      </div>

      {/* 新建项目弹窗 */}
      {showCreate && (
        <ProjectDialog
          title="新建项目"
          types={types}
          statuses={statuses}
          onClose={() => setShowCreate(false)}
          onSubmit={async (data) => {
            await createProject(data);
            setShowCreate(false);
          }}
        />
      )}

      {/* 编辑项目弹窗 */}
      {editProject && (
        <ProjectDialog
          title="编辑项目"
          project={editProject}
          types={types}
          statuses={statuses}
          onClose={() => setEditProject(null)}
          onSubmit={async (data) => {
            await updateProject(editProject.id, data);
            setEditProject(null);
          }}
        />
      )}

      {/* 分享项目弹窗 */}
      {shareProject && (
        <ShareProjectDialog
          project={shareProject}
          initialSharing={shareStatus?.path === shareProject.folder_path}
          initialPort={shareStatus?.path === shareProject.folder_path ? shareStatus.port : 0}
          onClose={() => {
            setShareProject(null);
            refreshShareStatus();
          }}
        />
      )}

      {/* 链接项目弹窗 */}
      {showJoinDialog && (
        <JoinShareDialog onClose={() => setShowJoinDialog(false)} />
      )}
    </div>
  );
}

// ── 表格组件（填充空白行）───────────────────────────────────────

const ROW_HEIGHT = 35;
const HEADER_HEIGHT = 36;

function TableWithFill({
  filtered,
  visibleColumns,
  sort,
  selectedIds,
  selectAllRef,
  getStatusConfig,
  formatDate,
  handleSort,
  handleSelectAll,
  handleToggleSelect,
  handleStatusChange,
  handleDoubleClick,
  setShareProject,
  setEditProject,
  handleDelete,
  statuses,
  shareStatus,
}: {
  filtered: Project[];
  visibleColumns: ProjectTableColumn[];
  sort: SortState;
  selectedIds: Set<number>;
  selectAllRef: React.RefObject<HTMLInputElement>;
  getStatusConfig: (id: string) => ProjectStatusConfig | undefined;
  formatDate: (s: string) => string;
  handleSort: (key: string) => void;
  handleSelectAll: () => void;
  handleToggleSelect: (id: number) => void;
  handleStatusChange: (projectId: number, newStatus: ProjectStatus) => void;
  handleDoubleClick: (project: Project) => void;
  setShareProject: (p: Project) => void;
  setEditProject: (p: Project) => void;
  handleDelete: (e: React.MouseEvent, id: number) => void;
  statuses: ProjectStatusConfig[];
  shareStatus: { port: number; path: string } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fillRows, setFillRows] = useState(0);

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
            {visibleColumns.map((col) => (
              <th
                key={col.key}
                className="text-left px-3 py-2.5 font-medium select-none"
                style={{
                  color: "var(--text-muted)",
                  width: col.key === "name" ? undefined : col.width,
                  cursor: col.sortable ? "pointer" : "default",
                  borderBottom: "1px solid var(--border-default)",
                  letterSpacing: "0.04em",
                  fontSize: "11px",
                }}
                onClick={() => col.sortable && handleSort(col.key)}
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
                        <ArrowUpDown size={11} strokeWidth={1.5} />
                      )}
                    </span>
                  )}
                </span>
              </th>
            ))}
            <th
              className="text-right px-3 py-2.5 font-medium"
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
              className="group transition-colors"
              style={{ borderBottom: "1px solid var(--border-default)" }}
              onDoubleClick={() => handleDoubleClick(project)}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
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
                  className="px-3 py-2 whitespace-nowrap"
                  style={{ color: "var(--text-primary)" }}
                >
                  <CellContent
                    column={col}
                    project={project}
                    statuses={statuses}
                    getStatusConfig={getStatusConfig}
                    formatDate={formatDate}
                    onStatusChange={handleStatusChange}
                  />
                </td>
              ))}
              <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-1">
                  {shareStatus?.path === project.folder_path && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] mr-1"
                      style={{ background: "var(--gold-glow)", color: "var(--gold)" }}
                      title={`共享中 · 端口 ${shareStatus.port}`}
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
                    className="p-1 rounded hover:bg-[var(--bg-surface-alt)] transition-colors"
                    style={{ color: "var(--text-muted)", cursor: "pointer", background: "none", border: "none" }}
                    title="分享项目"
                  >
                    <Share2 size={13} strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditProject(project);
                    }}
                    className="p-1 rounded hover:bg-[var(--bg-surface-alt)] transition-colors"
                    style={{ color: "var(--text-muted)", cursor: "pointer", background: "none", border: "none" }}
                    title="编辑项目"
                  >
                    <Pencil size={13} strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, project.id)}
                    className="p-1 rounded hover:bg-red-50 transition-colors"
                    style={{ color: "var(--color-danger)", cursor: "pointer", background: "none", border: "none" }}
                    title="删除项目"
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
                style={{ height: ROW_HEIGHT, borderBottom: "1px solid var(--border-default)" }}
              >
                <td colSpan={visibleColumns.length + 2} />
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 单元格内容渲染 ─────────────────────────────────────────────

function CellContent({
  column,
  project,
  statuses,
  getStatusConfig,
  formatDate,
  onStatusChange,
}: {
  column: ProjectTableColumn;
  project: Project;
  statuses: ProjectStatusConfig[];
  getStatusConfig: (id: string) => ProjectStatusConfig | undefined;
  formatDate: (s: string) => string;
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

    case "project_type":
      return (
        <span style={{ color: value ? "var(--text-secondary)" : "var(--text-muted)" }}>
          {String(value || "—")}
        </span>
      );

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

// ── 状态下拉组件 ──────────────────────────────────────────────

function InCellStatusDropdown({
  project,
  statuses,
  getStatusConfig,
  onStatusChange,
}: {
  project: Project;
  statuses: ProjectStatusConfig[];
  getStatusConfig: (id: string) => ProjectStatusConfig | undefined;
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
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] cursor-pointer select-none"
        style={{
          background: config ? `${config.color}18` : "var(--bg-surface-alt)",
          color: config?.color ?? "var(--text-muted)",
          border: `1px solid ${config ? `${config.color}30` : "var(--border-default)"}`,
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (onStatusChange) setOpen(!open);
        }}
        title="点击更改状态"
      >
        <span
          className="w-1.5 h-1.5 rounded-full inline-block"
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
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {statuses.map((s) => (
            <button
              key={s.id}
              className="w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2"
              style={{
                color: s.id === project.status ? s.color : "var(--text-secondary)",
                background: s.id === project.status ? `${s.color}12` : "transparent",
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
                className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
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

// ── 批量状态下拉组件 ──────────────────────────────────────────

function BatchStatusDropdown({
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
        className="btn btn-sm"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          cursor: "pointer",
        }}
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
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {statuses.map((s) => (
            <button
              key={s.id}
              className="w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2"
              style={{
                color: "var(--text-secondary)",
                background: "transparent",
                cursor: "pointer",
                border: "none",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-alt)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
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

// ── 新建/编辑项目弹窗 ─────────────────────────────────────────

interface ProjectDialogProps {
  title: string;
  project?: Project;
  types: ProjectTypeConfig[];
  statuses: ProjectStatusConfig[];
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    description?: string;
    project_type?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
    parent_path?: string;
  }) => Promise<void>;
}

function ProjectDialog({ title, project, types, statuses, onClose, onSubmit }: ProjectDialogProps) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [projectType, setProjectType] = useState(project?.project_type ?? "");
  const [status, setStatus] = useState(project?.status ?? "planning");
  const [startDate, setStartDate] = useState(project?.start_date?.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(project?.end_date?.slice(0, 10) ?? "");
  const [parentPath, setParentPath] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        project_type: projectType || undefined,
        status: status || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        parent_path: parentPath || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="card w-[480px] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-title" style={{ color: "var(--text-primary)" }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg-surface-alt)]"
            style={{ color: "var(--text-muted)", cursor: "pointer", background: "none", border: "none" }}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {project && (
          <div className="mb-3 text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>
            编号：{project.project_number || "—"}
          </div>
        )}

        <div className="space-y-3">
          <input
            type="text"
            placeholder="项目名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 text-sm rounded-md outline-none"
            style={inputStyle}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />

          <textarea
            placeholder="项目描述（可选）"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm rounded-md outline-none resize-none"
            style={inputStyle}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: "var(--text-muted)" }}>
                项目分类
              </label>
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-md outline-none"
                style={inputStyle}
              >
                <option value="">未选择</option>
                {types.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: "var(--text-muted)" }}>
                项目状态
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="w-full px-3 py-1.5 text-sm rounded-md outline-none"
                style={inputStyle}
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: "var(--text-muted)" }}>
                开始日期
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-md outline-none"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: "var(--text-muted)" }}>
                截止日期
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-md outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          {/* 项目文件夹位置 */}
          {!project && (
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: "var(--text-muted)" }}>
                项目文件夹位置（可选）
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={parentPath}
                  onChange={(e) => setParentPath(e.target.value)}
                  placeholder="留空则使用默认根目录"
                  className="flex-1 px-3 py-1.5 text-sm font-mono rounded-md outline-none"
                  style={inputStyle}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ border: "1px solid var(--border-default)" }}
                  onClick={async () => {
                    const { open } = await import("@tauri-apps/plugin-dialog");
                    const selected = await open({ directory: true, multiple: false });
                    if (selected) setParentPath(selected as string);
                  }}
                >
                  <FolderOpen size={13} strokeWidth={1.5} />
                  选择
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
          >
            {saving ? "保存中…" : project ? "保存" : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
