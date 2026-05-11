use super::projects::{DbConn, row_to_project, PROJECT_COLUMNS};
use crate::db::models::{AppSettings, FileEntry, GanttTask, KanbanCard, KanbanColumn, NotificationRecord, ProjectExport, ScannedFolder, SearchResult};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn get_app_settings(db: State<'_, DbConn>) -> Result<AppSettings, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT key, value FROM settings")
        .map_err(|e| e.to_string())?;

    let mut map = HashMap::new();
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (k, v) = row.map_err(|e| e.to_string())?;
        map.insert(k, v);
    }

    let theme = map.remove("theme").unwrap_or_else(|| "system".to_string());
    let language = map.remove("language").unwrap_or_else(|| "zh-CN".to_string());

    Ok(AppSettings {
        theme,
        language,
        extra: map,
    })
}

#[tauri::command]
pub fn update_app_settings(
    db: State<'_, DbConn>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', ?1)",
        [&settings.theme],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('language', ?1)",
        [&settings.language],
    )
    .map_err(|e| e.to_string())?;

    for (key, value) in &settings.extra {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            rusqlite::params![key, value],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(settings)
}

// ── 完整项目导出 ──────────────────────────────────────────────

fn load_kanban_columns(conn: &rusqlite::Connection, project_id: i64) -> Result<Vec<KanbanColumn>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.project_id, c.title, c.position, c.created_at,
                    card.id, card.column_id, card.title, card.description, card.position, card.tags, card.created_at, card.updated_at
             FROM kanban_columns c
             LEFT JOIN kanban_cards card ON card.column_id = c.id
             WHERE c.project_id = ?1
             ORDER BY c.position, card.position",
        )
        .map_err(|e| e.to_string())?;

    let mut columns_map: HashMap<i64, KanbanColumn> = HashMap::new();
    let rows = stmt
        .query_map([project_id], |row| {
            let col_id: i64 = row.get(0)?;
            let col = KanbanColumn {
                id: col_id,
                project_id: row.get(1)?,
                title: row.get(2)?,
                position: row.get(3)?,
                created_at: row.get(4)?,
                cards: Vec::new(),
            };

            let card_id: Option<i64> = row.get(5)?;
            let card = card_id.map(|cid| KanbanCard {
                id: cid,
                column_id: row.get(6).unwrap_or(col_id),
                title: row.get(7).unwrap_or_default(),
                description: row.get(8).ok(),
                position: row.get(9).unwrap_or(0),
                tags: row
                    .get::<_, String>(10)
                    .ok()
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default(),
                created_at: row.get(11).unwrap_or_default(),
                updated_at: row.get(12).unwrap_or_default(),
            });

            Ok((col, card))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (col, card) = row.map_err(|e| e.to_string())?;
        let entry = columns_map.entry(col.id).or_insert(col);
        if let Some(c) = card {
            entry.cards.push(c);
        }
    }

    let mut columns: Vec<KanbanColumn> = columns_map.into_values().collect();
    columns.sort_by_key(|c| c.position);
    Ok(columns)
}

fn load_gantt_tasks(conn: &rusqlite::Connection, project_id: i64) -> Result<Vec<GanttTask>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, name, start_date, duration_days, dependencies, progress, created_at
             FROM gantt_tasks WHERE project_id = ?1 ORDER BY start_date",
        )
        .map_err(|e| e.to_string())?;

    let tasks = stmt
        .query_map([project_id], |row| {
            Ok(GanttTask {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                start_date: row.get(3)?,
                duration_days: row.get(4)?,
                dependencies: row
                    .get::<_, String>(5)
                    .ok()
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default(),
                progress: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(tasks)
}

fn load_project_files(conn: &rusqlite::Connection, project_id: i64) -> Result<Vec<FileEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, original_name, stored_name, size, uploaded_at
             FROM project_files WHERE project_id = ?1 ORDER BY uploaded_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let files = stmt
        .query_map([project_id], |row| {
            Ok(FileEntry {
                id: row.get(0)?,
                project_id: row.get(1)?,
                original_name: row.get(2)?,
                stored_name: row.get(3)?,
                size: row.get(4)?,
                uploaded_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(files)
}

/// 导出项目为 JSON（完整数据）或 CSV（摘要）
#[tauri::command]
pub fn export_project(
    db: State<'_, DbConn>,
    project_id: i64,
    format: String,
) -> Result<String, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let project = conn
        .query_row(
            &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1"),
            [project_id],
            row_to_project,
        )
        .map_err(|e| format!("项目不存在: {e}"))?;

    let kanban_columns = load_kanban_columns(&conn, project_id)?;
    let gantt_tasks = load_gantt_tasks(&conn, project_id)?;
    let files = load_project_files(&conn, project_id)?;

    let export = ProjectExport {
        version: 1,
        project,
        kanban_columns,
        gantt_tasks,
        files,
    };

    match format.as_str() {
        "json" => serde_json::to_string_pretty(&export).map_err(|e| e.to_string()),
        "csv" => export_to_csv(&export),
        _ => Err(format!("不支持的导出格式: {format}")),
    }
}

fn export_to_csv(export: &ProjectExport) -> Result<String, String> {
    let mut csv = String::new();

    // 项目信息
    csv.push_str("=== 项目信息 ===\n");
    csv.push_str("ID,名称,描述,创建时间,更新时间\n");
    csv.push_str(&format!(
        "{},\"{}\",\"{}\",{},{}\n\n",
        export.project.id,
        export.project.name.replace('"', "\"\""),
        export.project.description.as_deref().unwrap_or("").replace('"', "\"\""),
        export.project.created_at,
        export.project.updated_at,
    ));

    // 看板卡片
    csv.push_str("=== 看板任务 ===\n");
    csv.push_str("列名,卡片ID,标题,描述,标签,创建时间\n");
    for col in &export.kanban_columns {
        for card in &col.cards {
            csv.push_str(&format!(
                "\"{}\",{},\"{}\",\"{}\",\"{}\",{}\n",
                col.title.replace('"', "\"\""),
                card.id,
                card.title.replace('"', "\"\""),
                card.description.as_deref().unwrap_or("").replace('"', "\"\""),
                card.tags.join(",").replace('"', "\"\""),
                card.created_at,
            ));
        }
    }

    // 甘特图任务
    csv.push_str("\n=== 甘特图任务 ===\n");
    csv.push_str("任务ID,名称,开始日期,持续天数,依赖,进度,创建时间\n");
    for task in &export.gantt_tasks {
        let deps: Vec<String> = task.dependencies.iter().map(|d| d.to_string()).collect();
        csv.push_str(&format!(
            "{},\"{}\",{},{},\"{}\",{:.1},{}\n",
            task.id,
            task.name.replace('"', "\"\""),
            task.start_date,
            task.duration_days,
            deps.join(","),
            task.progress,
            task.created_at,
        ));
    }

    Ok(csv)
}

/// 导入项目（支持完整 JSON 和简单项目 JSON）
#[tauri::command]
pub fn import_project(db: State<'_, DbConn>, file_path: String) -> Result<crate::db::models::Project, String> {
    let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;

    // 尝试解析为完整导出格式
    if let Ok(export) = serde_json::from_str::<ProjectExport>(&content) {
        return import_full_project(db, export);
    }

    // 回退为简单项目格式
    let project: crate::db::models::Project =
        serde_json::from_str(&content).map_err(|e| format!("无法解析项目文件: {e}"))?;

    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO projects (name, description, project_number, project_type, status, start_date, end_date, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![project.name, project.description, project.project_number, project.project_type, project.status, project.start_date, project.end_date, project.created_by],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    conn.query_row(
        &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1"),
        [id],
        row_to_project,
    )
    .map_err(|e| e.to_string())
}

fn import_full_project(db: State<'_, DbConn>, export: ProjectExport) -> Result<crate::db::models::Project, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // 创建项目
    conn.execute(
        "INSERT INTO projects (name, description, project_number, project_type, status, start_date, end_date, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![export.project.name, export.project.description, export.project.project_number, export.project.project_type, export.project.status, export.project.start_date, export.project.end_date, export.project.created_by],
    )
    .map_err(|e| e.to_string())?;

    let new_project_id = conn.last_insert_rowid();

    // 导入看板列和卡片
    for col in &export.kanban_columns {
        conn.execute(
            "INSERT INTO kanban_columns (project_id, title, position) VALUES (?1, ?2, ?3)",
            rusqlite::params![new_project_id, col.title, col.position],
        )
        .map_err(|e| e.to_string())?;

        let new_col_id = conn.last_insert_rowid();

        for card in &col.cards {
            let tags_json = serde_json::to_string(&card.tags).unwrap_or_else(|_| "[]".to_string());
            conn.execute(
                "INSERT INTO kanban_cards (column_id, title, description, position, tags) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![new_col_id, card.title, card.description, card.position, tags_json],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // 导入甘特图任务（依赖关系使用旧ID映射）
    let mut gantt_id_map: HashMap<i64, i64> = HashMap::new();
    for task in &export.gantt_tasks {
        conn.execute(
            "INSERT INTO gantt_tasks (project_id, name, start_date, duration_days, dependencies, progress) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![new_project_id, task.name, task.start_date, task.duration_days, "[]", task.progress],
        )
        .map_err(|e| e.to_string())?;

        let new_task_id = conn.last_insert_rowid();
        gantt_id_map.insert(task.id, new_task_id);
    }

    // 更新甘特图任务的依赖关系（映射新ID）
    for task in &export.gantt_tasks {
        if !task.dependencies.is_empty() {
            let new_deps: Vec<i64> = task.dependencies
                .iter()
                .filter_map(|old_id| gantt_id_map.get(old_id).copied())
                .collect();
            let deps_json = serde_json::to_string(&new_deps).unwrap_or_else(|_| "[]".to_string());
            let new_task_id = gantt_id_map[&task.id];
            conn.execute(
                "UPDATE gantt_tasks SET dependencies = ?1 WHERE id = ?2",
                rusqlite::params![deps_json, new_task_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // 返回新创建的项目
    conn.query_row(
        &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1"),
        [new_project_id],
        row_to_project,
    )
    .map_err(|e| e.to_string())
}

/// 导出所有项目为 JSON（完整备份）
#[tauri::command]
pub fn export_all_projects(db: State<'_, DbConn>) -> Result<String, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(&format!("SELECT id FROM projects ORDER BY updated_at DESC"))
        .map_err(|e| e.to_string())?;

    let project_ids: Vec<i64> = stmt
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    drop(stmt);

    let mut exports = Vec::new();
    for pid in project_ids {
        let project = conn
            .query_row(
                &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1"),
                [pid],
                row_to_project,
            )
            .map_err(|e| e.to_string())?;

        let kanban_columns = load_kanban_columns(&conn, pid)?;
        let gantt_tasks = load_gantt_tasks(&conn, pid)?;
        let files = load_project_files(&conn, pid)?;

        exports.push(ProjectExport {
            version: 1,
            project,
            kanban_columns,
            gantt_tasks,
            files,
        });
    }

    serde_json::to_string_pretty(&exports).map_err(|e| e.to_string())
}

/// 从完整备份文件导入多个项目
#[tauri::command]
pub fn import_all_projects(db: State<'_, DbConn>, file_path: String) -> Result<Vec<crate::db::models::Project>, String> {
    let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let exports: Vec<ProjectExport> =
        serde_json::from_str(&content).map_err(|e| format!("无法解析备份文件: {e}"))?;

    let mut imported = Vec::new();
    for export in exports {
        let project = import_full_project_internal(&db, export)?;
        imported.push(project);
    }

    Ok(imported)
}

fn import_full_project_internal(db: &State<'_, DbConn>, export: ProjectExport) -> Result<crate::db::models::Project, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO projects (name, description, project_number, project_type, status, start_date, end_date, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![export.project.name, export.project.description, export.project.project_number, export.project.project_type, export.project.status, export.project.start_date, export.project.end_date, export.project.created_by],
    )
    .map_err(|e| e.to_string())?;

    let new_project_id = conn.last_insert_rowid();

    for col in &export.kanban_columns {
        conn.execute(
            "INSERT INTO kanban_columns (project_id, title, position) VALUES (?1, ?2, ?3)",
            rusqlite::params![new_project_id, col.title, col.position],
        )
        .map_err(|e| e.to_string())?;

        let new_col_id = conn.last_insert_rowid();

        for card in &col.cards {
            let tags_json = serde_json::to_string(&card.tags).unwrap_or_else(|_| "[]".to_string());
            conn.execute(
                "INSERT INTO kanban_cards (column_id, title, description, position, tags) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![new_col_id, card.title, card.description, card.position, tags_json],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    let mut gantt_id_map: HashMap<i64, i64> = HashMap::new();
    for task in &export.gantt_tasks {
        conn.execute(
            "INSERT INTO gantt_tasks (project_id, name, start_date, duration_days, dependencies, progress) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![new_project_id, task.name, task.start_date, task.duration_days, "[]", task.progress],
        )
        .map_err(|e| e.to_string())?;

        let new_task_id = conn.last_insert_rowid();
        gantt_id_map.insert(task.id, new_task_id);
    }

    for task in &export.gantt_tasks {
        if !task.dependencies.is_empty() {
            let new_deps: Vec<i64> = task.dependencies
                .iter()
                .filter_map(|old_id| gantt_id_map.get(old_id).copied())
                .collect();
            let deps_json = serde_json::to_string(&new_deps).unwrap_or_else(|_| "[]".to_string());
            let new_task_id = gantt_id_map[&task.id];
            conn.execute(
                "UPDATE gantt_tasks SET dependencies = ?1 WHERE id = ?2",
                rusqlite::params![deps_json, new_task_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    conn.query_row(
        &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1"),
        [new_project_id],
        row_to_project,
    )
    .map_err(|e| e.to_string())
}

// ── 全局搜索 ──────────────────────────────────────────────────

#[tauri::command]
pub fn global_search(db: State<'_, DbConn>, query: String) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let conn = db.lock().map_err(|e| e.to_string())?;
    let pattern = format!("%{}%", query.trim());
    let mut results = Vec::new();

    // 搜索项目
    {
        let mut stmt = conn
            .prepare("SELECT id, name, COALESCE(description, ''), id FROM projects WHERE name LIKE ?1 OR description LIKE ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&pattern], |row| {
                Ok(SearchResult {
                    result_type: "project".to_string(),
                    id: row.get(0)?,
                    title: row.get(1)?,
                    detail: row.get(2)?,
                    project_id: row.get(3)?,
                    project_name: row.get::<_, String>(1)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
    }

    // 搜索看板卡片
    {
        let mut stmt = conn
            .prepare(
                "SELECT c.id, c.title, COALESCE(c.description, ''), kc.project_id, p.name \
                 FROM kanban_cards c \
                 JOIN kanban_columns kc ON c.column_id = kc.id \
                 JOIN projects p ON kc.project_id = p.id \
                 WHERE c.title LIKE ?1 OR c.description LIKE ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&pattern], |row| {
                Ok(SearchResult {
                    result_type: "card".to_string(),
                    id: row.get(0)?,
                    title: row.get(1)?,
                    detail: row.get(2)?,
                    project_id: row.get(3)?,
                    project_name: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
    }

    // 搜索甘特图任务
    {
        let mut stmt = conn
            .prepare(
                "SELECT t.id, t.name, '', t.project_id, p.name \
                 FROM gantt_tasks t \
                 JOIN projects p ON t.project_id = p.id \
                 WHERE t.name LIKE ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&pattern], |row| {
                Ok(SearchResult {
                    result_type: "task".to_string(),
                    id: row.get(0)?,
                    title: row.get(1)?,
                    detail: String::new(),
                    project_id: row.get(3)?,
                    project_name: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
    }

    Ok(results)
}

// ── 通知历史 ──────────────────────────────────────────────────

const NOTIFICATION_KEY: &str = "notification_history";

#[tauri::command]
pub fn get_notifications(db: State<'_, DbConn>) -> Result<Vec<NotificationRecord>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let json: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [NOTIFICATION_KEY],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "[]".to_string());

    let notifications: Vec<NotificationRecord> =
        serde_json::from_str(&json).unwrap_or_default();
    Ok(notifications)
}

#[tauri::command]
pub fn add_notification(
    db: State<'_, DbConn>,
    id: String,
    type_: String,
    title: String,
    message: String,
    link: Option<String>,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let json: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [NOTIFICATION_KEY],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "[]".to_string());

    let mut notifications: Vec<NotificationRecord> =
        serde_json::from_str(&json).unwrap_or_default();

    notifications.push(NotificationRecord {
        id,
        type_,
        title,
        message,
        read: false,
        created_at: chrono::Utc::now().to_rfc3339(),
        link,
    });

    let new_json = serde_json::to_string(&notifications).unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![NOTIFICATION_KEY, new_json],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn mark_notification_read(db: State<'_, DbConn>, id: String) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let json: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [NOTIFICATION_KEY],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "[]".to_string());

    let mut notifications: Vec<NotificationRecord> =
        serde_json::from_str(&json).unwrap_or_default();

    for n in &mut notifications {
        if n.id == id {
            n.read = true;
        }
    }

    let new_json = serde_json::to_string(&notifications).unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![NOTIFICATION_KEY, new_json],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn clear_notifications(db: State<'_, DbConn>) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![NOTIFICATION_KEY, "[]"],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn mark_all_notifications_read(db: State<'_, DbConn>) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let json: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [NOTIFICATION_KEY],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "[]".to_string());

    let mut notifications: Vec<NotificationRecord> =
        serde_json::from_str(&json).unwrap_or_default();

    for n in &mut notifications {
        n.read = true;
    }

    let new_json = serde_json::to_string(&notifications).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![NOTIFICATION_KEY, new_json],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── 通知偏好设置 ──────────────────────────────────────────────

const NOTIFICATION_PREFS_KEY: &str = "notification_preferences";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NotificationPreferences {
    pub project_created: bool,
    pub project_deleted: bool,
    pub project_status_changed: bool,
    pub card_created: bool,
    pub card_moved: bool,
    pub file_uploaded: bool,
    pub file_deleted: bool,
    pub file_received: bool,
    pub share_started: bool,
    pub share_stopped: bool,
    pub native_notifications: bool,
}

impl Default for NotificationPreferences {
    fn default() -> Self {
        Self {
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
        }
    }
}

#[tauri::command]
pub fn get_notification_preferences(db: State<'_, DbConn>) -> Result<NotificationPreferences, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let json: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [NOTIFICATION_PREFS_KEY],
            |row| row.get(0),
        )
        .ok();

    match json {
        Some(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        None => Ok(NotificationPreferences::default()),
    }
}

#[tauri::command]
pub fn update_notification_preferences(
    db: State<'_, DbConn>,
    preferences: NotificationPreferences,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let json = serde_json::to_string(&preferences).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![NOTIFICATION_PREFS_KEY, json],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── 文件夹扫描与导入 ──────────────────────────────────────────

/// 将文件夹模板转为正则，提取 {code} 和 {name} 的捕获组
fn template_to_regex(template: &str) -> Regex {
    let mut pattern = String::from("^");
    let mut chars = template.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '{' {
            let mut key = String::new();
            for ch in chars.by_ref() {
                if ch == '}' { break; }
                key.push(ch);
            }
            match key.as_str() {
                "code" => pattern.push_str(r"(.+?)"),
                "name" => pattern.push_str(r"(.+)"),
                _ => {
                    pattern.push('{');
                    pattern.push_str(&key);
                    pattern.push('}');
                }
            }
        } else if c.is_whitespace() {
            // 模板中的空白字符匹配零个或多个空白字符，兼容有无空格的分隔方式
            pattern.push_str(r"\s*");
            while chars.peek().map_or(false, |c| c.is_whitespace()) {
                chars.next();
            }
        } else {
            pattern.push_str(&regex::escape(&c.to_string()));
        }
    }
    pattern.push('$');
    Regex::new(&pattern).unwrap_or_else(|_| Regex::new(r"^(.+)$").unwrap())
}

/// 从文本中提取日期（支持 YYYY-MM-DD / YYYYMMDD / YYMMDD / YYYY.MM.DD 等）
/// 日期可以嵌在字符串中，如 "TB-260407-02" 中的 "260407"
fn extract_date(text: &str) -> Option<String> {
    // YYYY-MM-DD 或 YYYY.MM.DD 或 YYYY/MM/DD
    let re_iso = Regex::new(r"\b(\d{4})[-./](\d{2})[-./](\d{2})\b").ok()?;
    if let Some(caps) = re_iso.captures(text) {
        return Some(format!("{}-{}-{}", &caps[1], &caps[2], &caps[3]));
    }
    // YYYYMMDD（8 位连续数字）
    let re_ymd8 = Regex::new(r"\b(\d{4})(\d{2})(\d{2})\b").ok()?;
    for caps in re_ymd8.captures_iter(text) {
        let y: i32 = caps[1].parse().ok()?;
        let m: i32 = caps[2].parse().ok()?;
        let d: i32 = caps[3].parse().ok()?;
        if (2000..=2099).contains(&y) && (1..=12).contains(&m) && (1..=31).contains(&d) {
            return Some(format!("{}-{}-{}", &caps[1], &caps[2], &caps[3]));
        }
    }
    // YYMMDD（6 位连续数字，支持嵌在编号中如 "TB-260407-02"）
    let re_ymd6 = Regex::new(r"\b(\d{2})(\d{2})(\d{2})\b").ok()?;
    for caps in re_ymd6.captures_iter(text) {
        let _y: i32 = caps[1].parse().ok()?;
        let m: i32 = caps[2].parse().ok()?;
        let d: i32 = caps[3].parse().ok()?;
        if (1..=12).contains(&m) && (1..=31).contains(&d) {
            return Some(format!("20{}-{}-{}", &caps[1], &caps[2], &caps[3]));
        }
    }
    None
}

/// 从多个来源按优先级提取开始日期：
/// 1. 编号中的日期（如 TB-260407-02 → 2026-04-07）
/// 2. 文件夹名称中疑似日期格式的部分
/// 3. 导入路径中是否包含日期信息
/// 4. 文件夹自身的最后修改日期
fn extract_start_date(code: Option<&str>, folder_name: &str, parent_path: &str, folder_path: &std::path::Path) -> Option<String> {
    // 1. 编号中的日期
    if let Some(c) = code {
        if let Some(d) = extract_date(c) {
            return Some(d);
        }
    }
    // 2. 文件夹名称中的日期
    if let Some(d) = extract_date(folder_name) {
        return Some(d);
    }
    // 3. 导入路径中的日期
    if let Some(d) = extract_date(parent_path) {
        return Some(d);
    }
    // 4. 文件夹最后修改日期
    std::fs::metadata(folder_path).ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| {
            let dt: chrono::DateTime<chrono::Utc> = t.into();
            Some(dt.format("%Y-%m-%d").to_string())
        })
}

/// 递归遍历文件夹，返回所有文件中最晚的修改日期
fn get_folder_latest_date(folder_path: &std::path::Path) -> Option<String> {
    let mut latest: Option<std::time::SystemTime> = None;
    // 先检查文件夹自身
    if let Ok(meta) = std::fs::metadata(folder_path) {
        if let Ok(m) = meta.modified() {
            latest = Some(m);
        }
    }
    // 递归遍历
    walk_dir(folder_path, &mut latest);
    latest.and_then(|t| {
        let dt: chrono::DateTime<chrono::Utc> = t.into();
        Some(dt.format("%Y-%m-%d").to_string())
    })
}

fn walk_dir(dir: &std::path::Path, latest: &mut Option<std::time::SystemTime>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk_dir(&path, latest);
            } else if let Ok(meta) = entry.metadata() {
                if let Ok(m) = meta.modified() {
                    if latest.map_or(true, |l| m > l) {
                        *latest = Some(m);
                    }
                }
            }
        }
    }
}

/// 扫描指定路径下的一级子文件夹，尝试识别项目信息
#[tauri::command]
pub fn scan_project_folders(db: State<'_, DbConn>, parent_path: String) -> Result<Vec<ScannedFolder>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // 读取文件夹模板
    let folder_template: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'folder_template'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "[{code}] {name}".to_string());

    let tpl_regex = template_to_regex(&folder_template);
    log::info!("[scan] folder_template='{}', regex='{}'", folder_template, tpl_regex.as_str());

    // 读取项目分类及关键词
    let types_json: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'project_types'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "[]".to_string());

    let types: Vec<serde_json::Value> = serde_json::from_str(&types_json).unwrap_or_default();

    // 扫描目录
    let entries = std::fs::read_dir(&parent_path)
        .map_err(|e| format!("读取目录失败: {e}"))?;

    let mut results = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let folder_name = entry.file_name().to_string_lossy().to_string();

        // ① 尝试模板匹配
        if let Some(caps) = tpl_regex.captures(&folder_name) {
            let code = caps.get(1).map(|m| m.as_str().to_string());
            let parsed_name = caps.get(2).map(|m| m.as_str().to_string());

            // 多级回退提取开始日期
            let inferred_date = extract_start_date(code.as_deref(), &folder_name, &parent_path, &path);
            // 文件夹内最晚文件修改日期 → 终止日期
            let inferred_end_date = get_folder_latest_date(&path);
            // 从编号前缀反查分类
            let inferred_type = code.as_ref().and_then(|c| {
                let prefix = c.split('-').next().unwrap_or("");
                types.iter().find(|t| {
                    t.get("prefix").and_then(|v| v.as_str()) == Some(prefix)
                }).and_then(|t| t.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()))
            });

            log::info!("[scan] MATCHED: folder={}, code={:?}, name={:?}, type={:?}, date={:?}",
                folder_name, code, parsed_name, inferred_type, inferred_date);

            results.push(ScannedFolder {
                folder_name,
                path: path.to_string_lossy().to_string(),
                matched: true,
                parsed_code: code,
                parsed_name,
                inferred_type,
                inferred_date,
                inferred_end_date,
            });
        } else {
            // ② 关键词匹配
            let name_lower = folder_name.to_lowercase();

            let inferred_type = types.iter().find_map(|t| {
                let type_name = t.get("name")?.as_str()?;
                let keywords = t.get("keywords")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_lowercase())).collect::<Vec<_>>())
                    .unwrap_or_default();
                if keywords.iter().any(|kw| name_lower.contains(kw)) {
                    Some(type_name.to_string())
                } else {
                    None
                }
            });

            let inferred_date = extract_start_date(None, &folder_name, &parent_path, &path);
            let inferred_end_date = get_folder_latest_date(&path);

            // 清理文件夹名：作为项目名建议
            let mut clean_name = folder_name.clone();
            // 如果文件夹名包含 [xxx] 模式，优先提取 ] 后面的内容作为名称
            if let Some(bracket_end) = clean_name.find(']') {
                let after = clean_name[bracket_end + 1..].trim_start().to_string();
                if !after.is_empty() {
                    clean_name = after;
                }
            }
            // 去掉常见日期格式
            let date_patterns = [
                Regex::new(r"\d{4}[-./]\d{2}[-./]\d{2}").ok(),
                Regex::new(r"\d{8}").ok(),
                Regex::new(r"\d{6}").ok(),
            ];
            for pat in date_patterns.into_iter().flatten() {
                clean_name = pat.replace(&clean_name, "").to_string();
            }
            // 去掉匹配的关键词（大小写不敏感）
            if let Some(ref ty) = inferred_type {
                if let Some(t) = types.iter().find(|t| t.get("name").and_then(|v| v.as_str()) == Some(ty)) {
                    if let Some(kws) = t.get("keywords").and_then(|v| v.as_array()) {
                        for kw in kws.iter().filter_map(|v| v.as_str()) {
                            if let Ok(re) = Regex::new(&format!("(?i){}", regex::escape(kw))) {
                                clean_name = re.replace_all(&clean_name, "").to_string();
                            }
                        }
                    }
                }
            }
            // 压缩因移除内容产生的连续重复标点符号
            if let Ok(re) = Regex::new(r"[-_.]{2,}") {
                clean_name = re.replace_all(&clean_name, "-").to_string();
            }
            // 去掉首尾多余符号和空白
            clean_name = clean_name.trim_matches(|c: char| c == '-' || c == '_' || c == '.' || c == ' ').to_string();

            log::info!("[scan] UNMATCHED: folder={}, clean_name={:?}, type={:?}, date={:?}",
                folder_name, clean_name, inferred_type, inferred_date);

            results.push(ScannedFolder {
                folder_name,
                path: path.to_string_lossy().to_string(),
                matched: false,
                parsed_code: None,
                parsed_name: if clean_name.is_empty() { None } else { Some(clean_name) },
                inferred_type,
                inferred_date,
                inferred_end_date,
            });
        }
    }

    // 已匹配的排前面
    results.sort_by(|a, b| b.matched.cmp(&a.matched));
    Ok(results)
}

/// 从已有的文件夹导入为项目
#[tauri::command]
pub fn import_project_from_folder(
    app: AppHandle,
    db: State<'_, DbConn>,
    parent_path: String,
    folder_name: String,
    name: String,
    project_number: Option<String>,
    project_type: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<crate::db::models::Project, String> {
    use super::projects::generate_project_number;
    use super::projects::get_system_username;

    let conn = db.lock().map_err(|e| e.to_string())?;
    let p_type = project_type.unwrap_or_default();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // 优先使用从文件夹名解析出的编号，否则自动生成
    let project_number = project_number
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| generate_project_number(&conn, &p_type, &name));
    let full_path = std::path::Path::new(&parent_path).join(&folder_name);
    let folder_path = full_path.to_string_lossy().to_string();

    log::info!("[import] name={}, project_number={}, p_type={}, start_date={:?}, end_date={:?}, folder_path={}",
        name, project_number, p_type, start_date, end_date, folder_path);

    conn.execute(
        "INSERT INTO projects (name, description, project_number, project_type, status, start_date, end_date, status_changed_at, created_by, folder_path)
         VALUES (?1, '', ?2, ?3, 'planning', ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![name, project_number, p_type, start_date, end_date, now, get_system_username(), folder_path],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    log::info!("[import] Inserted project id={}", id);

    conn.query_row(
        &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1"),
        [id],
        row_to_project,
    )
    .map_err(|e| e.to_string())
    .inspect(|project| {
        log::info!("[import] Returned project: id={}, number={:?}, name={}, type={:?}, date={:?}, folder={:?}",
            project.id, project.project_number, project.name, project.project_type, project.start_date, project.folder_path);
        let _ = app.emit(crate::events::EVENT_PROJECT_UPDATED, project.id);
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_regex_compiles() {
        let re = Regex::new(r"\b(\d{4})[-./](\d{2})[-./](\d{2})\b");
        assert!(re.is_ok(), "ISO regex failed: {:?}", re.err());
        let re = Regex::new(r"\b(\d{2})(\d{2})(\d{2})\b");
        assert!(re.is_ok(), "YYMMDD regex failed: {:?}", re.err());
        let re = Regex::new(r"\b(\d{4})(\d{2})(\d{2})\b");
        assert!(re.is_ok(), "YYYYMMDD regex failed: {:?}", re.err());
    }

    #[test]
    fn test_extract_date_from_code() {
        assert_eq!(extract_date("TB-260407-02"), Some("2026-04-07".to_string()));
        assert_eq!(extract_date("RD-251215-001"), Some("2025-12-15".to_string()));
        assert_eq!(extract_date("PRJ-20260407-01"), Some("2026-04-07".to_string()));
    }

    #[test]
    fn test_extract_date_iso() {
        assert_eq!(extract_date("2026-04-07"), Some("2026-04-07".to_string()));
        assert_eq!(extract_date("2026.04.07"), Some("2026-04-07".to_string()));
    }

    #[test]
    fn test_extract_start_date_priority() {
        // 编号中有日期时，应优先使用编号中的日期
        let result = extract_start_date(
            Some("TB-260407-02"),
            "[TB-260407-02]西南油田天然气内控总厂",
            "/some/path/2025",
            std::path::Path::new("."),
        );
        assert_eq!(result, Some("2026-04-07".to_string()));
    }
}
