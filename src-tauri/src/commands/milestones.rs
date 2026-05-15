use tauri::{AppHandle, Emitter, State};

use crate::db::models::ProjectMilestone;
use crate::db::DbConn;
use crate::events;

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