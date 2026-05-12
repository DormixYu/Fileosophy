use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

use crate::db::models::{Project, ProjectMilestone, ProjectStatusHistory};
use crate::events;

pub type DbConn = Mutex<rusqlite::Connection>;

/// 与前端 DEFAULT_PROJECT_TYPES 一致的默认分类 JSON
const DEFAULT_PROJECT_TYPES_JSON: &str = "[\
  {\"id\":\"rd\",\"name\":\"研发\",\"prefix\":\"RD\",\"keywords\":[\"研发\",\"开发\",\"研发项目\",\"RD\"]},\
  {\"id\":\"design\",\"name\":\"设计\",\"prefix\":\"DS\",\"keywords\":[\"设计\",\"UI\",\"UX\",\"DS\"]},\
  {\"id\":\"ops\",\"name\":\"运营\",\"prefix\":\"OP\",\"keywords\":[\"运营\",\"推广\",\"活动\",\"OP\"]},\
  {\"id\":\"construction\",\"name\":\"施工\",\"prefix\":\"CS\",\"keywords\":[\"施工\",\"工程\",\"建设\",\"CS\"]},\
  {\"id\":\"other\",\"name\":\"其他\",\"prefix\":\"OT\",\"keywords\":[\"其他\",\"杂项\",\"OT\"]}\
]";

/// 从 settings 表读取文件夹模板，生成项目文件夹名
pub fn generate_folder_name(conn: &rusqlite::Connection, project_number: &str, name: &str) -> String {
    let template: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'folder_template'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "[{code}] {name}".to_string());

    template
        .replace("{code}", project_number)
        .replace("{name}", name)
}

/// 从查询行构造 Project 结构体（公共函数，供其他模块复用）
pub fn row_to_project(row: &rusqlite::Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        project_number: row.get(5)?,
        project_type: row.get(6)?,
        status: row.get(7)?,
        start_date: row.get(8)?,
        end_date: row.get(9)?,
        status_changed_at: row.get(10)?,
        created_by: row.get(11)?,
        folder_path: row.get(12)?,
    })
}

pub const PROJECT_COLUMNS: &str =
    "id, name, description, created_at, updated_at, \
     project_number, project_type, status, start_date, end_date, status_changed_at, created_by, folder_path";

#[tauri::command]
pub fn get_all_projects(db: State<'_, DbConn>) -> Result<Vec<Project>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {PROJECT_COLUMNS} FROM projects ORDER BY updated_at DESC"
        ))
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], row_to_project)
        .map_err(|e| e.to_string())?;

    let mut projects = Vec::new();
    for row in rows {
        projects.push(row.map_err(|e| e.to_string())?);
    }
    Ok(projects)
}

#[tauri::command]
pub fn get_project_by_id(db: State<'_, DbConn>, id: i64) -> Result<Project, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1"),
        [id],
        row_to_project,
    )
    .map_err(|e| e.to_string())
}

/// 从 settings 表读取编号模板，自动生成项目编号
pub fn generate_project_number(conn: &rusqlite::Connection, project_type: &str, name: &str) -> String {
    // 读取编号模板，默认 {prefix}-{date}-{sequence} {name}
    let template: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'number_template'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "{prefix}-{date}-{sequence}".to_string());

    // 读取分类前缀
    let prefix: String = if !project_type.is_empty() {
        let types_json: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'project_types'",
                [],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| DEFAULT_PROJECT_TYPES_JSON.to_string());

        serde_json::from_str::<Vec<serde_json::Value>>(&types_json)
            .unwrap_or_default()
            .iter()
            .find(|t| t.get("name").and_then(|v| v.as_str()) == Some(project_type))
            .and_then(|t| t.get("prefix").and_then(|v| v.as_str()))
            .unwrap_or("PRJ")
            .to_string()
    } else {
        "PRJ".to_string()
    };

    // 日期格式（读取设置，默认 YYMMDD）
    let date_fmt: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'date_format'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "YYMMDD".to_string());

    let now = chrono::Local::now();
    let date_str = if date_fmt == "YYYYMMDD" {
        now.format("%Y%m%d").to_string()
    } else {
        now.format("%y%m%d").to_string()
    };

    // 流水号：当日同前缀的项目计数 + 1
    let safe_prefix = prefix.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
    let pattern = format!("{}-{}%", safe_prefix, date_str);
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM projects WHERE project_number LIKE ?1 ESCAPE '\\'",
            [&pattern],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let sequence = format!("{:02}", count + 1);

    // 替换模板变量
    template
        .replace("{prefix}", &prefix)
        .replace("{date}", &date_str)
        .replace("{sequence}", &sequence)
        .replace("{name}", name)
}

/// 获取系统用户名
pub fn get_system_username() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "User".to_string())
}

#[tauri::command]
pub fn create_project(
    app: AppHandle,
    db: State<'_, DbConn>,
    name: String,
    description: Option<String>,
    project_type: Option<String>,
    status: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    created_by: Option<String>,
    parent_path: Option<String>,
) -> Result<Project, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let desc = description.unwrap_or_default();
    let p_type = project_type.unwrap_or_default();
    let p_status = status.unwrap_or_else(|| "planning".to_string());
    let p_created_by = created_by.unwrap_or_else(get_system_username);
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // 自动生成项目编号
    let project_number = generate_project_number(&conn, &p_type, &name);

    // 如果未提供 parent_path，尝试从设置读取默认路径
    let resolved_parent = parent_path.or_else(|| {
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'default_project_path'",
            [],
            |row| row.get::<_, String>(0),
        ).ok().filter(|p| !p.is_empty())
    });

    // 如果有路径，生成文件夹名并创建目录
    let folder_path = if let Some(ref parent) = resolved_parent {
        let folder_name = generate_folder_name(&conn, &project_number, &name);
        let full_path = std::path::Path::new(parent).join(&folder_name);
        std::fs::create_dir_all(&full_path).map_err(|e| format!("创建文件夹失败: {e}"))?;
        Some(full_path.to_string_lossy().to_string())
    } else {
        None
    };

    conn.execute(
        "INSERT INTO projects (name, description, project_number, project_type, status, start_date, end_date, status_changed_at, created_by, folder_path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![name, desc, project_number, p_type, p_status, start_date, end_date, now, p_created_by, folder_path],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    // 自动创建看板默认列：待办事项 + 已完成事项
    conn.execute(
        "INSERT INTO kanban_columns (project_id, title, position, column_type) VALUES (?1, '待办事项', 0, 'todo_pending')",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO kanban_columns (project_id, title, position, column_type) VALUES (?1, '已完成事项', 1, 'todo_done')",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1"),
        [id],
        row_to_project,
    )
    .map_err(|e| e.to_string())
    .inspect(|project| {
        let _ = app.emit(events::EVENT_PROJECT_UPDATED, project.id);
        events::emit_notification(&app, "success", "项目已创建", &project.name, Some(&format!("/project/{}", project.id)));
    })
}

#[tauri::command]
pub fn update_project(
    app: AppHandle,
    db: State<'_, DbConn>,
    id: i64,
    name: Option<String>,
    description: Option<String>,
    project_type: Option<String>,
    status: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Project, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // 动态构建 UPDATE 语句
    let mut sets = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    if let Some(ref n) = name {
        sets.push(format!("name = ?{idx}"));
        params.push(Box::new(n.clone()));
        idx += 1;
    }
    if let Some(ref d) = description {
        sets.push(format!("description = ?{idx}"));
        params.push(Box::new(d.clone()));
        idx += 1;
    }
    if let Some(ref pt) = project_type {
        sets.push(format!("project_type = ?{idx}"));
        params.push(Box::new(pt.clone()));
        idx += 1;

        // 项目分类变更时，同步更新编号前缀
        let old_type: Option<String> = conn.query_row(
            "SELECT project_type FROM projects WHERE id = ?1",
            [id],
            |row| row.get::<_, Option<String>>(0),
        ).ok().flatten();

        if old_type.as_deref() != Some(pt.as_str()) {
            let types_json: String = conn.query_row(
                "SELECT value FROM settings WHERE key = 'project_types'",
                [],
                |row| row.get(0),
            ).unwrap_or_else(|_| DEFAULT_PROJECT_TYPES_JSON.to_string());

            let types: Vec<serde_json::Value> = serde_json::from_str(&types_json).unwrap_or_default();

            let old_prefix = old_type.as_ref().and_then(|t| {
                types.iter()
                    .find(|v| v.get("name").and_then(|v| v.as_str()) == Some(t.as_str()))
                    .and_then(|v| v.get("prefix").and_then(|v| v.as_str()))
            }).unwrap_or("PRJ");

            let new_prefix = types.iter()
                .find(|v| v.get("name").and_then(|v| v.as_str()) == Some(pt.as_str()))
                .and_then(|v| v.get("prefix").and_then(|v| v.as_str()))
                .unwrap_or("PRJ");

            let old_number: String = conn.query_row(
                "SELECT COALESCE(project_number, '') FROM projects WHERE id = ?1",
                [id],
                |row| row.get::<_, String>(0),
            ).unwrap_or_default();

            if !old_number.is_empty() && old_number.starts_with(old_prefix) {
                let new_number = old_number.replacen(old_prefix, new_prefix, 1);
                sets.push(format!("project_number = ?{idx}"));
                params.push(Box::new(new_number));
                idx += 1;
            }
        }
    }
    // 状态变更时记录历史
    let old_status: Option<String> = if status.is_some() {
        conn.query_row(
            "SELECT status FROM projects WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .ok()
    } else {
        None
    };

    if let Some(ref s) = status {
        sets.push(format!("status = ?{idx}"));
        params.push(Box::new(s.clone()));
        idx += 1;
        // 状态变更时自动更新 status_changed_at
        sets.push(format!("status_changed_at = datetime('now')"));
    }
    if let Some(ref sd) = start_date {
        sets.push(format!("start_date = ?{idx}"));
        params.push(Box::new(sd.clone()));
        idx += 1;
    }
    if let Some(ref ed) = end_date {
        sets.push(format!("end_date = ?{idx}"));
        params.push(Box::new(ed.clone()));
        idx += 1;
    }

    if sets.is_empty() {
        return get_project_by_id_inner(&conn, id);
    }

    sets.push(format!("updated_at = datetime('now')"));
    params.push(Box::new(id));

    let sql = format!(
        "UPDATE projects SET {} WHERE id = ?{}",
        sets.join(", "),
        idx
    );

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| e.to_string())?;

    // 记录状态变更历史
    if let Some(ref new_status) = status {
        if old_status.as_ref() != Some(new_status) {
            conn.execute(
                "INSERT INTO project_status_history (project_id, status, changed_at) VALUES (?1, ?2, datetime('now'))",
                rusqlite::params![id, new_status.as_str()],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    get_project_by_id_inner(&conn, id).inspect(|project| {
        let _ = app.emit(events::EVENT_PROJECT_UPDATED, project.id);
        // 仅当状态变更时发送通知
        if status.is_some() && old_status.as_ref() != status.as_ref() {
            let status_label = match project.status.as_deref() {
                Some("planning") => "规划中",
                Some("in_progress") => "进行中",
                Some("on_hold") => "已暂停",
                Some("completed") => "已完成",
                Some("cancelled") => "已取消",
                _ => "未知",
            };
            events::emit_notification(&app, "info", "项目状态变更", &format!("{}: {}", project.name, status_label), Some(&format!("/project/{}", project.id)));
        }
    })
}

#[tauri::command]
pub fn delete_project(app: AppHandle, db: State<'_, DbConn>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    // 获取项目名称用于通知
    let name: String = conn.query_row(
        "SELECT name FROM projects WHERE id = ?1", [id],
        |row| row.get(0),
    ).unwrap_or_else(|_| "项目".to_string());
    conn.execute("DELETE FROM projects WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    let _ = app.emit(events::EVENT_PROJECT_UPDATED, id);
    events::emit_notification(&app, "warning", "项目已删除", &name, None);

    Ok(())
}

pub fn get_project_by_id_inner(
    conn: &rusqlite::Connection,
    id: i64,
) -> Result<Project, String> {
    conn.query_row(
        &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1"),
        [id],
        row_to_project,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("文件或文件夹不存在".to_string());
    }
    // 禁止含 shell 元字符的路径（防止命令注入）
    if path.contains('&') || path.contains('|') || path.contains(';')
        || path.contains('^') || path.contains('%') || path.contains('<')
        || path.contains('>') || path.contains('(') || path.contains(')')
        || path.contains('!')
    {
        return Err("路径包含非法字符".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &path])
            .spawn()
            .map_err(|e| format!("打开文件失败: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开文件失败: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开文件失败: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_local_ip() -> Result<String, String> {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .map_err(|e| format!("获取本机IP失败: {e}"))
}

// ── 状态变更历史 ──────────────────────────────────────────────

fn row_to_status_history(row: &rusqlite::Row) -> rusqlite::Result<ProjectStatusHistory> {
    Ok(ProjectStatusHistory {
        id: row.get(0)?,
        project_id: row.get(1)?,
        status: row.get(2)?,
        changed_at: row.get(3)?,
    })
}

#[tauri::command]
pub fn get_project_status_history(
    db: State<'_, DbConn>,
    project_id: i64,
) -> Result<Vec<ProjectStatusHistory>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, status, changed_at FROM project_status_history \
             WHERE project_id = ?1 ORDER BY changed_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([project_id], row_to_status_history)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_all_status_histories(
    db: State<'_, DbConn>,
) -> Result<Vec<ProjectStatusHistory>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, status, changed_at FROM project_status_history ORDER BY changed_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_status_history)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

// ── 状态历史 CRUD ────────────────────────────────────────────────

#[tauri::command]
pub fn add_status_history(
    app: AppHandle,
    db: State<'_, DbConn>,
    project_id: i64,
    status: String,
    changed_at: String,
) -> Result<ProjectStatusHistory, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO project_status_history (project_id, status, changed_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![project_id, status, changed_at],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let result = ProjectStatusHistory { id, project_id, status, changed_at };
    let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);
    Ok(result)
}

#[tauri::command]
pub fn update_status_history(
    app: AppHandle,
    db: State<'_, DbConn>,
    id: i64,
    status: String,
    changed_at: String,
) -> Result<ProjectStatusHistory, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE project_status_history SET status = ?1, changed_at = ?2 WHERE id = ?3",
        rusqlite::params![status, changed_at, id],
    ).map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT id, project_id, status, changed_at FROM project_status_history WHERE id = ?1",
        [id], row_to_status_history,
    ).map_err(|e| e.to_string())?;
    let _ = app.emit(events::EVENT_PROJECT_UPDATED, result.project_id);
    Ok(result)
}

#[tauri::command]
pub fn delete_status_history(
    app: AppHandle,
    db: State<'_, DbConn>,
    id: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    // 先查询 project_id，删除后 emit
    let project_id: i64 = conn.query_row(
        "SELECT project_id FROM project_status_history WHERE id = ?1",
        [id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM project_status_history WHERE id = ?1",
        [id],
    ).map_err(|e| e.to_string())?;
    let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);
    Ok(())
}

// ── 里程碑 ─────────────────────────────────────────────────────

fn row_to_milestone(row: &rusqlite::Row) -> rusqlite::Result<ProjectMilestone> {
    Ok(ProjectMilestone {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        date: row.get(3)?,
        description: row.get(4)?,
        created_at: row.get(5)?,
    })
}

#[tauri::command]
pub fn add_project_milestone(
    app: AppHandle,
    db: State<'_, DbConn>,
    project_id: i64,
    name: String,
    date: String,
    description: Option<String>,
) -> Result<ProjectMilestone, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let desc = description.unwrap_or_default();
    conn.execute(
        "INSERT INTO project_milestones (project_id, name, date, description) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![project_id, name, date, desc],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, project_id, name, date, description, created_at FROM project_milestones WHERE id = ?1",
        [id],
        row_to_milestone,
    )
    .map_err(|e| e.to_string())
    .inspect(|_| {
        let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);
    })
}

#[tauri::command]
pub fn update_project_milestone(
    app: AppHandle,
    db: State<'_, DbConn>,
    id: i64,
    name: Option<String>,
    date: Option<String>,
    description: Option<String>,
) -> Result<ProjectMilestone, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let project_id: i64 = conn
        .query_row(
            "SELECT project_id FROM project_milestones WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut sets = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    if let Some(ref n) = name {
        sets.push(format!("name = ?{idx}"));
        params.push(Box::new(n.clone()));
        idx += 1;
    }
    if let Some(ref d) = date {
        sets.push(format!("date = ?{idx}"));
        params.push(Box::new(d.clone()));
        idx += 1;
    }
    if let Some(ref d) = description {
        sets.push(format!("description = ?{idx}"));
        params.push(Box::new(d.clone()));
        idx += 1;
    }

    if !sets.is_empty() {
        params.push(Box::new(id));
        let sql = format!(
            "UPDATE project_milestones SET {} WHERE id = ?{}",
            sets.join(", "),
            idx
        );
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())
            .map_err(|e| e.to_string())?;
    }

    conn.query_row(
        "SELECT id, project_id, name, date, description, created_at FROM project_milestones WHERE id = ?1",
        [id],
        row_to_milestone,
    )
    .map_err(|e| e.to_string())
    .inspect(|_| {
        let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);
    })
}

#[tauri::command]
pub fn delete_project_milestone(
    app: AppHandle,
    db: State<'_, DbConn>,
    id: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let project_id: i64 = conn
        .query_row(
            "SELECT project_id FROM project_milestones WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM project_milestones WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);

    Ok(())
}

#[tauri::command]
pub fn get_project_milestones(
    db: State<'_, DbConn>,
    project_id: i64,
) -> Result<Vec<ProjectMilestone>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, name, date, description, created_at FROM project_milestones \
             WHERE project_id = ?1 ORDER BY date ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([project_id], row_to_milestone)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_all_milestones(
    db: State<'_, DbConn>,
) -> Result<Vec<ProjectMilestone>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, name, date, description, created_at FROM project_milestones ORDER BY date ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_milestone)
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}
