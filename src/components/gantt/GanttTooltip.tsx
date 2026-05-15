import { formatDate, formatDateTime } from "@/lib/formatUtils";
import { daysBetween, NAME_WIDTH, ROW_HEIGHT } from "@/lib/ganttUtils";
import type {
  Project,
  ProjectStatusConfig,
  ProjectStatusHistory,
} from "@/types";

interface TooltipPopupProps {
  project: Project;
  rowIndex: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  minDate: string;
  dayWidth: number;
  getStatusConfig: (id?: string | null) => ProjectStatusConfig | undefined;
  histories: ProjectStatusHistory[];
  onClose: () => void;
}

export default function TooltipPopup({
  project,
  rowIndex,
  containerRef,
  minDate,
  dayWidth,
  getStatusConfig,
  histories,
  onClose,
}: TooltipPopupProps) {
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
      className="rounded-lg p-3 text-xs animate-fade-in"
      style={{
        ...style,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        boxShadow: "var(--shadow-gold-lg)",
      }}
      onMouseLeave={onClose}
    >
      <div className="font-serif font-medium text-sm mb-2" style={{ color: "var(--text-primary)" }}>
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
        <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--border-default)" }}>
          <div className="text-[10px] mb-1" style={{ color: "var(--text-secondary)" }}>
            状态变更历史
          </div>
          <div className="space-y-0.5">
            {sortedHistories.slice(0, 5).map((h) => {
              const sc = getStatusConfig(h.status);
              return (
                <div key={h.id} className="flex items-center gap-1.5 text-[10px]">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: sc?.color || "var(--text-muted)" }}
                  />
                  <span style={{ color: "var(--text-secondary)" }}>
                    {sc?.name || h.status}
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>
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
      <span className="w-12 shrink-0 text-[10px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      <span style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}