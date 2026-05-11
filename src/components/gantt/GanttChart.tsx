import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useGanttStore } from "@/stores/useGanttStore";
import type { GanttTask } from "@/types";
import Modal from "@/components/common/Modal";

interface Props {
  projectId: number;
}

// 布局常量
const DAY_WIDTH = 28;
const ROW_HEIGHT = 32;
const NAME_WIDTH = 160;
const BAR_AREA_HEIGHT = 20;
const BAR_TOP = 4; // top-1 = 0.25rem = 4px
const BAR_HEIGHT = 16;
const BAR_CENTER_Y = (ROW_HEIGHT - BAR_AREA_HEIGHT) / 2 + BAR_TOP + BAR_HEIGHT / 2;

export default function GanttChart({ projectId }: Props) {
  const { tasks, fetchTasks, addTask, updateTask, deleteTask, loading } =
    useGanttStore();

  // 添加任务
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addStartDate, setAddStartDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [addDuration, setAddDuration] = useState(3);
  const [addDeps, setAddDeps] = useState<number[]>([]);

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
    await addTask({
      project_id: projectId,
      name: addName.trim(),
      start_date: addStartDate,
      duration_days: addDuration,
      dependencies: addDeps,
    });
    resetAddForm();
  };

  const resetAddForm = () => {
    setAddName("");
    setAddStartDate(new Date().toISOString().split("T")[0]);
    setAddDuration(3);
    setAddDeps([]);
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

  // 计算时间范围和依赖箭头数据
  const dateRange = hasTasks ? getDateRange(tasks) : null;
  const totalDays = dateRange ? daysBetween(dateRange.minDate, dateRange.maxDate) + 1 : 30;
  const minDate = dateRange?.minDate || new Date().toISOString().split("T")[0];

  // 构建依赖箭头数据
  const arrows = hasTasks ? buildArrows(tasks, minDate) : [];

  // 空状态仍然显示添加按钮
  const header = (
    <div className="flex items-center justify-between">
      <h3 className="text-title" style={{ color: "var(--text-primary)" }}>
        甘特图
      </h3>
      <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
        <Plus size={14} strokeWidth={1.5} />
        添加任务
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {header}
        <div
          className="text-center py-12 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          加载甘特图…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}

      {!hasTasks ? (
        <div className="card text-center py-12">
          <p style={{ color: "var(--text-tertiary)" }}>暂无甘特图任务</p>
        </div>
      ) : (
        <div className="overflow-x-auto" style={{ position: "relative" }}>
          <div style={{ minWidth: `${totalDays * DAY_WIDTH + NAME_WIDTH}px` }}>
            {/* 日期刻度 */}
            <div
              className="flex border-b mb-2"
              style={{ borderColor: "var(--border-light)" }}
            >
              {/* 名称占位 */}
              <div className="shrink-0" style={{ width: NAME_WIDTH }} />
              {Array.from({ length: totalDays }, (_, i) => {
                const date = new Date(minDate);
                date.setDate(date.getDate() + i);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                return (
                  <div
                    key={i}
                    className="shrink-0 text-center text-[9px] py-1"
                    style={{
                      width: DAY_WIDTH,
                      color: isWeekend
                        ? "var(--color-danger)"
                        : "var(--text-muted)",
                      background: isWeekend
                        ? "var(--gold-glow)"
                        : "transparent",
                    }}
                  >
                    {date.getDate()}
                  </div>
                );
              })}
            </div>

            {/* 任务行 + SVG 依赖箭头 */}
            <div style={{ position: "relative" }}>
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
              <div className="space-y-1">
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
              <input
                type="date"
                value={addStartDate}
                onChange={(e) => setAddStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded outline-none"
                style={{
                  background: "var(--bg-surface-alt)",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-primary)",
                }}
              />
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
              <input
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded outline-none"
                style={{
                  background: "var(--bg-surface-alt)",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-primary)",
                }}
              />
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
    <div className="flex items-center h-8">
      <div
        className="w-40 shrink-0 text-xs pr-2 truncate"
        style={{ color: "var(--text-primary)" }}
      >
        {task.name}
      </div>
      <div className="relative flex-1" style={{ height: 20 }}>
        {/* 背景网格 */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: totalDays }, (_, i) => (
            <div
              key={i}
              className="shrink-0 border-r"
              style={{
                width: DAY_WIDTH,
                borderColor: "var(--border-light)",
                opacity: 0.5,
              }}
            />
          ))}
        </div>
        {/* 任务条 */}
        <div
          className="absolute top-1 rounded-sm transition-all cursor-pointer hover:opacity-100"
          style={{
            left: offset * DAY_WIDTH,
            width: Math.max(width * DAY_WIDTH, 4),
            height: 16,
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

  min = addDays(min, -3);
  max = addDays(max, 3);

  return { minDate: min, maxDate: max };
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / 86400000);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
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

      // 贝塞尔曲线: 水平方向留控制点偏移
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
