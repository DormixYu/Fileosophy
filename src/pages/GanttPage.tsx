import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Search, Diamond } from "lucide-react";
import { useProjectStore } from "@/stores/useProjectStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { projectApi } from "@/lib/tauri-api";
import type {
  Project,
  ProjectStatusConfig,
  ProjectStatusHistory,
  ProjectMilestone,
} from "@/types";
import { formatDate } from "@/lib/formatUtils";
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
  getToday,
  formatLocalDate,
  buildSegments,
} from "@/lib/ganttUtils";
import GanttTooltip from "@/components/gantt/GanttTooltip";
import MilestoneModal from "@/components/gantt/MilestoneModal";
import StatusHistoryModal from "@/components/gantt/StatusHistoryModal";

export default function GanttPage() {
  const { projects, fetchProjects, loading } = useProjectStore();
  const { parsedStatuses } = useSettingsStore();
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
    if (projects.length === 0) fetchProjects();
    Promise.all([
      projectApi.getAllStatusHistories(),
      projectApi.getAllMilestones(),
    ]).then(([h, m]) => {
      setHistories(h);
      setMilestones(m);
    });
  }, [projects.length, fetchProjects]);

  const getStatusConfig = useCallback(
    (statusId?: string | null) => parsedStatuses.find((s) => s.id === statusId),
    [parsedStatuses],
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
  const availableStatuses = useMemo(() => parsedStatuses.map((s) => s.id), [parsedStatuses]);

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
    <div className="flex flex-col h-full animate-fade-up">
      {/* 页头 + 工具栏 */}
      <div
        className="flex items-center gap-3 px-6 h-14 shrink-0 border-b"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-light)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <h1 className="text-title font-serif" style={{ color: "var(--text-primary)" }}>
            全局甘特图
          </h1>
          <span className="w-8 h-px" style={{ background: "var(--gold)" }} />
        </div>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {filteredProjects.length} 个项目
        </span>

        <div className="flex-1" />

        {/* 搜索 */}
        <div className="flex items-center gap-1.5 input-base !py-1 !px-2 !text-xs !rounded-md">
          <Search size={12} strokeWidth={1.5} style={{ color: "var(--text-muted)" }} />
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
            className="text-xs px-2.5 py-1 rounded-md transition-all hover-gold-border"
            style={{
              background: statusFilter.size > 0 ? "var(--gold-glow)" : "var(--bg-surface-alt)",
              border: "1px solid var(--border-light)",
              color: statusFilter.size > 0 ? "var(--gold)" : "var(--text-secondary)",
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
            className="text-xs px-2.5 py-1 rounded-md transition-all hover-gold-border"
            style={{
              background: typeFilter.size > 0 ? "var(--gold-glow)" : "var(--bg-surface-alt)",
              border: "1px solid var(--border-light)",
              color: typeFilter.size > 0 ? "var(--gold)" : "var(--text-secondary)",
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
          className="flex items-center gap-0.5 p-0.5 rounded-full"
          style={{ background: "var(--bg-surface-alt)" }}
        >
          {(["day", "month", "year"] as ViewMode[]).map((level) => {
            const isActive = currentViewMode === level;
            return (
              <button
                key={level}
                className={`text-[11px] px-3 py-1 rounded-full transition-all ${isActive ? "" : "hover-gold-text"}`}
                style={{
                  background: isActive ? "var(--gold-glow-strong)" : "transparent",
                  color: isActive ? "var(--gold)" : "var(--text-muted)",
                  boxShadow: isActive ? "var(--shadow-gold)" : "none",
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
          className="btn btn-outline btn-sm hover-gold-text"
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
                        className="shrink-0 text-center font-serif font-medium py-1 border-r whitespace-nowrap overflow-hidden"
                        style={{
                          width: m.span * dayWidth,
                          color: "var(--text-secondary)",
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
                        className="shrink-0 text-center text-[10px] font-serif font-medium py-1 border-r whitespace-nowrap overflow-hidden"
                        style={{
                          width: m.span * dayWidth,
                          color: "var(--text-secondary)",
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
                        className="shrink-0 text-center text-[9px] font-mono py-0.5 border-r"
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
        <GanttTooltip
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
          statuses={parsedStatuses}
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
  getStatusConfig: (id?: string | null) => ProjectStatusConfig | undefined;
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
      className="flex items-center group transition-colors hover-elevated-bg"
      style={{ height: ROW_HEIGHT }}
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
                style={{ background: "var(--gold)", filter: "drop-shadow(0 0 4px var(--gold))" }}
              />
            </div>
          );
        })}
      </div>
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
        className="absolute right-0 top-full mt-1 z-50 rounded-lg p-2 min-w-[140px] animate-fade-in"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-gold-lg)",
        }}
      >
        {items.map((item) => (
          <label
            key={item}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors hover-gold-bg"
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
          <div className="text-[10px] px-2 py-1.5" style={{ color: "var(--text-muted)" }}>
            无可用选项
          </div>
        )}
      </div>
    </>
  );
}