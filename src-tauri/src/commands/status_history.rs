use tauri::{AppHandle, Emitter, State};

use crate::db::models::ProjectStatusHistory;
use crate::db::DbConn;
use crate::events;

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