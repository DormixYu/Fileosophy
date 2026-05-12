import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Search, Diamond, Plus, Pencil, Trash2 } from "lucide-react";
import { useProjectStore } from "@/stores/useProjectStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { projectApi } from "@/lib/tauri-api";
import type {
  Project,
  ProjectStatusConfig,
  ProjectStatusHistory,
  ProjectMilestone,
} from "@/types";
import { DEFAULT_PROJECT_STATUSES } from "@/types";
import Modal from "@/components/common/Modal";
import {
  ViewMode,
  VIEW_BASE,
  VIEW_RANGE,
  VIEW_LABEL,
  getViewMode,
  ROW_HEIGHT,
  NAME_WIDTH,
  BAR_HEIGHT,
  BAR_TOP,
  daysBetween,
  addDays,
  formatDate,
  formatDateTime,
  getToday,
  formatLocalDate,
  buildSegments,
  buildPreviewSegments,
  INITIAL_STATUS,
} from "@/lib/ganttUtils";
import DatePicker from "@/components/common/DatePicker";

export default function GanttPage() {
  const { projects, fetchProjects, loading } = useProjectStore();
  const { settings } = useSettingsStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const [dayWidth, setDayWidth] = useState(VIEW_BASE.day);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [histories, setHistories] = useState<ProjectStatusHistory[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [hoveredProject, setHoveredProject] = useState<Project | null>(null);
  const [milestoneProject, setMilestoneProject] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const currentViewMode = getViewMode(dayWidth);

  // Ctrl+滚轮缩放
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setDayWidth((prev) => {
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        return Math.min(VIEW_RANGE.day[1], Math.max(VIEW_RANGE.year[0], prev * factor));
      });
    },
    [],
  );

  const refreshMilestones = useCallback(() => {
    projectApi.getAllMilestones().then(setMilestones);
  }, []);

  const refreshHistories = useCallback(() => {
    projectApi.getAllStatusHistories().then(setHistories);
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    fetchProjects();
    Promise.all([
      projectApi.getAllStatusHistories(),
      projectApi.getAllMilestones(),
    ]).then(([h, m]) => {
      setHistories(h);
      setMilestones(m);
    });
  }, [fetchProjects]);

  const statuses: ProjectStatusConfig[] = useMemo(() => {
    try {
      const raw = settings["project_statuses"];
      return raw ? JSON.parse(raw) : DEFAULT_PROJECT_STATUSES;
    } catch {
      return DEFAULT_PROJECT_STATUSES;
    }
  }, [settings]);

  const getStatusConfig = useCallback(
    (statusId?: string) => statuses.find((s) => s.id === statusId),
    [statuses],
  );

  const milestonesByProject = useMemo(() => {
    const map = new Map<number, ProjectMilestone[]>();
    for (const m of milestones) {
      const list = map.get(m.project_id) || [];
      list.push(m);
      map.set(m.project_id, list);
    }
    return map;
  }, [milestones]);

  // 从完整配置提取可用状态（而非仅从 projects 中已有的）
  const availableStatuses = useMemo(() => statuses.map((s) => s.id), [statuses]);

  // 可用分类列表
  const availableTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const p of projects) {
      if (p.project_type) seen.add(p.project_type);
    }
    return [...seen];
  }, [projects]);

  // 筛选后的项目
  const filteredProjects = useMemo(() => {
    let result = projects.filter((p) => p.start_date);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.project_number || "").toLowerCase().includes(q),
      );
    }
    if (statusFilter.size > 0) {
      result = result.filter((p) => statusFilter.has(p.status || ""));
    }
    if (typeFilter.size > 0) {
      result = result.filter((p) => typeFilter.has(p.project_type || ""));
    }
    result.sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
    return result;
  }, [projects, searchQuery, statusFilter, typeFilter]);

  // 计算时间范围
  const { minDate, totalDays } = useMemo(() => {
    if (filteredProjects.length === 0) {
      const now = new Date();
      const start = formatLocalDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const end = formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 3, 0));
      return { minDate: start, totalDays: daysBetween(start, end) + 1 };
    }
    const today = getToday();
    let min = filteredProjects[0].start_date!;
    let max = min;
    for (const p of filteredProjects) {
      if (p.start_date && p.start_date < min) min = p.start_date;
      const isCompleted = p.status === "completed" || p.status === "cancelled";
      const end = isCompleted ? (p.end_date || p.start_date) : (p.end_date || today);
      if (end && end > max) max = end;
    }
    min = addDays(min, -5);
    max = addDays(max, 10);
    return { minDate: min, totalDays: daysBetween(min, max) + 1 };
  }, [filteredProjects]);

  // 月份标签（日/月视图）
  const monthLabels = useMemo(() => {
    const labels: { label: string; startDay: number; span: number }[] = [];
    const start = new Date(minDate);
    const end = addDays(minDate, totalDays);
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= new Date(end)) {
      const monthStart = formatLocalDate(cursor);
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const monthEnd = formatLocalDate(nextMonth);
      const startDay = Math.max(0, daysBetween(minDate, monthStart));
      const endDay = Math.min(totalDays, daysBetween(minDate, monthEnd));
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      // 日视图显示完整年月，月视图简化
      const label = dayWidth >= VIEW_RANGE.day[0] ? `${y}年${m}月` : `${m}月`;
      labels.push({ label, startDay, span: Math.max(1, endDay - startDay) });
      cursor = nextMonth;
    }
    return labels;
  }, [minDate, totalDays, dayWidth]);

  // 年视图月份标签（窄格用数字，宽格用月名）
  const yearMonthLabels = useMemo(() => {
    const labels: { label: string; startDay: number; span: number }[] = [];
    const start = new Date(minDate);
    const end = addDays(minDate, totalDays);
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= new Date(end)) {
      const monthStart = formatLocalDate(cursor);
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const monthEnd = formatLocalDate(nextMonth);
      const startDay = Math.max(0, daysBetween(minDate, monthStart));
      const endDay = Math.min(totalDays, daysBetween(minDate, monthEnd));
      const m = cursor.getMonth() + 1;
      const y = cursor.getFullYear();
      const spanWidth = (endDay - startDay) * dayWidth;
      // 年视图根据格宽自动选择标签长度
      const label = spanWidth > 50 ? `${y}/${m}` : spanWidth > 20 ? `${m}月` : `${m}`;
      labels.push({
        label,
        startDay,
        span: Math.max(1, endDay - startDay),
      });
      cursor = nextMonth;
    }
    return labels;
  }, [minDate, totalDays]);

  const scrollToToday = () => {
    if (!containerRef.current) return;
    const today = getToday();
    const offset = daysBetween(minDate, today);
    if (offset >= 0 && offset < totalDays) {
      const scrollLeft = offset * dayWidth - 200;
      containerRef.current.scrollLeft = Math.max(0, scrollLeft);
    }
  };

  const toggleFilter = (
    set: Set<string>,
    setter: (s: Set<string>) => void,
    value: string,
  ) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  // 计算 hoveredProject 对应的行索引，用于 tooltip 定位
  const hoveredRowIndex = useMemo(() => {
    if (!hoveredProject) return -1;
    return filteredProjects.findIndex((p) => p.id === hoveredProject.id);
  }, [hoveredProject, filteredProjects]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-full text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        加载中…
      </div>
    );
  }

  const chartWidth = totalDays * dayWidth;

  return (
    <div className="flex flex-col h-full animate-slide-up">
      {/* 页头 + 工具栏 */}
      <div
        className="flex items-center gap-3 px-6 h-14 shrink-0 border-b"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-light)",
        }}
      >
        <h1 className="text-title" style={{ color: "var(--text-primary)" }}>
          甘特图
        </h1>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {filteredProjects.length} 个项目
        </span>

        <div className="flex-1" />

        {/* 搜索 */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs"
          style={{
            background: "var(--bg-surface-alt)",
            border: "1px solid var(--border-light)",
          }}
        >
          <Search size={12} strokeWidth={1.5} style={{ color: "var(--text-tertiary)" }} />
          <input
            type="text"
            placeholder="搜索项目…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent outline-none w-32"
            style={{ color: "var(--text-primary)" }}
          />
        </div>

        {/* 状态筛选 */}
        <div className="relative">
          <button
            className="text-xs px-2 py-1 rounded"
            style={{
              background: statusFilter.size > 0 ? "var(--gold-glow)" : "var(--bg-surface-alt)",
              border: "1px solid var(--border-light)",
              color: "var(--text-secondary)",
            }}
            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
          >
            状态{statusFilter.size > 0 ? ` (${statusFilter.size})` : ""}
          </button>
          {showStatusDropdown && (
            <Dropdown
              items={availableStatuses}
              selected={statusFilter}
              getLabel={(id) => getStatusConfig(id)?.name || id}
              getColor={(id) => getStatusConfig(id)?.color}
              onToggle={(v) => toggleFilter(statusFilter, setStatusFilter, v)}
              onClose={() => setShowStatusDropdown(false)}
            />
          )}
        </div>

        {/* 分类筛选 */}
        <div className="relative">
          <button
            className="text-xs px-2 py-1 rounded"
            style={{
              background: typeFilter.size > 0 ? "var(--gold-glow)" : "var(--bg-surface-alt)",
              border: "1px solid var(--border-light)",
              color: "var(--text-secondary)",
            }}
            onClick={() => setShowTypeDropdown(!showTypeDropdown)}
          >
            分类{typeFilter.size > 0 ? ` (${typeFilter.size})` : ""}
          </button>
          {showTypeDropdown && (
            <Dropdown
              items={availableTypes}
              selected={typeFilter}
              getLabel={(v) => v}
              onToggle={(v) => toggleFilter(typeFilter, setTypeFilter, v)}
              onClose={() => setShowTypeDropdown(false)}
            />
          )}
        </div>

        {/* 分割线 */}
        <div className="w-px h-5" style={{ background: "var(--border-light)" }} />

        {/* 视图模式：日/月/年 */}
        <div
          className="flex items-center rounded overflow-hidden"
          style={{ border: "1px solid var(--border-light)" }}
        >
          {(["day", "month", "year"] as ViewMode[]).map((level, idx) => {
            const isActive = currentViewMode === level;
            return (
              <button
                key={level}
                className="text-[11px] px-2.5 py-1 transition-colors"
                style={{
                  background: isActive ? "var(--gold-glow)" : "transparent",
                  color: isActive ? "var(--gold)" : "var(--text-tertiary)",
                  borderRight: idx < 2 ? "1px solid var(--border-light)" : "none",
                }}
                onClick={() => setDayWidth(VIEW_BASE[level])}
              >
                {VIEW_LABEL[level]}
              </button>
            );
          })}
        </div>

        {/* 回到今天 */}
        <button
          className="text-xs px-2 py-1 rounded transition-colors"
          style={{
            background: "var(--bg-surface-alt)",
            border: "1px solid var(--border-light)",
            color: "var(--text-secondary)",
          }}
          onClick={scrollToToday}
        >
          今天
        </button>
      </div>

      {/* 图表区 */}
      <div ref={containerRef} className="flex-1 overflow-auto" onWheel={handleWheel}>
        {filteredProjects.length === 0 ? (
          <div
            className="flex items-center justify-center h-full text-sm"
            style={{ color: "var(--text-tertiary)" }}
          >
            暂无匹配的项目
          </div>
        ) : (
          <div style={{ minWidth: chartWidth + NAME_WIDTH, position: "relative" }}>
            {/* Sticky header 合并容器 */}
            <div
              className="sticky top-0 z-20"
              style={{ background: "var(--bg-surface)" }}
            >
              {/* 月份行 */}
              <div className="flex border-b" style={{ borderColor: "var(--border-light)" }}>
                <div
                  className="shrink-0 sticky left-0 z-30 border-r"
                  style={{
                    width: NAME_WIDTH,
                    background: "var(--bg-surface)",
                    borderColor: "var(--border-light)",
                  }}
                />
                {(currentViewMode === "year"
                  ? yearMonthLabels.map((m, i) => (
                      <div
                        key={i}
                        className="shrink-0 text-center font-medium py-1 border-r whitespace-nowrap overflow-hidden"
                        style={{
                          width: m.span * dayWidth,
                          color: "var(--text-muted)",
                          borderColor: "var(--border-light)",
                          fontSize: dayWidth < 2 ? 7 : 8,
                        }}
                      >
                        {m.label}
                      </div>
                    ))
                  : monthLabels.map((m, i) => (
                      <div
                        key={i}
                        className="shrink-0 text-center text-[10px] font-medium py-1 border-r whitespace-nowrap overflow-hidden"
                        style={{
                          width: m.span * dayWidth,
                          color: "var(--text-muted)",
                          borderColor: "var(--border-light)",
                        }}
                      >
                        {m.label}
                      </div>
                    ))
                )}
              </div>

              {/* 日期行（日/月视图才显示，年视图隐藏） */}
              {currentViewMode !== "year" && (
                <div className="flex border-b" style={{ borderColor: "var(--border-light)" }}>
                  <div
                    className="shrink-0 sticky left-0 z-30 border-r"
                    style={{
                      width: NAME_WIDTH,
                      background: "var(--bg-surface)",
                      borderColor: "var(--border-light)",
                    }}
                  />
                  {Array.from({ length: totalDays }, (_, i) => {
                    const date = new Date(minDate);
                    date.setDate(date.getDate() + i);
                    const d = date.getDate();
                    const isWeekend = currentViewMode === "day" && (date.getDay() === 0 || date.getDay() === 6);
                    const todayStr = getToday();
                    const dateStr = formatLocalDate(date);
                    const isToday = dateStr === todayStr;
                    const showDate = currentViewMode === "day" || d === 1 || d === 8 || d === 15 || d === 22;
                    return (
                      <div
                        key={i}
                        className="shrink-0 text-center text-[9px] py-0.5 border-r"
                        style={{
                          width: dayWidth,
                          fontWeight: d === 1 ? 600 : 400,
                          color: isToday
                            ? "#fff"
                            : isWeekend
                              ? "var(--color-danger)"
                              : "var(--text-muted)",
                          background: isToday
                            ? "var(--gold)"
                            : isWeekend
                              ? "var(--gold-glow)"
                              : "transparent",
                          borderColor: "var(--border-light)",
                        }}
                      >
                        {showDate ? d : ""}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 项目行区域（含今日线） */}
            <div style={{ position: "relative" }}>
              {/* 今日线 */}
              <div
                className="absolute top-0 bottom-0 w-0.5 z-10 pointer-events-none"
                style={{
                  left: daysBetween(minDate, getToday()) * dayWidth,
                  background: "var(--color-danger)",
                  opacity: 0.6,
                }}
              />

              {filteredProjects.map((project) => (
                <GanttRow
                  key={project.id}
                  project={project}
                  minDate={minDate}
                  totalDays={totalDays}
                  dayWidth={dayWidth}
                  getStatusConfig={getStatusConfig}
                  histories={histories.filter((h) => h.project_id === project.id)}
                  milestones={milestonesByProject.get(project.id) || []}
                  onEditStatusHistory={() => setEditingProject(project)}
                  onHover={(p) => setHoveredProject(p)}
                  onManageMilestones={() => setMilestoneProject(project)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 工具提示浮窗 */}
      {hoveredProject && (
        <TooltipPopup
          project={hoveredProject}
          rowIndex={hoveredRowIndex}
          containerRef={containerRef}
          minDate={minDate}
          dayWidth={dayWidth}
          getStatusConfig={getStatusConfig}
          histories={histories.filter((h) => h.project_id === hoveredProject.id)}
          onClose={() => setHoveredProject(null)}
        />
      )}

      {/* 里程碑管理弹窗 */}
      {milestoneProject && (
        <MilestoneModal
          project={milestoneProject}
          milestones={milestonesByProject.get(milestoneProject.id) || []}
          onClose={() => setMilestoneProject(null)}
          onRefresh={refreshMilestones}
        />
      )}

      {/* 状态历史编辑弹窗 */}
      {editingProject && (
        <StatusHistoryModal
          project={editingProject}
          histories={histories.filter((h) => h.project_id === editingProject.id)}
          statuses={statuses}
          onClose={() => setEditingProject(null)}
          onRefresh={refreshHistories}
        />
      )}
    </div>
  );
}

// ── GanttRow ──────────────────────────────────────────────────────

function GanttRow({
  project,
  minDate,
  totalDays,
  dayWidth,
  getStatusConfig,
  histories,
  milestones,
  onEditStatusHistory,
  onHover,
  onManageMilestones,
}: {
  project: Project;
  minDate: string;
  totalDays: number;
  dayWidth: number;
  getStatusConfig: (id?: string) => ProjectStatusConfig | undefined;
  histories: ProjectStatusHistory[];
  milestones: ProjectMilestone[];
  onEditStatusHistory: () => void;
  onHover: (p: Project | null) => void;
  onManageMilestones: () => void;
}) {
  const statusConfig = getStatusConfig(project.status);
  const statusColor = statusConfig?.color || "#94a3b8";

  // 使用 ganttUtils 的 buildSegments 替代有 bug 的内联版本
  const segments = useMemo(
    () => buildSegments(project, histories, dayWidth, getStatusConfig),
    [project, histories, dayWidth, getStatusConfig],
  );

  return (
    <div
      className="flex items-center group"
      style={{ height: ROW_HEIGHT }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {/* 冻结项目名称列 + 状态色点 */}
      <div
        className="shrink-0 sticky left-0 z-10 flex items-center gap-1.5 px-3 border-r h-full cursor-pointer"
        style={{
          width: NAME_WIDTH,
          background: "var(--bg-surface)",
          borderColor: "var(--border-light)",
        }}
        onClick={onEditStatusHistory}
        title={project.name}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: statusColor }}
        />
        <span
          className="text-xs truncate flex-1"
          style={{ color: "var(--text-primary)" }}
        >
          {project.name}
        </span>
        <button
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity"
          style={{ color: "var(--text-tertiary)" }}
          onClick={(e) => {
            e.stopPropagation();
            onManageMilestones();
          }}
          title="管理里程碑"
        >
          <Diamond size={12} strokeWidth={1.5} />
        </button>
      </div>

      {/* 甘特条区域 */}
      <div className="relative flex-1" style={{ height: ROW_HEIGHT }}>
        {/* 背景网格 */}
        <div className="absolute inset-0 flex pointer-events-none">
          {Array.from({ length: totalDays }, (_, i) => (
            <div
              key={i}
              className="shrink-0 border-r"
              style={{
                width: dayWidth,
                borderColor: "var(--border-light)",
                opacity: i % 7 === 0 ? 0.5 : 0.2,
              }}
            />
          ))}
        </div>

        {/* 甘特条色段 */}
        {segments.map((seg, i) => (
          <div
            key={i}
            className="absolute rounded-sm cursor-pointer transition-opacity hover:opacity-80"
            style={{
              left: seg.left,
              width: Math.max(seg.width, 2),
              top: BAR_TOP,
              height: BAR_HEIGHT,
              background: seg.color,
              opacity: 0.85,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onEditStatusHistory();
            }}
            onMouseEnter={() => onHover(project)}
            onMouseLeave={() => onHover(null)}
          />
        ))}

        {/* 里程碑菱形 */}
        {milestones.map((ms) => {
          const msOffset = daysBetween(minDate, ms.date);
          if (msOffset < 0 || msOffset >= totalDays) return null;
          return (
            <div
              key={ms.id}
              className="absolute"
              style={{
                left: msOffset * dayWidth + dayWidth / 2 - 5,
                top: 12,
              }}
              title={`${ms.name}\n${formatDate(ms.date)}${ms.description ? `\n${ms.description}` : ""}`}
            >
              <div
                className="w-2.5 h-2.5 rotate-45"
                style={{ background: "var(--gold)" }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── TooltipPopup ──────────────────────────────────────────────────

function TooltipPopup({
  project,
  rowIndex,
  containerRef,
  minDate,
  dayWidth,
  getStatusConfig,
  histories,
  onClose,
}: {
  project: Project;
  rowIndex: number;
  containerRef: React.RefObject<HTMLDivElement>;
  minDate: string;
  dayWidth: number;
  getStatusConfig: (id?: string) => ProjectStatusConfig | undefined;
  histories: ProjectStatusHistory[];
  onClose: () => void;
}) {
  const config = getStatusConfig(project.status);
  const sortedHistories = [...histories].sort(
    (a, b) => b.changed_at.localeCompare(a.changed_at),
  );

  // 根据项目行和甘特条位置计算 tooltip 定位
  const barStartOffset = project.start_date
    ? daysBetween(minDate, project.start_date) * dayWidth + NAME_WIDTH
    : 0;
  const barCenterX = barStartOffset + 120; // 偏移条中心
  const barTopY = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

  const containerEl = containerRef.current;
  const scrollLeft = containerEl?.scrollLeft || 0;
  const scrollTop = containerEl?.scrollTop || 0;

  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(barCenterX - scrollLeft + 60, window.innerWidth - 260),
    top: Math.max(8, (barTopY - scrollTop + (containerEl?.getBoundingClientRect().top ?? 0)) - 140),
    zIndex: 100,
    width: 240,
  };

  return (
    <div
      className="rounded-lg p-3 shadow-lg text-xs"
      style={{
        ...style,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-light)",
      }}
      onMouseLeave={onClose}
    >
      <div className="font-medium text-sm mb-2" style={{ color: "var(--text-primary)" }}>
        {project.name}
      </div>

      <div className="space-y-1">
        <Row label="编号" value={project.project_number || "—"} />
        <Row
          label="状态"
          value={
            <span
              className="inline-flex items-center gap-1"
              style={{ color: config?.color }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ background: config?.color }}
              />
              {config?.name || project.status || "—"}
            </span>
          }
        />
        <Row label="分类" value={project.project_type || "—"} />
        <Row label="开始日期" value={formatDate(project.start_date || "")} />
        <Row label="截止日期" value={formatDate(project.end_date || "")} />
      </div>

      {sortedHistories.length > 0 && (
        <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--border-light)" }}>
          <div className="text-[10px] mb-1" style={{ color: "var(--text-muted)" }}>
            状态变更历史
          </div>
          <div className="space-y-0.5">
            {sortedHistories.slice(0, 5).map((h) => {
              const sc = getStatusConfig(h.status);
              return (
                <div key={h.id} className="flex items-center gap-1.5 text-[10px]">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: sc?.color || "#94a3b8" }}
                  />
                  <span style={{ color: "var(--text-secondary)" }}>
                    {sc?.name || h.status}
                  </span>
                  <span style={{ color: "var(--text-tertiary)" }}>
                    {formatDateTime(h.changed_at)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-[10px]" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span style={{ color: "var(--text-secondary)" }}>{value}</span>
    </div>
  );
}

// ── Dropdown ──────────────────────────────────────────────────────

function Dropdown({
  items,
  selected,
  getLabel,
  getColor,
  onToggle,
  onClose,
}: {
  items: string[];
  selected: Set<string>;
  getLabel: (v: string) => string;
  getColor?: (v: string) => string | undefined;
  onToggle: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute right-0 top-full mt-1 z-50 rounded-lg p-2 shadow-lg min-w-[140px]"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-light)",
        }}
      >
        {items.map((item) => (
          <label
            key={item}
            className="flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer hover:bg-[var(--bg-surface-alt)]"
            style={{ color: "var(--text-secondary)" }}
          >
            <input
              type="checkbox"
              checked={selected.has(item)}
              onChange={() => onToggle(item)}
              className="w-3 h-3"
            />
            {getColor && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: getColor(item) }}
              />
            )}
            <span>{getLabel(item)}</span>
          </label>
        ))}
        {items.length === 0 && (
          <div className="text-[10px] px-2 py-1" style={{ color: "var(--text-tertiary)" }}>
            无可用选项
          </div>
        )}
      </div>
    </>
  );
}

// ── MilestoneModal ──────────────────────────────────────────────────

function MilestoneModal({
  project,
  milestones,
  onClose,
  onRefresh,
}: {
  project: Project;
  milestones: ProjectMilestone[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { addToast } = useNotificationStore();
  const [editing, setEditing] = useState<ProjectMilestone | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setDate("");
    setDescription("");
  };

  const startEdit = (ms: ProjectMilestone) => {
    setEditing(ms);
    setName(ms.name);
    setDate(ms.date);
    setDescription(ms.description || "");
  };

  const handleSave = async () => {
    if (!name.trim() || !date) return;
    setSaving(true);
    try {
      if (editing) {
        await projectApi.updateMilestone(editing.id, {
          name: name.trim(),
          date,
          description: description || undefined,
        });
      } else {
        await projectApi.addMilestone({
          project_id: project.id,
          name: name.trim(),
          date,
          description: description || undefined,
        });
      }
      onRefresh();
      resetForm();
      addToast({ type: "success", title: editing ? "里程碑已更新" : "里程碑已添加", message: name.trim() });
    } catch (e) {
      addToast({ type: "error", title: "操作失败", message: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await projectApi.deleteMilestone(id);
      onRefresh();
      addToast({ type: "success", title: "里程碑已删除", message: "" });
    } catch (e) {
      addToast({ type: "error", title: "删除失败", message: String(e) });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${project.name} — 里程碑管理`}
      footer={
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          关闭
        </button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1 max-h-48 overflow-auto">
          {milestones.length === 0 ? (
            <p className="text-xs py-2" style={{ color: "var(--text-tertiary)" }}>
              暂无里程碑
            </p>
          ) : (
            milestones.map((ms) => (
              <div
                key={ms.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs"
                style={{ color: "var(--text-primary)" }}
              >
                <Diamond size={10} strokeWidth={1.5} style={{ color: "var(--gold)", flexShrink: 0 }} />
                <span className="flex-1 truncate">{ms.name}</span>
                <span style={{ color: "var(--text-tertiary)" }}>{ms.date}</span>
                <button
                  className="p-0.5 rounded transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                  onClick={() => startEdit(ms)}
                >
                  <Pencil size={11} strokeWidth={1.5} />
                </button>
                <button
                  className="p-0.5 rounded transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-danger)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                  onClick={() => handleDelete(ms.id)}
                >
                  <Trash2 size={11} strokeWidth={1.5} />
                </button>
              </div>
            ))
          )}
        </div>

        <div
          className="rounded-md p-3 space-y-2"
          style={{ background: "var(--bg-surface-alt)", border: "1px solid var(--border-light)" }}
        >
          <div className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
            {editing ? "编辑里程碑" : "新增里程碑"}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 px-2 py-1 text-xs rounded outline-none"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            />
            <DatePicker value={date} onChange={setDate} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
          </div>
          <input
            type="text"
            placeholder="描述（可选）"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-2 py-1 text-xs rounded outline-none"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          />
          <div className="flex gap-2 justify-end">
            {editing && (
              <button className="btn btn-ghost btn-sm" onClick={resetForm}>
                取消
              </button>
            )}
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving || !name.trim() || !date}
            >
              <Plus size={12} strokeWidth={1.5} />
              {saving ? "保存中..." : editing ? "更新" : "添加"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── StatusHistoryModal ──────────────────────────────────────────────

function StatusHistoryModal({
  project,
  histories,
  statuses,
  onClose,
  onRefresh,
}: {
  project: Project;
  histories: ProjectStatusHistory[];
  statuses: ProjectStatusConfig[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { addToast } = useNotificationStore();
  const [localItems, setLocalItems] = useState(() =>
    [...histories].sort((a, b) => a.changed_at.localeCompare(b.changed_at)),
  );
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const getStatusColor = (statusId: string) =>
    statuses.find((s) => s.id === statusId)?.color || "#94a3b8";

  const addItem = () => {
    const today = getToday();
    setLocalItems((prev) =>
      [
        ...prev,
        { id: -Date.now(), project_id: project.id, status: project.status || INITIAL_STATUS, changed_at: today },
      ].sort((a, b) => a.changed_at.localeCompare(b.changed_at)),
    );
  };

  const updateItem = (id: number, field: "status" | "changed_at", value: string) => {
    setLocalItems((prev) =>
      prev.map((item) => item.id === id ? { ...item, [field]: value } : item),
    );
  };

  const markDeleted = (id: number) => {
    if (id > 0) setDeletedIds((prev) => [...prev, id]);
    setLocalItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const id of deletedIds) {
        await projectApi.deleteStatusHistory(id);
      }
      for (const item of localItems) {
        if (item.id < 0) {
          await projectApi.addStatusHistory({
            project_id: project.id,
            status: item.status,
            changed_at: item.changed_at,
          });
        } else {
          await projectApi.updateStatusHistory(item.id, {
            status: item.status,
            changed_at: item.changed_at,
          });
        }
      }
      onRefresh();
      onClose();
      addToast({ type: "success", title: "状态历史已保存", message: project.name });
    } catch (e) {
      addToast({ type: "error", title: "保存失败", message: String(e) });
    } finally {
      setSaving(false);
    }
  };

  // 使用 ganttUtils 的 buildPreviewSegments 替代有 bug 的内联版本
  const previewSegments = useMemo(
    () => buildPreviewSegments(project, localItems, statuses),
    [project, localItems, statuses],
  );

  const currentConfig = statuses.find((s) => s.id === project.status);

  return (
    <Modal
      open
      onClose={onClose}
      title={`状态变更历史 — ${project.name}`}
      footer={
        <div className="flex gap-2 justify-end">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>当前状态</span>
          <span
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{
              background: getStatusColor(project.status || "") + "20",
              color: getStatusColor(project.status || ""),
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: getStatusColor(project.status || "") }}
            />
            {currentConfig?.name || project.status || "—"}
          </span>
        </div>

        <div className="space-y-1.5 max-h-64 overflow-auto">
          {localItems.length === 0 ? (
            <p className="text-xs py-2" style={{ color: "var(--text-tertiary)" }}>
              暂无状态变更记录
            </p>
          ) : (
            localItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <DatePicker value={item.changed_at.split(" ")[0]} onChange={(v) => updateItem(item.id, "changed_at", v)} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }} />
                <select
                  value={item.status}
                  onChange={(e) => updateItem(item.id, "status", e.target.value)}
                  className="px-2 py-1 text-xs rounded outline-none"
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                >
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getStatusColor(item.status) }} />
                <button
                  className="p-0.5 rounded transition-colors shrink-0"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-danger)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                  onClick={() => markDeleted(item.id)}
                >
                  <Trash2 size={11} strokeWidth={1.5} />
                </button>
              </div>
            ))
          )}
        </div>

        <button
          className="text-xs px-3 py-1.5 rounded transition-colors flex items-center gap-1"
          style={{ background: "var(--gold-glow)", color: "var(--gold)", border: "1px solid var(--border-light)" }}
          onClick={addItem}
        >
          <Plus size={11} strokeWidth={1.5} />
          添加状态变更
        </button>

        <div className="border-t pt-3" style={{ borderColor: "var(--border-light)" }}>
          <div className="text-[10px] mb-1.5" style={{ color: "var(--text-muted)" }}>色段预览</div>
          <div className="flex rounded-sm overflow-hidden" style={{ height: 16 }}>
            {previewSegments.map((seg, i) => (
              <div
                key={i}
                style={{ width: `${seg.width}%`, background: seg.color, minWidth: 2 }}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}