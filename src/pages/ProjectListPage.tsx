import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Plus, Search, Link as LinkIcon, Trash2, X, Calendar } from "lucide-react";
import { useProjectStore } from "@/stores/useProjectStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { projectApi, shareApi } from "@/lib/tauri-api";
import Modal from "@/components/common/Modal";
import DatePicker from "@/components/common/DatePicker";
import ShareProjectDialog from "@/components/common/ShareProjectDialog";
import JoinShareDialog from "@/components/common/JoinShareDialog";
import ProjectDialog from "@/components/project/ProjectDialog";
import BatchStatusDropdown from "@/components/project/BatchStatusDropdown";
import ProjectTable, { type SortState } from "@/components/project/ProjectTable";
import type {
  Project,
  ProjectStatus,
} from "@/types";

interface SavedFilters {
  status: string;
  type: string;
  startDate: string;
  endDate: string;
}

const FILTERS_KEY = "project_filters";
const DEFAULT_FILTERS: SavedFilters = { status: "", type: "", startDate: "", endDate: "" };

export default function ProjectListPage() {
  const { projects, fetchProjects, createProject, updateProject, deleteProject, loading, consumeCreateProject, pendingCreateProject } =
    useProjectStore();
  const { parsedStatuses, parsedTypes, parsedColumns } = useSettingsStore();
  const { addToast } = useNotificationStore();

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<SavedFilters>(() => {
    try {
      const raw = useSettingsStore.getState().settings[FILTERS_KEY];
      if (raw) return JSON.parse(raw) as SavedFilters;
    } catch { /* ignore parse errors */ }
    return DEFAULT_FILTERS;
  });
  const [sort, setSort] = useState<SortState>({ key: "updated_at", dir: "desc" });
  const [showCreate, setShowCreate] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [shareProject, setShareProject] = useState<Project | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [shareStatus, setShareStatus] = useState<{ port: number; path: string }[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // 筛选变更时自动持久化
  const persistFilters = useCallback((f: SavedFilters) => {
    useSettingsStore.getState().saveSettings({
      [FILTERS_KEY]: JSON.stringify(f),
    }).catch((e) => console.error("Failed to persist filters:", e));
  }, []);

  const updateFilter = useCallback((key: keyof SavedFilters, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      persistFilters(next);
      return next;
    });
  }, [persistFilters]);

  const refreshShareStatus = useCallback(() => {
    shareApi.getStatus().then(setShareStatus).catch(() => setShareStatus([]));
  }, []);

  useEffect(() => {
    if (projects.length === 0) fetchProjects();
    refreshShareStatus();
  }, [projects.length, fetchProjects, refreshShareStatus]);

  // 检测快捷键触发的创建请求
  useEffect(() => {
    if (pendingCreateProject) {
      consumeCreateProject();
      setShowCreate(true);
    }
  }, [pendingCreateProject, consumeCreateProject]);

  // 检测快捷键触发的创建请求
  const visibleColumns = useMemo(
    () => parsedColumns.filter((c) => c.visible || c.fixed),
    [parsedColumns]
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
    if (filters.status) {
      result = result.filter((p) => p.status === filters.status);
    }

    // 分类筛选
    if (filters.type) {
      result = result.filter((p) => p.project_type === filters.type);
    }

    // 时间范围筛选
    if (filters.startDate) {
      result = result.filter((p) => {
        const d = p.start_date || p.created_at;
        return d && d.slice(0, 10) >= filters.startDate;
      });
    }
    if (filters.endDate) {
      result = result.filter((p) => {
        const d = p.end_date || p.updated_at;
        return d && d.slice(0, 10) <= filters.endDate;
      });
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
  }, [projects, search, filters, sort]);

  const handleSort = (key: string) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: "", dir: null };
    });
  };

  const handleColumnResizeLive = useCallback((colKey: string, newWidth: number) => {
    const updated = parsedColumns.map((c) =>
      c.key === colKey ? { ...c, width: Math.max(40, newWidth) } : c
    );
    useSettingsStore.setState({ parsedColumns: updated });
  }, [parsedColumns]);

  const handleColumnResizeEnd = useCallback(() => {
    const cols = useSettingsStore.getState().parsedColumns;
    useSettingsStore.getState().saveSettings({
      project_table_columns: JSON.stringify(cols),
    }).catch((e) => console.error("Failed to save column widths:", e));
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDeleteId(id);
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

  const handleBatchDelete = async () => {
    const ids = [...selectedIds];
    let successCount = 0;
    for (const id of ids) {
      try {
        await deleteProject(id);
        successCount++;
      } catch {
        // 单个失败不影响其他
      }
    }
    setSelectedIds(new Set());
    setConfirmBatchDelete(false);
    addToast({
      type: successCount === ids.length ? "success" : "warning",
      title: "批量删除",
      message: `已删除 ${successCount}/${ids.length} 个项目`,
    });
  };

  // indeterminate 状态同步
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedIds.size > 0 && selectedIds.size < filtered.length;
    }
  }, [selectedIds.size, filtered.length]);

  return (
    <div className="h-full flex flex-col p-6 animate-fade-up">
      {/* 页头 */}
      <div className="flex items-start justify-between mb-5 shrink-0">
        <div>
          <h1 className="text-2xl" style={{ color: "var(--text-primary)" }}>
            项目
          </h1>
          <div className="mt-1.5 h-[1px] w-8" style={{ background: "var(--gold)", opacity: 0.6 }} />
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-outline"
            onClick={() => setShowJoinDialog(true)}
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
            style={{ color: "var(--gold)" }}
          />
          <input
            type="text"
            placeholder="搜索编号、名称…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base w-full pl-9 text-right"
          />
        </div>

        {/* 状态筛选 */}
        <select
          value={filters.status}
          onChange={(e) => updateFilter("status", e.target.value)}
          className="input-base text-[11px] py-1 pl-2 pr-6"
          style={{ background: "var(--bg-surface-alt)", minWidth: 70 }}
        >
          <option value="">全状态</option>
          {parsedStatuses.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* 分类筛选 */}
        <select
          value={filters.type}
          onChange={(e) => updateFilter("type", e.target.value)}
          className="input-base text-[11px] py-1 pl-2 pr-6"
          style={{ background: "var(--bg-surface-alt)", minWidth: 70 }}
        >
          <option value="">全分类</option>
          {parsedTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        {/* 时间范围 */}
        <div className="flex items-center gap-1.5">
          <Calendar size={13} strokeWidth={1.5} style={{ color: "var(--text-muted)" }} />
          <DatePicker
            value={filters.startDate}
            onChange={(v) => updateFilter("startDate", v)}
            placeholder="起始日期"
            style={{ background: "var(--bg-surface-alt)", fontSize: "11px", minWidth: 100 }}
          />
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>—</span>
          <DatePicker
            value={filters.endDate}
            onChange={(v) => updateFilter("endDate", v)}
            placeholder="截止日期"
            style={{ background: "var(--bg-surface-alt)", fontSize: "11px", minWidth: 100 }}
          />
          {(filters.startDate || filters.endDate) && (
            <button
              className="p-0.5 rounded hover-gold-bg"
              style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
              onClick={() => { updateFilter("startDate", ""); updateFilter("endDate", ""); }}
              title="清除日期"
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* 有筛选条件时显示清除按钮 */}
        {(filters.status || filters.type || filters.startDate || filters.endDate) && (
          <button
            className="text-[10px] underline cursor-pointer transition-colors hover-gold-text"
            style={{ color: "var(--text-muted)", background: "none", border: "none" }}
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              persistFilters(DEFAULT_FILTERS);
            }}
          >
            清除筛选
          </button>
        )}

        <span className="text-[11px] ml-auto" style={{ color: "var(--text-muted)" }}>
          {filtered.length} 个项目
        </span>
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-auto rounded-lg" style={{ border: "1px solid var(--border-default)" }}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--text-muted)" }}>
            加载中…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--text-tertiary)" }}>
            {search || filters.status || filters.type || filters.startDate || filters.endDate ? "没有匹配的项目" : "还没有项目"}
          </div>
        ) : (
          <ProjectTable
            filtered={filtered}
            visibleColumns={visibleColumns}
            sort={sort}
            selectedIds={selectedIds}
            selectAllRef={selectAllRef}
            handleSort={handleSort}
            handleSelectAll={handleSelectAll}
            handleToggleSelect={handleToggleSelect}
            handleStatusChange={handleStatusChange}
            handleDoubleClick={handleDoubleClick}
            setShareProject={setShareProject}
            setEditProject={setEditProject}
            handleDelete={handleDelete}
            statuses={parsedStatuses}
            types={parsedTypes}
            shareStatus={shareStatus}
            onColumnResizeLive={handleColumnResizeLive}
            onColumnResizeEnd={handleColumnResizeEnd}
          />
        )}
      </div>

      {/* 新建项目弹窗 */}
      {showCreate && (
        <ProjectDialog
          title="新建项目"
          types={parsedTypes}
          statuses={parsedStatuses}
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
          types={parsedTypes}
          statuses={parsedStatuses}
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
          initialSharing={shareStatus.some(s => s.path === shareProject.folder_path)}
          initialPort={shareStatus.find(s => s.path === shareProject.folder_path)?.port ?? 0}
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

      {/* 底部批量操作浮窗 */}
      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-xl animate-slide-up"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--gold)",
            boxShadow: "var(--shadow-gold-lg)",
          }}
        >
          <span className="text-xs font-mono" style={{ color: "var(--gold)" }}>
            已选 {selectedIds.size} 项
          </span>
          <button
            className="p-1 rounded transition-colors hover-gold-bg"
            style={{ color: "var(--text-muted)", background: "none", border: "none" }}
            onClick={() => setSelectedIds(new Set())}
            title="取消选择"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
          <div
            className="w-px h-5 mx-1"
            style={{ background: "var(--border-default)" }}
          />
          <BatchStatusDropdown
            statuses={parsedStatuses}
            onApply={handleBatchStatusChange}
          />
          <button
            className="btn btn-ghost btn-sm hover-danger-text"
            style={{ color: "var(--text-muted)" }}
            onClick={() => setConfirmBatchDelete(true)}
          >
            <Trash2 size={12} strokeWidth={1.5} />
            批量删除
          </button>
        </div>
      )}

      {/* 批量删除确认弹窗 */}
      {confirmBatchDelete && (
        <Modal
          open={true}
          onClose={() => setConfirmBatchDelete(false)}
          title="批量删除确认"
          footer={
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmBatchDelete(false)}>取消</button>
              <button className="btn btn-danger btn-sm" onClick={handleBatchDelete}>
                删除 {selectedIds.size} 个项目
              </button>
            </>
          }
        >
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            确定删除选中的 {selectedIds.size} 个项目？所有数据将被清除，此操作不可撤销。
          </p>
        </Modal>
      )}

      {/* 删除确认弹窗 */}
      {confirmDeleteId !== null && (
        <Modal
          open={true}
          onClose={() => setConfirmDeleteId(null)}
          title="确认删除"
          footer={
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteId(null)}>取消</button>
              <button className="btn btn-danger btn-sm" onClick={async () => {
                await deleteProject(confirmDeleteId);
                setConfirmDeleteId(null);
              }}>删除</button>
            </>
          }
        >
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            确定删除该项目？所有数据将被清除。
          </p>
        </Modal>
      )}
    </div>
  );
}