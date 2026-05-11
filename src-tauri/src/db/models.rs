use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub project_number: Option<String>,
    #[serde(default)]
    pub project_type: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub end_date: Option<String>,
    #[serde(default)]
    pub status_changed_at: Option<String>,
    #[serde(default)]
    pub created_by: Option<String>,
    #[serde(default)]
    pub folder_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KanbanColumn {
    pub id: i64,
    pub project_id: i64,
    pub title: String,
    pub position: i32,
    pub created_at: String,
    #[serde(default)]
    pub cards: Vec<KanbanCard>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KanbanCard {
    pub id: i64,
    pub column_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub position: i32,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KanbanBoard {
    pub columns: Vec<KanbanColumn>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GanttTask {
    pub id: i64,
    pub project_id: i64,
    pub name: String,
    pub start_date: String,
    pub duration_days: i32,
    pub dependencies: Vec<i64>,
    pub progress: f64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub id: i64,
    pub project_id: i64,
    pub original_name: String,
    pub stored_name: String,
    pub size: i64,
    pub uploaded_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub theme: String,
    pub language: String,
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, String>,
}

/// 全局搜索结果
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub result_type: String, // "project" | "card" | "task"
    pub id: i64,
    pub title: String,
    pub detail: String,
    pub project_id: i64,
    pub project_name: String,
}

/// 通知历史记录
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NotificationRecord {
    pub id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub title: String,
    pub message: String,
    pub read: bool,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
}

/// 文件预览数据
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FilePreview {
    pub mime_type: String,
    pub content: String,    // 文本内容或图片 base64 data URL
    pub original_name: String,
    pub size: i64,
}

/// 完整项目导出数据（含看板、甘特图、文件元数据）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectExport {
    pub version: i32,
    pub project: Project,
    pub kanban_columns: Vec<KanbanColumn>,
    pub gantt_tasks: Vec<GanttTask>,
    pub files: Vec<FileEntry>,
}

/// 项目状态变更历史
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectStatusHistory {
    pub id: i64,
    pub project_id: i64,
    pub status: String,
    pub changed_at: String,
}

/// 项目里程碑
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectMilestone {
    pub id: i64,
    pub project_id: i64,
    pub name: String,
    pub date: String,
    pub description: Option<String>,
    pub created_at: String,
}

/// 用户
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct User {
    pub id: i64,
    pub name: String,
    pub avatar_path: Option<String>,
    pub created_at: String,
}

/// 扫描到的文件夹信息（用于文件夹导入）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScannedFolder {
    pub folder_name: String,
    pub path: String,
    pub matched: bool,
    pub parsed_code: Option<String>,
    pub parsed_name: Option<String>,
    pub inferred_type: Option<String>,
    pub inferred_date: Option<String>,
    pub inferred_end_date: Option<String>,
}
