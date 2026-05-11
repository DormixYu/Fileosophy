import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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

type ZoomLevel = "week" | "month" | "year";
const ZOOM_BASE: Record<ZoomLevel, number> = { week: 8, month: 3, year: 0.8 };
const ROW_HEIGHT = 38;
const NAME_WIDTH = 200;

export default function GanttPage() {
  const navigate = useNavigate();
  const { projects, fetchProjects, loading } = useProjectStore();
  const { settings } = useSettingsStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);

  const [dayWidth, setDayWidth] = useState(ZOOM_BASE.week);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [histories, setHistories] = useState<ProjectStatusHistory[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [tooltip, setTooltip] = useState<{
    project: Project;
    x: number;
    y: number;
  } | null>(null);
  const [milestoneProject, setMilestoneProject] = useState<Project | null>(null);

  // Ctrl+滚轮缩放
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setDayWidth((prev) => {
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        return Math.min(30, Math.max(0.3, prev * factor));
      });
    },
    [],
  );

  const refreshMilestones = useCallback(() => {
    projectApi.getAllMilestones().then(setMilestones);
  }, []);

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

  // 按项目分组的里程碑
  const milestonesByProject = useMemo(() => {
    const map = new Map<number, ProjectMilestone[]>();
    for (const m of milestones) {
      const list = map.get(m.project_id) || [];
      list.push(m);
      map.set(m.project_id, list);
    }
    return map;
  }, [milestones]);

  // 可用状态列表（用于筛选器）
  const availableStatuses = useMemo(() => {
    const seen = new Set<string>();
    for (const p of projects) {
      if (p.status) seen.add(p.status);
    }
    return [...seen];
  }, [projects]);

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
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        .toISOString()
        .split("T")[0];
      const end = new Date(now.getFullYear(), now.getMonth() + 3, 0)
        .toISOString()
        .split("T")[0];
      return { minDate: start, totalDays: daysBetween(start, end) + 1 };
    }
    let min = filteredProjects[0].start_date!;
    let max = min;
    for (const p of filteredProjects) {
      if (p.start_date && p.start_date < min) min = p.start_date;
      const end = p.end_date || p.start_date;
      if (end && end > max) max = end;
    }
    // 扩展范围
    min = addDays(min, -5);
    max = addDays(max, 10);
    return { minDate: min, totalDays: daysBetween(min, max) + 1 };
  }, [filteredProjects]);

  // 月份标签（周/月级别）
  const monthLabels = useMemo(() => {
    const labels: { label: string; startDay: number; span: number }[] = [];
    const start = new Date(minDate);
    const end = addDays(minDate, totalDays);
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= new Date(end)) {
      const monthStart = cursor.toISOString().split("T")[0];
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const monthEnd = nextMonth.toISOString().split("T")[0];
      const startDay = Math.max(0, daysBetween(minDate, monthStart));
      const endDay = Math.min(totalDays, daysBetween(minDate, monthEnd));
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      // 周级别显示"2026年5月"，月级别简化为"5月"
      const label = dayWidth >= 5 ? `${y}年${m}月` : `${m}月`;
      labels.push({ label, startDay, span: Math.max(1, endDay - startDay) });
      cursor = nextMonth;
    }
    return labels;
  }, [minDate, totalDays, dayWidth]);

  // 年+月标签（年级别：跨年时显示年份，否则只显示月份）
  const yearMonthLabels = useMemo(() => {
    const labels: { label: string; startDay: number; span: number }[] = [];
    const start = new Date(minDate);
    const end = addDays(minDate, totalDays);
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= new Date(end)) {
      const monthStart = cursor.toISOString().split("T")[0];
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const monthEnd = nextMonth.toISOString().split("T")[0];
      const startDay = Math.max(0, daysBetween(minDate, monthStart));
      const endDay = Math.min(totalDays, daysBetween(minDate, monthEnd));
      const m = cursor.getMonth() + 1;
      const isFirstOfYear = m === 1 || cursor.getTime() === start.getTime();
      labels.push({
        label: isFirstOfYear ? `${cursor.getFullYear()}年${m}月` : `${m}月`,
        startDay,
        span: Math.max(1, endDay - startDay),
      });
      cursor = nextMonth;
    }
    return labels;
  }, [minDate, totalDays]);

  const scrollToToday = () => {
    if (!containerRef.current) return;
    const today = new Date().toISOString().split("T")[0];
    const offset = daysBetween(minDate, today);
    if (offset >= 0 && offset < totalDays) {
      const scrollLeft = offset * dayWidth - 200;
      containerRef.current.scrollLeft = Math.max(0, scrollLeft);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("zh-CN");
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString("zh-CN");
    } catch {
      return dateStr;
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

        {/* 缩放 */}
        <div
          className="flex items-center rounded overflow-hidden"
          style={{ border: "1px solid var(--border-light)" }}
        >
          {(["week", "month", "year"] as ZoomLevel[]).map((level) => {
            const isActive = Math.abs(dayWidth - ZOOM_BASE[level]) < 0.05;
            return (
              <button
                key={level}
                className="text-[11px] px-2.5 py-1 transition-colors"
                style={{
                  background: isActive ? "var(--gold-glow)" : "transparent",
                  color: isActive ? "var(--gold)" : "var(--text-tertiary)",
                  borderRight:
                    level !== "year" ? "1px solid var(--border-light)" : "none",
                }}
                onClick={() => setDayWidth(ZOOM_BASE[level])}
              >
                {level === "week" ? "周" : level === "month" ? "月" : "年"}
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
          <div style={{ minWidth: chartWidth + NAME_WIDTH }}>
            {/* 月份/年份刻度 - 粘性 */}
            <div
              className="flex sticky top-0 z-20 border-b"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-light)",
              }}
            >
              <div
                className="shrink-0 sticky left-0 z-30 border-r"
                style={{
                  width: NAME_WIDTH,
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-light)",
                }}
              />
              {(dayWidth < 1.5
                ? yearMonthLabels.map((m, i) => (
                    <div
                      key={i}
                      className="shrink-0 text-center text-[10px] font-medium py-1 border-r"
                      style={{
                        width: m.span * dayWidth,
                        color: "var(--text-muted)",
                        borderColor: "var(--border-light)",
                      }}
                    >
                      {m.label}
                    </div>
                  ))
                : monthLabels.map((m, i) => (
                    <div
                      key={i}
                      className="shrink-0 text-center text-[10px] font-medium py-1 border-r"
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

            {/* 日期刻度 - 粘性（年级别不显示） */}
            {dayWidth >= 1.5 && (
              <div
                className="flex sticky top-6 z-20 border-b"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-light)",
                }}
              >
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
                  const isWeekend = dayWidth >= 5 && (date.getDay() === 0 || date.getDay() === 6);
                  const isToday =
                    date.toISOString().split("T")[0] ===
                    new Date().toISOString().split("T")[0];
                  // 月级别稀疏显示：仅1、8、15、22
                  const showDate = dayWidth >= 5 || d === 1 || d === 8 || d === 15 || d === 22;
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

            {/* 今日线（全局） */}
            <div
              ref={todayRef}
              className="absolute top-0 bottom-0 w-px z-10 pointer-events-none"
              style={{
                left:
                  NAME_WIDTH +
                  daysBetween(minDate, new Date().toISOString().split("T")[0]) * dayWidth +
                  dayWidth / 2,
                background: "var(--color-danger)",
                opacity: 0.4,
              }}
            />

            {/* 项目行 */}
            <div>
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
                  onNavigate={(id) => navigate(`/project/${id}`)}
                  onHover={(p, x, y) => setTooltip(p ? { project: p, x, y } : null)}
                  onManageMilestones={() => setMilestoneProject(project)}
                  formatDate={formatDate}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 工具提示浮窗 */}
      {tooltip && (
        <TooltipPopup
          project={tooltip.project}
          x={tooltip.x}
          y={tooltip.y}
          getStatusConfig={getStatusConfig}
          histories={histories.filter((h) => h.project_id === tooltip.project.id)}
          formatDate={formatDate}
          formatDateTime={formatDateTime}
          onClose={() => setTooltip(null)}
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
  onNavigate,
  onHover,
  onManageMilestones,
  formatDate,
}: {
  project: Project;
  minDate: string;
  totalDays: number;
  dayWidth: number;
  getStatusConfig: (id?: string) => ProjectStatusConfig | undefined;
  histories: ProjectStatusHistory[];
  milestones: ProjectMilestone[];
  onNavigate: (id: number) => void;
  onHover: (p: Project | null, x: number, y: number) => void;
  onManageMilestones: () => void;
  formatDate: (s: string) => string;
}) {
  const endDate = project.end_date || project.start_date;
  const duration = project.start_date && endDate
    ? Math.max(1, daysBetween(project.start_date, endDate) + 1)
    : 1;

  // 构建色段
  const segments = useMemo(() => {
    const config = getStatusConfig(project.status);
    const defaultColor = config?.color || "#94a3b8";

    if (!project.start_date) return [];

    if (histories.length === 0) {
      return [
        { color: defaultColor, left: 0, width: duration * dayWidth },
      ];
    }

    const sorted = [...histories].sort((a, b) =>
      a.changed_at.localeCompare(b.changed_at),
    );

    const segs: { color: string; left: number; width: number }[] = [];
    let cursor = project.start_date;

    for (let i = 0; i < sorted.length; i++) {
      const changeDate = sorted[i].changed_at.split(" ")[0]; // 取日期部分
      const changeDayOffset = daysBetween(project.start_date, changeDate);

      if (changeDayOffset > 0 && changeDayOffset < duration) {
        // 从 cursor 到 changeDate 使用前一个状态的颜色
        const prevStatus = i === 0 ? sorted[0].status : sorted[i - 1].status;
        const prevConfig = getStatusConfig(prevStatus);
        const segStart = daysBetween(project.start_date, cursor);
        const segWidth = daysBetween(cursor, changeDate) * dayWidth;
        if (segWidth > 0) {
          segs.push({
            color: prevConfig?.color || defaultColor,
            left: segStart * dayWidth,
            width: segWidth,
          });
        }
        cursor = changeDate;
      }
    }

    // 最后一段：从 cursor 到 endDate
    if (cursor < (endDate || project.start_date)) {
      const lastStatus = sorted[sorted.length - 1].status;
      const lastConfig = getStatusConfig(lastStatus);
      const finalStart = daysBetween(project.start_date, cursor);
      const finalEnd = daysBetween(cursor, endDate || project.start_date);
      const finalWidth = Math.max(1, finalEnd) * dayWidth;
      if (finalWidth > 0) {
        segs.push({
          color: lastConfig?.color || defaultColor,
          left: finalStart * dayWidth,
          width: finalWidth,
        });
      }
    }

    if (segs.length === 0) {
      return [{ color: defaultColor, left: 0, width: duration * dayWidth }];
    }

    return segs;
  }, [project, histories, dayWidth, duration, getStatusConfig, endDate]);

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
      {/* 冻结项目名称列 */}
      <div
        className="shrink-0 sticky left-0 z-10 flex items-center gap-1 px-3 border-r h-full cursor-pointer"
        style={{
          width: NAME_WIDTH,
          background: "var(--bg-surface)",
          borderColor: "var(--border-light)",
        }}
        onClick={() => onNavigate(project.id)}
        title={project.name}
      >
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
              top: 7,
              height: 24,
              background: seg.color,
              opacity: 0.85,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(project.id);
            }}
            onMouseEnter={(e) => {
              onHover(project, e.clientX, e.clientY);
            }}
            onMouseMove={(e) => {
              onHover(project, e.clientX, e.clientY);
            }}
            onMouseLeave={() => {
              onHover(null, 0, 0);
            }}
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
  x,
  y,
  getStatusConfig,
  histories,
  formatDate,
  formatDateTime,
  onClose,
}: {
  project: Project;
  x: number;
  y: number;
  getStatusConfig: (id?: string) => ProjectStatusConfig | undefined;
  histories: ProjectStatusHistory[];
  formatDate: (s: string) => string;
  formatDateTime: (s: string) => string;
  onClose: () => void;
}) {
  const config = getStatusConfig(project.status);
  const sortedHistories = [...histories].sort(
    (a, b) => b.changed_at.localeCompare(a.changed_at),
  );

  // 确保浮窗不超出视口
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x + 12, window.innerWidth - 260),
    top: Math.min(y - 10, window.innerHeight - 280),
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
        {/* 里程碑列表 */}
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

        {/* 新增/编辑表单 */}
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
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-2 py-1 text-xs rounded outline-none"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
            />
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

// ── 工具函数 ──────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / 86400000);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
