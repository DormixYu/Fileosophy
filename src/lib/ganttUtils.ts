import type { Project, ProjectStatusConfig, ProjectStatusHistory } from "@/types";

// ── 视图模式 ──────────────────────────────────────────────────────

export type ViewMode = "day" | "month" | "year";

export const VIEW_BASE: Record<ViewMode, number> = {
  day: 45,
  month: 5,
  year: 1.5,
};

export const VIEW_RANGE: Record<ViewMode, [number, number]> = {
  day: [20, 60],
  month: [3, 15],
  year: [0.8, 3],
};

export const VIEW_LABEL: Record<ViewMode, string> = {
  day: "日",
  month: "月",
  year: "年",
};

export function getViewMode(dayWidth: number): ViewMode {
  if (dayWidth >= VIEW_RANGE.day[0]) return "day";
  if (dayWidth >= VIEW_RANGE.month[0]) return "month";
  return "year";
}

// ── 布局常量 ──────────────────────────────────────────────────────

export const ROW_HEIGHT = 38;
export const NAME_WIDTH = 200;
export const BAR_HEIGHT = 24;
export const BAR_TOP = 7; // (38 - 24) / 2

/** 项目创建时的默认初始状态（与 Rust 后端 create_project 一致） */
export const INITIAL_STATUS = "planning";

// ── 工具函数 ──────────────────────────────────────────────────────

export function daysBetween(a: string, b: string): number {
  const dateA = new Date(a);
  const dateB = new Date(b);
  const utcA = Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  const utcB = Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

/** 将 Date 对象格式化为本地 YYYY-MM-DD（避免 UTC 时区偏移） */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

export function toDatePart(dateStr: string): string {
  return dateStr.split(" ")[0];
}

export function getToday(): string {
  return formatLocalDate(new Date());
}

// ── 色段算法 ──────────────────────────────────────────────────────

export function buildSegments(
  project: Project,
  histories: ProjectStatusHistory[],
  dayWidth: number,
  getStatusConfig: (id?: string | null) => ProjectStatusConfig | undefined,
): { color: string; left: number; width: number }[] {
  const startDate = project.start_date;
  if (!startDate) return [];

  const today = getToday();
  const isCompleted = project.status === "completed" || project.status === "cancelled";
  const endDate = isCompleted ? (project.end_date || startDate) : (project.end_date || today);
  const duration = Math.max(1, daysBetween(startDate, endDate) + 1);
  const defaultColor = getStatusConfig(project.status)?.color || "#94a3b8";

  // 无历史记录 → 整条显示当前状态颜色
  if (histories.length === 0) {
    return [{ color: defaultColor, left: 0, width: duration * dayWidth }];
  }

  // 按日期排序，提取日期部分，过滤范围外记录
  const sorted = [...histories]
    .sort((a, b) => a.changed_at.localeCompare(b.changed_at))
    .map((h) => ({ date: toDatePart(h.changed_at), status: h.status }))
    .filter((entry) => entry.date >= startDate && entry.date <= endDate);

  // 同日合并：最后一条生效
  const merged: { date: string; status: string }[] = [];
  for (const entry of sorted) {
    if (merged.length > 0 && merged[merged.length - 1].date === entry.date) {
      merged[merged.length - 1].status = entry.status;
    } else {
      merged.push(entry);
    }
  }

  // 构建色段：初始段颜色用 INITIAL_STATUS ("planning")
  const segments: { color: string; left: number; width: number }[] = [];
  let cursor = startDate;
  let prevStatus = INITIAL_STATUS;

  for (const entry of merged) {
    if (entry.date > cursor) {
      const config = getStatusConfig(prevStatus);
      const leftPx = daysBetween(startDate, cursor) * dayWidth;
      const widthPx = daysBetween(cursor, entry.date) * dayWidth;
      if (widthPx > 0) {
        segments.push({ color: config?.color || defaultColor, left: leftPx, width: widthPx });
      }
    }
    prevStatus = entry.status;
    cursor = entry.date;
  }

  // 最后一段：从 cursor 到 endDate
  const lastConfig = getStatusConfig(prevStatus);
  const lastLeftPx = daysBetween(startDate, cursor) * dayWidth;
  const lastWidthPx = Math.max(1, daysBetween(cursor, endDate) + 1) * dayWidth;
  segments.push({ color: lastConfig?.color || defaultColor, left: lastLeftPx, width: lastWidthPx });

  // 兜底
  if (segments.length === 0) {
    return [{ color: defaultColor, left: 0, width: duration * dayWidth }];
  }

  return segments;
}

// ── 预览色段（百分比宽度，用于弹窗预览条） ──────────────────────────

export function buildPreviewSegments(
  project: Project,
  histories: ProjectStatusHistory[],
  statuses: ProjectStatusConfig[],
): { color: string; width: number }[] {
  const startDate = project.start_date || getToday();
  const today = getToday();
  const isCompleted = project.status === "completed" || project.status === "cancelled";
  const endDate = isCompleted ? (project.end_date || startDate) : (project.end_date || today);
  const total = Math.max(1, daysBetween(startDate, endDate) + 1);
  const getStatusColor = (id: string) => statuses.find((s) => s.id === id)?.color || "#94a3b8";

  if (histories.length === 0) {
    return [{ color: getStatusColor(project.status || INITIAL_STATUS), width: 100 }];
  }

  const sorted = [...histories]
    .sort((a, b) => a.changed_at.localeCompare(b.changed_at))
    .map((h) => ({ date: toDatePart(h.changed_at), status: h.status }))
    .filter((e) => e.date >= startDate && e.date <= endDate);

  // 同日合并
  const merged: { date: string; status: string }[] = [];
  for (const entry of sorted) {
    if (merged.length > 0 && merged[merged.length - 1].date === entry.date) {
      merged[merged.length - 1].status = entry.status;
    } else {
      merged.push(entry);
    }
  }

  const segs: { color: string; width: number }[] = [];
  let cursor = startDate;
  let prevStatus = INITIAL_STATUS;

  for (const entry of merged) {
    if (entry.date > cursor) {
      const days = daysBetween(cursor, entry.date);
      segs.push({ color: getStatusColor(prevStatus), width: (days / total) * 100 });
    }
    prevStatus = entry.status;
    cursor = entry.date;
  }

  const lastDays = Math.max(1, daysBetween(cursor, endDate) + 1);
  segs.push({ color: getStatusColor(prevStatus), width: (lastDays / total) * 100 });

  if (segs.length === 0) {
    return [{ color: getStatusColor(project.status || INITIAL_STATUS), width: 100 }];
  }

  return segs;
}