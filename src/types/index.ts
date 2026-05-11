// ============================================================
// Fileosophy TypeScript 类型定义
// 适配 Tauri + SQLite (INTEGER PRIMARY KEY AUTOINCREMENT)
// ============================================================

// ── 项目 ──────────────────────────────────────────────────────

export interface Project {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  project_number: string;
  project_type: string;
  status: ProjectStatus;
  start_date: string;
  end_date: string;
  status_changed_at: string;
  created_by: string;
  folder_path: string;
}

// ── 用户 ──────────────────────────────────────────────────────

export interface User {
  id: number;
  name: string;
  avatar_path: string | null;
  created_at: string;
}

// ── 项目状态 ──────────────────────────────────────────────────

export type ProjectStatus =
  | "planning"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "cancelled";

export interface ProjectStatusConfig {
  id: ProjectStatus;
  name: string;
  color: string;
  sort_order: number;
}

export const DEFAULT_PROJECT_STATUSES: ProjectStatusConfig[] = [
  { id: "planning", name: "规划中", color: "#6366f1", sort_order: 0 },
  { id: "in_progress", name: "进行中", color: "#f59e0b", sort_order: 1 },
  { id: "on_hold", name: "已暂停", color: "#8b5cf6", sort_order: 2 },
  { id: "completed", name: "已完成", color: "#22c55e", sort_order: 3 },
  { id: "cancelled", name: "已取消", color: "#94a3b8", sort_order: 4 },
];

// ── 项目分类 ──────────────────────────────────────────────────

export interface ProjectTypeConfig {
  id: string;
  name: string;
  prefix: string;
  keywords: string[];
}

export const DEFAULT_PROJECT_TYPES: ProjectTypeConfig[] = [
  { id: "rd", name: "研发", prefix: "RD", keywords: ["研发", "开发", "研发项目", "RD"] },
  { id: "design", name: "设计", prefix: "DS", keywords: ["设计", "UI", "UX", "DS"] },
  { id: "ops", name: "运营", prefix: "OP", keywords: ["运营", "推广", "活动", "OP"] },
  { id: "construction", name: "施工", prefix: "CS", keywords: ["施工", "工程", "建设", "CS"] },
  { id: "other", name: "其他", prefix: "OT", keywords: ["其他", "杂项", "OT"] },
];

// ── 项目表格列配置 ────────────────────────────────────────────

export interface ProjectTableColumn {
  key: string;
  label: string;
  width: number;
  sortable: boolean;
  visible: boolean;
  fixed?: boolean;
}

export const DEFAULT_PROJECT_TABLE_COLUMNS: ProjectTableColumn[] = [
  { key: "project_number", label: "编号", width: 115, sortable: true, visible: true },
  { key: "name", label: "名称", width: 200, sortable: true, visible: true, fixed: true },
  { key: "status", label: "状态", width: 95, sortable: true, visible: true, fixed: true },
  { key: "project_type", label: "分类", width: 65, sortable: true, visible: true },
  { key: "start_date", label: "开始日期", width: 95, sortable: true, visible: true },
  { key: "end_date", label: "截止日期", width: 95, sortable: true, visible: true },
  { key: "created_by", label: "创建人", width: 65, sortable: true, visible: true },
  { key: "created_at", label: "创建时间", width: 130, sortable: true, visible: false },
  { key: "updated_at", label: "更新时间", width: 130, sortable: true, visible: false },
];

// ── 编号模板 ──────────────────────────────────────────────────

export const DEFAULT_NUMBER_TEMPLATE = "{prefix}-{date}-{sequence} {name}";
export const DEFAULT_FOLDER_TEMPLATE = "[{code}] {name}";

export interface CreateProjectData {
  name: string;
  description?: string;
  project_type?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  created_by?: string;
  parent_path?: string;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
  project_type?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
}

// ── 状态变更历史 ────────────────────────────────────────────────

export interface ProjectStatusHistory {
  id: number;
  project_id: number;
  status: string;
  changed_at: string;
}

// ── 项目里程碑 ──────────────────────────────────────────────────

export interface ProjectMilestone {
  id: number;
  project_id: number;
  name: string;
  date: string;
  description?: string;
  created_at: string;
}

export interface CreateMilestoneData {
  project_id: number;
  name: string;
  date: string;
  description?: string;
}

export interface UpdateMilestoneData {
  name?: string;
  date?: string;
  description?: string;
}

// ── 看板列 ────────────────────────────────────────────────────

export interface KanbanColumn {
  id: number;
  project_id: number;
  title: string;
  position: number;
  created_at: string;
  cards?: KanbanCard[];
}

export interface CreateColumnData {
  project_id: number;
  title: string;
}

// ── 看板卡片 ──────────────────────────────────────────────────

export interface KanbanCard {
  id: number;
  column_id: number;
  title: string;
  description: string;
  position: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateCardData {
  column_id: number;
  title: string;
  description?: string;
}

export interface UpdateCardData {
  title?: string;
  description?: string;
  tags?: string[];
}

// ── 看板整体结构 ──────────────────────────────────────────────

export interface KanbanBoard {
  columns: KanbanColumn[];
}

// ── 甘特图任务 ────────────────────────────────────────────────

export interface GanttTask {
  id: number;
  project_id: number;
  name: string;
  start_date: string;
  duration_days: number;
  dependencies: number[];
  progress: number;
  created_at: string;
}

export interface CreateGanttTaskData {
  project_id: number;
  name: string;
  start_date: string;
  duration_days: number;
  dependencies?: number[];
}

export interface UpdateGanttTaskData {
  name?: string;
  start_date?: string;
  duration_days?: number;
  dependencies?: number[];
  progress?: number;
}

// ── 项目文件 ──────────────────────────────────────────────────

export interface FileEntry {
  id: number;
  project_id: number;
  original_name: string;
  stored_name: string;
  size: number;
  uploaded_at: string;
}

export interface FilePreview {
  mime_type: string;
  content: string;  // 文本内容或图片 base64 data URL
  original_name: string;
  size: number;
}

/** 可在应用内内联预览的文件扩展名集合 */
export const INLINE_PREVIEW_EXTS = new Set([
  // 文本
  "txt", "json", "xml", "csv", "log", "yaml", "yml", "toml", "ini",
  "cfg", "conf", "rs", "ts", "tsx", "js", "jsx", "py", "html", "css",
  "sql", "sh", "bat", "ps1", "env",
  // Markdown
  "md",
  // 图片
  "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico",
]);

/** 从文件名提取小写扩展名 */
export function getFileExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

// ── 应用设置 ──────────────────────────────────────────────────

export interface AppSettings {
  theme: "light" | "dark" | "system";
  language: string;
  [key: string]: string;
}

// ── 通知 ──────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  link?: string;
}

// ── 通知偏好 ──────────────────────────────────────────────────

export interface NotificationPreferences {
  project_created: boolean;
  project_deleted: boolean;
  project_status_changed: boolean;
  card_created: boolean;
  card_moved: boolean;
  file_uploaded: boolean;
  file_deleted: boolean;
  file_received: boolean;
  share_started: boolean;
  share_stopped: boolean;
  native_notifications: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  project_created: true,
  project_deleted: true,
  project_status_changed: true,
  card_created: false,
  card_moved: false,
  file_uploaded: true,
  file_deleted: true,
  file_received: true,
  share_started: true,
  share_stopped: true,
  native_notifications: true,
};

// ── 网络共享 ──────────────────────────────────────────────────

export interface Peer {
  name: string;
  host: string;
  port: number;
  addresses: string[];
}

export interface ReceivedFile {
  file_name: string;
  file_size: number;
  sender: string;
  saved_path: string;
}

// ── 事件载荷 ──────────────────────────────────────────────────

export interface ProjectUpdatedPayload {
  project_id: number;
}

export interface CardMovedPayload {
  card_id: number;
  target_column_id: number;
  position: number;
}

export interface NotificationPayload {
  type: string;
  title: string;
  message: string;
  link?: string;
}

export interface FileSharedPayload {
  file_id?: number;
  file_name?: string;
  peer_addr?: string;
  status?: string;
}

// ── 项目导出/导入 ─────────────────────────────────────────────

export interface ProjectExport {
  version: number;
  project: Project;
  kanban_columns: KanbanColumn[];
  gantt_tasks: GanttTask[];
  files: FileEntry[];
}

// ── 文件夹扫描 ────────────────────────────────────────────────

export interface ScannedFolder {
  folder_name: string;
  path: string;
  matched: boolean;
  parsed_code: string;
  parsed_name: string;
  inferred_type: string;
  inferred_date: string;
  inferred_end_date: string;
}

// ── 文件夹树 ──────────────────────────────────────────────────

export interface FolderEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  children: FolderEntry[];
}

// ── 全局搜索 ──────────────────────────────────────────────────

export interface SearchResult {
  result_type: "project" | "card" | "task";
  id: number;
  title: string;
  detail: string;
  project_id: number;
  project_name: string;
}

// ── 全局快捷键 ────────────────────────────────────────────────

export interface ShortcutConfig {
  action: string;
  shortcut: string;
  label: string;
  description: string;
}

export const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  {
    action: "quick_add",
    shortcut: "CommandOrControl+Shift+N",
    label: "快速新建任务",
    description: "打开快速创建任务面板",
  },
  {
    action: "toggle_window",
    shortcut: "CommandOrControl+Shift+S",
    label: "显示/隐藏窗口",
    description: "切换主窗口的显示状态",
  },
  {
    action: "global_search",
    shortcut: "CommandOrControl+Shift+F",
    label: "全局搜索",
    description: "打开全局搜索面板",
  },
];
