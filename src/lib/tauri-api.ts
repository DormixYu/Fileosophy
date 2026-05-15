import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type {
  Project,
  CreateProjectData,
  UpdateProjectData,
  ProjectStatusHistory,
  CreateStatusHistoryData,
  UpdateStatusHistoryData,
  ProjectMilestone,
  CreateMilestoneData,
  UpdateMilestoneData,
  KanbanBoard,
  KanbanColumn,
  CreateColumnData,
  KanbanCard,
  CreateCardData,
  UpdateCardData,
  GanttTask,
  CreateGanttTaskData,
  UpdateGanttTaskData,
  FileEntry,
  FilePreview,
  AppSettings,
  Peer,
  Notification,
  SearchResult,
  LinkCardToGanttResult,
  ScannedFolder,
  User,
  FolderEntry,
  ClientInfo,
  RemoteDirEntry,
  ActivityLogEntry,
} from "@/types";

// ── 项目管理 ──────────────────────────────────────────────────

export const projectApi = {
  getAll: () => invoke<Project[]>("get_all_projects"),

  getById: (id: number) => invoke<Project>("get_project_by_id", { id }),

  create: (data: CreateProjectData) =>
    invoke<Project>("create_project", {
      name: data.name,
      description: data.description ?? null,
      projectType: data.project_type ?? null,
      status: data.status ?? null,
      startDate: data.start_date ?? null,
      endDate: data.end_date ?? null,
      createdBy: data.created_by ?? null,
      parentPath: data.parent_path ?? null,
    }),

  update: (id: number, data: UpdateProjectData) =>
    invoke<Project>("update_project", {
      id,
      name: data.name ?? null,
      description: data.description ?? null,
      projectType: data.project_type ?? null,
      status: data.status ?? null,
      startDate: data.start_date ?? null,
      endDate: data.end_date ?? null,
    }),

  delete: (id: number) => invoke<void>("delete_project", { id }),

  openFolder: (path: string) => invoke<void>("open_folder", { path }),

  openFile: (path: string) => invoke<void>("open_file", { path }),

  // 状态变更历史
  getStatusHistory: (projectId: number) =>
    invoke<ProjectStatusHistory[]>("get_project_status_history", { projectId }),

  getAllStatusHistories: () =>
    invoke<ProjectStatusHistory[]>("get_all_status_histories"),

  addStatusHistory: (data: CreateStatusHistoryData) =>
    invoke<ProjectStatusHistory>("add_status_history", {
      projectId: data.project_id, status: data.status, changedAt: data.changed_at,
    }),

  updateStatusHistory: (id: number, data: UpdateStatusHistoryData) =>
    invoke<ProjectStatusHistory>("update_status_history", {
      id, status: data.status, changedAt: data.changed_at,
    }),

  deleteStatusHistory: (id: number) =>
    invoke<void>("delete_status_history", { id }),

  // 里程碑
  addMilestone: (data: CreateMilestoneData) =>
    invoke<ProjectMilestone>("add_project_milestone", {
      projectId: data.project_id,
      name: data.name,
      date: data.date,
      description: data.description ?? null,
    }),

  updateMilestone: (id: number, data: UpdateMilestoneData) =>
    invoke<ProjectMilestone>("update_project_milestone", {
      id,
      name: data.name ?? null,
      date: data.date ?? null,
      description: data.description ?? null,
    }),

  deleteMilestone: (id: number) =>
    invoke<void>("delete_project_milestone", { id }),

  getMilestones: (projectId: number) =>
    invoke<ProjectMilestone[]>("get_project_milestones", { projectId }),

  getAllMilestones: () =>
    invoke<ProjectMilestone[]>("get_all_milestones"),
};

// ── 看板 ──────────────────────────────────────────────────────

export const kanbanApi = {
  getBoard: (projectId: number) =>
    invoke<KanbanBoard>("get_kanban_board", { projectId }),

  addColumn: (data: CreateColumnData) =>
    invoke<KanbanColumn>("add_column", {
      projectId: data.project_id,
      title: data.title,
      columnType: data.column_type ?? null,
    }),

  moveCard: (cardId: number, targetColumnId: number, position: number) =>
    invoke<void>("move_card", { cardId, targetColumnId, position }),

  createCard: (data: CreateCardData) =>
    invoke<KanbanCard>("create_card", {
      columnId: data.column_id,
      title: data.title,
      description: data.description ?? null,
      dueDate: data.due_date ?? null,
      ganttTaskId: data.gantt_task_id ?? null,
    }),

  updateCard: (cardId: number, data: UpdateCardData) =>
    invoke<KanbanCard>("update_card", {
      cardId,
      title: data.title ?? null,
      description: data.description ?? null,
      tags: data.tags ?? null,
      dueDate: data.due_date ?? null,
      ganttTaskId: data.gantt_task_id ?? null,
    }),

  updateColumn: (columnId: number, title: string, columnType?: string | null) =>
    invoke<KanbanColumn>("update_column", { columnId, title, columnType: columnType ?? null }),

  deleteColumn: (columnId: number) =>
    invoke<void>("delete_column", { columnId }),

  deleteCard: (cardId: number) => invoke<void>("delete_card", { cardId }),

  linkCardToGantt: (cardId: number, name: string, startDate: string, durationDays: number) =>
    invoke<LinkCardToGanttResult>("link_card_to_gantt", { cardId, taskName: name, startDate, durationDays }),

  unlinkCardFromGantt: (cardId: number) =>
    invoke<KanbanCard>("unlink_card_from_gantt", { cardId }),

  syncGanttToKanban: (taskId: number) =>
    invoke<KanbanCard>("sync_gantt_to_kanban", { taskId }),
};

// ── 甘特图 ────────────────────────────────────────────────────

export const ganttApi = {
  getData: (projectId: number) =>
    invoke<GanttTask[]>("get_gantt_data", { projectId }),

  addTask: (data: CreateGanttTaskData) =>
    invoke<GanttTask>("add_gantt_task", {
      projectId: data.project_id,
      name: data.name,
      startDate: data.start_date,
      durationDays: data.duration_days,
      dependencies: data.dependencies ?? null,
    }),

  updateTask: (id: number, data: UpdateGanttTaskData) =>
    invoke<GanttTask>("update_gantt_task", {
      id,
      name: data.name ?? null,
      startDate: data.start_date ?? null,
      durationDays: data.duration_days ?? null,
      dependencies: data.dependencies ?? null,
      progress: data.progress ?? null,
    }),

  deleteTask: (id: number) => invoke<void>("delete_gantt_task", { id }),
};

// ── 文件管理 ──────────────────────────────────────────────────

export const fileApi = {
  list: (projectId: number) =>
    invoke<FileEntry[]>("list_project_files", { projectId }),

  upload: (projectId: number, filePath: string) =>
    invoke<FileEntry>("upload_file_to_project", { projectId, filePath }),

  delete: (fileId: number) => invoke<void>("delete_file", { fileId }),

  download: (fileId: number) => invoke<string>("download_file", { fileId }),

  openStoredFile: (fileId: number) => invoke<void>("open_stored_file", { fileId }),

  preview: (fileId: number) => invoke<FilePreview>("preview_file", { fileId }),

  shareOverNetwork: (fileId: number, peerAddr: string, peerPort: number, token: string) =>
    invoke<void>("share_file_over_network", { fileId, peerAddr, peerPort, token }),

  discoverPeers: () => invoke<Peer[]>("discover_peers"),

  listFolderContents: (path: string) =>
    invoke<FolderEntry>("list_folder_contents", { path }),
};

// ── 应用设置 ──────────────────────────────────────────────────

export const settingsApi = {
  get: () => invoke<AppSettings>("get_app_settings"),

  update: (settings: AppSettings) =>
    invoke<AppSettings>("update_app_settings", { settings }),
};

// ── 通知历史 ──────────────────────────────────────────────────

export const notificationHistoryApi = {
  getAll: () => invoke<Notification[]>("get_notifications"),

  add: (notif: Omit<Notification, "read" | "created_at">) =>
    invoke<void>("add_notification", {
      id: notif.id,
      type_: notif.type,
      title: notif.title,
      message: notif.message,
      link: notif.link ?? null,
    }),

  markRead: (id: string) => invoke<void>("mark_notification_read", { id }),

  clearAll: () => invoke<void>("clear_notifications"),

  markAllRead: () => invoke<void>("mark_all_notifications_read"),

  getPreferences: () => invoke<Record<string, boolean>>("get_notification_preferences"),

  updatePreferences: (preferences: Record<string, boolean>) =>
    invoke<void>("update_notification_preferences", { preferences }),
};

// ── 全局搜索 ──────────────────────────────────────────────────

export const searchApi = {
  search: (query: string) =>
    invoke<SearchResult[]>("global_search", { query }),
};

// ── 导入导出 ──────────────────────────────────────────────────

export const exportApi = {
  /** 导出单个项目（JSON 完整数据 或 CSV 摘要） */
  exportProject: (projectId: number, format: string) =>
    invoke<string>("export_project", { projectId, format }),

  /** 导出所有项目（JSON 完整备份） */
  exportAllProjects: () => invoke<string>("export_all_projects"),

  /** 导入单个项目 */
  importProject: (filePath: string) =>
    invoke<Project>("import_project", { filePath }),

  /** 从备份文件导入所有项目 */
  importAllProjects: (filePath: string) =>
    invoke<Project[]>("import_all_projects", { filePath }),
};

// ── 文件夹扫描/导入 ──────────────────────────────────────────

export const folderApi = {
  /** 扫描指定目录下的子文件夹，返回匹配/解析结果 */
  scanFolders: (folderPath: string) =>
    invoke<ScannedFolder[]>("scan_project_folders", { parentPath: folderPath }),

  /** 从文件夹导入为新项目 */
  importFromFolder: (folder: ScannedFolder) => {
    const sep = folder.path.includes("\\") ? "\\" : "/";
    const lastSep = folder.path.lastIndexOf(sep);
    const parentPath = lastSep >= 0 ? folder.path.substring(0, lastSep) : "";
    const args = {
      parentPath,
      folderName: folder.folder_name,
      name: folder.parsed_name || folder.folder_name,
      projectNumber: folder.parsed_code || null,
      projectType: folder.inferred_type || null,
      startDate: folder.inferred_date || null,
      endDate: folder.inferred_end_date || null,
    };
    return invoke<Project>("import_project_from_folder", args);
  },
};

// ── 全局快捷键 ────────────────────────────────────────────────

export const shortcutApi = {
  register: (shortcut: string, handler: (event: { state: string }) => void) =>
    import("@tauri-apps/plugin-global-shortcut").then((m) =>
      m.register(shortcut, handler)
    ),

  unregister: (shortcut: string) =>
    import("@tauri-apps/plugin-global-shortcut").then((m) =>
      m.unregister(shortcut)
    ),

  isRegistered: (shortcut: string) =>
    import("@tauri-apps/plugin-global-shortcut").then((m) =>
      m.isRegistered(shortcut)
    ),
};

// ── 局域网文件夹分享 ────────────────────────────────────────────

export const shareApi = {
  start: (path: string, password: string) =>
    invoke<number>("start_folder_share", { path, password }),

  stop: (port: number) => invoke<void>("stop_folder_share", { port }),

  getStatus: () => invoke<{ port: number; path: string }[]>("get_share_status"),

  getConnectedClients: (port: number) => invoke<ClientInfo[]>("get_connected_clients", { port }),

  getActivityLog: (port: number) => invoke<ActivityLogEntry[]>("get_activity_log", { port }),

  join: (addr: string, password: string) =>
    invoke<string>("join_shared_folder", { addr, password }),

  listRemote: (addr: string, password: string, path: string) =>
    invoke<RemoteDirEntry[]>("list_remote_files", { addr, password, path }),

  downloadRemote: (addr: string, password: string, remotePath: string, localPath: string) =>
    invoke<string>("download_remote_file", { addr, password, remotePath, localPath }),

  uploadRemote: (addr: string, password: string, remoteDir: string, fileName: string, localPath: string) =>
    invoke<void>("upload_remote_file", { addr, password, remoteDir, fileName, localPath }),
};

// ── 系统工具 ──────────────────────────────────────────────────

export const systemApi = {
  localIp: () => invoke<string>("get_local_ip"),
  convertFileSrc: (path: string) => convertFileSrc(path),
  openUserGuide: () => invoke<void>("open_user_guide"),
};

// ── 用户 ──────────────────────────────────────────────────────

export const userApi = {
  getCurrent: () => invoke<User | null>("get_current_user"),

  createOrUpdate: (name: string, avatarPath?: string | null) =>
    invoke<User>("create_or_update_user", {
      name,
      avatarPath: avatarPath ?? null,
    }),

  uploadAvatar: (imageData: string) =>
    invoke<string>("upload_avatar", { imageData }),
};

