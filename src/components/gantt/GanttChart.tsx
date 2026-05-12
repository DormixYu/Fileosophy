import { useEffect, useState, useMemo, useRef } from "react";
import { Plus, Trash2, Crosshair } from "lucide-react";
import { useGanttStore } from "@/stores/useGanttStore";
import { useKanbanStore } from "@/stores/useKanbanStore";
import { kanbanApi } from "@/lib/tauri-api";
import type { GanttTask } from "@/types";
import Modal from "@/components/common/Modal";
import Spinner from "@/components/common/Spinner";
import EmptyState from "@/components/common/EmptyState";
import { ROW_HEIGHT, NAME_WIDTH, BAR_HEIGHT, BAR_TOP, daysBetween, addDays, getToday, formatLocalDate } from "@/lib/ganttUtils";
import DatePicker from "@/components/common/DatePicker";

interface Props {
  projectId: number;
}

const DAY_WIDTH = 28;
const BAR_CENTER_Y = BAR_TOP + BAR_HEIGHT / 2;

export default function GanttChart({ projectId }: Props) {
  const { tasks, fetchTasks, addTask, updateTask, deleteTask, loading } =
    useGanttStore();
  const { fetchBoard } = useKanbanStore();
  const containerRef = useRef<HTMLDivElement>(null);

  // 添加任务
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addStartDate, setAddStartDate] = useState(
    getToday(),
  );
  const [addDuration, setAddDuration] = useState(3);
  const [addDeps, setAddDeps] = useState<number[]>([]);
  const [syncToKanban, setSyncToKanban] = useState(false);

  // 编辑任务
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
  const [editName, setEditName] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editDuration, setEditDuration] = useState(1);
  const [editProgress, setEditProgress] = useState(0);
  const [editDeps, setEditDeps] = useState<number[]>([]);

  useEffect(() => {
    fetchTasks(projectId);
  }, [projectId, fetchTasks]);

  // 添加任务
  const handleAdd = async () => {
    if (!addName.trim()) return;
    const result = await addTask({
      project_id: projectId,
      name: addName.trim(),
      start_date: addStartDate,
      duration_days: addDuration,
      dependencies: addDeps,
    });
    if (syncToKanban && result) {
      try {
        await kanbanApi.syncGanttToKanban(result.id);
        fetchBoard(projectId);
      } catch (e) {
        console.warn("同步到看板失败:", e);
      }
    }
    resetAddForm();
  };

  const resetAddForm = () => {
    setAddName("");
    setAddStartDate(getToday());
    setAddDuration(3);
    setAddDeps([]);
    setSyncToKanban(false);
    setShowAdd(false);
  };

  // 打开编辑面板
  const handleEdit = (task: GanttTask) => {
    setEditingTask(task);
    setEditName(task.name);
    setEditStartDate(task.start_date);
    setEditDuration(task.duration_days);
    setEditProgress(task.progress);
    setEditDeps([...task.dependencies]);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingTask || !editName.trim()) return;
    await updateTask(editingTask.id, {
      name: editName.trim(),
      start_date: editStartDate,
      duration_days: editDuration,
      progress: editProgress / 100,
      dependencies: editDeps,
    });
    setEditingTask(null);
  };

  // 删除任务
  const handleDeleteTask = async () => {
    if (!editingTask) return;
    await deleteTask(editingTask.id);
    setEditingTask(null);
  };

  const hasTasks = tasks.length > 0;

  // 计算时间范围（与全局一致：空数据约120天，有数据前扩5后扩10）
  const dateRange = hasTasks ? getDateRange(tasks) : null;
  const totalDays = dateRange ? daysBetween(dateRange.minDate, dateRange.maxDate) + 1 : 120;
  const minDate = dateRange?.minDate || (() => {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    return formatLocalDate(now);
  })();
  const today = getToday();

  // 月份标签（与全局一致逻辑）
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
      const label = `${y}年${m}月`;
      labels.push({ label, startDay, span: Math.max(1, endDay - startDay) });
      cursor = nextMonth;
    }
    return labels;
  }, [minDate, totalDays]);

  // 构建依赖箭头数据
  const arrows = hasTasks ? buildArrows(tasks, minDate) : [];

  const scrollToToday = () => {
    if (!containerRef.current) return;
    const offset = daysBetween(minDate, today);
    if (offset >= 0 && offset < totalDays) {
      const scrollLeft = offset * DAY_WIDTH - 200;
      containerRef.current.scrollLeft = Math.max(0, scrollLeft);
    }
  };

  // 空状态仍然显示添加按钮
  const header = (
    <div className="flex items-center justify-between">
      <h3 className="text-title" style={{ color: "var(--text-primary)" }}>
        甘特图
      </h3>
      <div className="flex items-center gap-2">
        {hasTasks && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--text-secondary)" }}
            onClick={scrollToToday}
          >
            <Crosshair size={14} strokeWidth={1.5} />
            回到今天
          </button>
        )}
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} strokeWidth={1.5} />
          添加任务
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {header}
        <div className="text-center py-12">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}

      {!hasTasks ? (
        <EmptyState description="暂无甘特图任务" />
      ) : (
        <div
          ref={containerRef}
          className="overflow-x-auto"
          style={{ position: "relative" }}
        >
          <div style={{ minWidth: `${totalDays * DAY_WIDTH + NAME_WIDTH}px` }}>
            {/* 粘性时间轴头（月份 + 日期合并） */}
            <div
              className="sticky top-0 z-20"
            >
              {/* 月份刻度 */}
              <div
                className="flex border-b"
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
                {monthLabels.map((m, i) => (
                  <div
                    key={i}
                    className="shrink-0 text-center text-[10px] font-medium py-1 border-r whitespace-nowrap overflow-hidden"
                    style={{
                      width: m.span * DAY_WIDTH,
                      color: "var(--text-secondary)",
                      borderColor: "var(--border-light)",
                    }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>

              {/* 日期刻度 */}
              <div
                className="flex border-b"
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
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  const isToday = formatLocalDate(date) === today;
                  return (
                    <div
                      key={i}
                      className="shrink-0 text-center text-[9px] py-0.5 border-r"
                      style={{
                        width: DAY_WIDTH,
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
                      {d}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 任务行 + SVG 依赖箭头 */}
            <div style={{ position: "relative" }}>
              {/* 今日线 */}
              <div
                className="absolute top-0 bottom-0 w-px z-10 pointer-events-none"
                style={{
                  left: daysBetween(minDate, today) * DAY_WIDTH,
                  background: "var(--color-danger)",
                  opacity: 0.4,
                }}
              />

              {/* SVG 依赖箭头 */}
              {arrows.length > 0 && (
                <svg
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    overflow: "visible",
                    zIndex: 0,
                  }}
                  width="100%"
                  height={tasks.length * ROW_HEIGHT}
                >
                  <defs>
                    <marker
                      id="arrowhead"
                      viewBox="0 0 10 10"
                      refX={8}
                      refY={5}
                      markerWidth={6}
                      markerHeight={6}
                      orient="auto"
                    >
                      <path d="M0,0 L10,5 L0,10 Z" fill="var(--gold)" opacity={0.5} />
                    </marker>
                  </defs>
                  {arrows.map((a, i) => (
                    <path
                      key={i}
                      d={a.d}
                      stroke="var(--gold)"
                      strokeWidth={1}
                      fill="none"
                      opacity={0.5}
                      markerEnd="url(#arrowhead)"
                    />
                  ))}
                </svg>
              )}

              {/* 任务行 */}
              {tasks.map((task) => (
                <GanttRow
                  key={task.id}
                  task={task}
                  minDate={minDate}
                  totalDays={totalDays}
                  onClick={() => handleEdit(task)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 添加任务 Modal */}
      <Modal
        open={showAdd}
        onClose={resetAddForm}
        title="添加甘特图任务"
        footer={
          <>
            <button className="btn btn-ghost btn-sm" onClick={resetAddForm}>
              取消
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleAdd}>
              添加
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
              任务名称
            </label>
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded outline-none"
              style={{
                background: "var(--bg-surface-alt)",
                border: "1px solid var(--border-light)",
                color: "var(--text-primary)",
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
                开始日期
              </label>
              <DatePicker value={addStartDate} onChange={setAddStartDate} style={{ background: "var(--bg-surface-alt)", border: "1px solid var(--border-light)", color: "var(--text-primary)" }} />
            </div>
            <div className="w-24">
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
                持续天数
              </label>
              <input
                type="number"
                min={1}
                value={addDuration}
                onChange={(e) => setAddDuration(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 text-sm rounded outline-none"
                style={{
                  background: "var(--bg-surface-alt)",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          </div>
          {tasks.length > 0 && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
                前置依赖任务
              </label>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {tasks.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <input
                      type="checkbox"
                      checked={addDeps.includes(t.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAddDeps([...addDeps, t.id]);
                        } else {
                          setAddDeps(addDeps.filter((d) => d !== t.id));
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-xs">{t.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <label
            className="flex items-center gap-2 mt-2 cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            <input
              type="checkbox"
              checked={syncToKanban}
              onChange={(e) => setSyncToKanban(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs">同步到看板待办事项</span>
          </label>
        </div>
      </Modal>

      {/* 编辑任务 Modal */}
      <Modal
        open={editingTask !== null}
        onClose={() => setEditingTask(null)}
        title="编辑任务"
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              className="btn btn-sm"
              style={{
                background: "var(--color-danger)",
                color: "#fff",
              }}
              onClick={handleDeleteTask}
            >
              <Trash2 size={14} strokeWidth={1.5} />
              删除
            </button>
            <div className="flex gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingTask(null)}>
                取消
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveEdit}>
                保存
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
              任务名称
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded outline-none"
              style={{
                background: "var(--bg-surface-alt)",
                border: "1px solid var(--border-light)",
                color: "var(--text-primary)",
              }}
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
                开始日期
              </label>
              <DatePicker value={editStartDate} onChange={setEditStartDate} style={{ background: "var(--bg-surface-alt)", border: "1px solid var(--border-light)", color: "var(--text-primary)" }} />
            </div>
            <div className="w-24">
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
                持续天数
              </label>
              <input
                type="number"
                min={1}
                value={editDuration}
                onChange={(e) => setEditDuration(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 text-sm rounded outline-none"
                style={{
                  background: "var(--bg-surface-alt)",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
              进度 ({editProgress}%)
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={editProgress}
              onChange={(e) => setEditProgress(Number(e.target.value))}
              className="w-full"
            />
          </div>
          {tasks.length > 1 && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
                前置依赖任务
              </label>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {tasks
                  .filter((t) => t.id !== editingTask?.id)
                  .map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <input
                        type="checkbox"
                        checked={editDeps.includes(t.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditDeps([...editDeps, t.id]);
                          } else {
                            setEditDeps(editDeps.filter((d) => d !== t.id));
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-xs">{t.name}</span>
                    </label>
                  ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ── GanttRow ────────────────────────────────────────────────────

function GanttRow({
  task,
  minDate,
  totalDays,
  onClick,
}: {
  task: GanttTask;
  minDate: string;
  totalDays: number;
  onClick?: () => void;
}) {
  const offset = daysBetween(minDate, task.start_date);
  const width = task.duration_days;

  return (
    <div className="flex items-center" style={{ height: ROW_HEIGHT }}>
      {/* 名称列 - 粘性 */}
      <div
        className="shrink-0 sticky left-0 z-10 border-r flex items-center px-3 truncate"
        style={{
          width: NAME_WIDTH,
          background: "var(--bg-surface)",
          borderColor: "var(--border-light)",
          color: "var(--text-primary)",
          fontSize: 12,
        }}
      >
        {task.name}
      </div>
      <div className="relative flex-1" style={{ height: ROW_HEIGHT }}>
        {/* 背景网格（周线加粗） */}
        <div className="absolute inset-0 flex" style={{ height: ROW_HEIGHT }}>
          {Array.from({ length: totalDays }, (_, i) => (
            <div
              key={i}
              className="shrink-0 border-r"
              style={{
                width: DAY_WIDTH,
                borderColor: "var(--border-light)",
                opacity: i % 7 === 0 ? 0.5 : 0.2,
              }}
            />
          ))}
        </div>
        {/* 任务条 */}
        <div
          className="absolute rounded-sm transition-all cursor-pointer hover:opacity-100"
          style={{
            top: BAR_TOP,
            left: offset * DAY_WIDTH,
            width: Math.max(width * DAY_WIDTH, 4),
            height: BAR_HEIGHT,
            background: `linear-gradient(90deg, var(--gold), var(--gold-light))`,
            opacity: 0.85,
          }}
          onClick={onClick}
        >
          <div
            className="h-full rounded-sm"
            style={{
              width: `${task.progress * 100}%`,
              background: "var(--gold-dark)",
              opacity: 0.6,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── 工具函数 ────────────────────────────────────────────────────

function getDateRange(tasks: GanttTask[]) {
  let min = tasks[0].start_date;
  let max = tasks[0].start_date;

  for (const t of tasks) {
    const end = addDays(t.start_date, t.duration_days);
    if (t.start_date < min) min = t.start_date;
    if (end > max) max = end;
  }

  // 与全局一致：前扩5天，后扩10天
  min = addDays(min, -5);
  max = addDays(max, 10);

  return { minDate: min, maxDate: max };
}

// ── SVG 依赖箭头计算 ────────────────────────────────────────────

interface ArrowData {
  d: string;
}

function buildArrows(
  tasks: GanttTask[],
  minDate: string,
): ArrowData[] {
  const result: ArrowData[] = [];
  const taskIndexMap = new Map<number, number>();
  tasks.forEach((t, i) => taskIndexMap.set(t.id, i));

  for (const task of tasks) {
    if (!task.dependencies || task.dependencies.length === 0) continue;

    const toIdx = taskIndexMap.get(task.id);
    if (toIdx === undefined) continue;

    const toOffset = daysBetween(minDate, task.start_date);
    const toX = NAME_WIDTH + toOffset * DAY_WIDTH;
    const toY = toIdx * ROW_HEIGHT + BAR_CENTER_Y;

    for (const depId of task.dependencies) {
      const fromIdx = taskIndexMap.get(depId);
      if (fromIdx === undefined) continue;

      const depTask = tasks.find((t) => t.id === depId);
      if (!depTask) continue;

      const fromOffset = daysBetween(minDate, depTask.start_date);
      const fromX =
        NAME_WIDTH + fromOffset * DAY_WIDTH + depTask.duration_days * DAY_WIDTH;
      const fromY = fromIdx * ROW_HEIGHT + BAR_CENTER_Y;

      // 贝塞尔曲线
      const cpOffset = Math.min(Math.abs(toX - fromX) * 0.4, 30);

      const d =
        `M${fromX},${fromY} ` +
        `C${fromX + cpOffset},${fromY} ` +
        `${toX - cpOffset},${toY} ` +
        `${toX},${toY}`;

      result.push({ d });
    }
  }

  return result;
}