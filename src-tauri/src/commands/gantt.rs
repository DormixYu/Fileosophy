use super::projects::DbConn;
use crate::db::models::GanttTask;
use crate::events;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn get_gantt_data(db: State<'_, DbConn>, project_id: i64) -> Result<Vec<GanttTask>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, name, start_date, duration_days, dependencies, progress, created_at
             FROM gantt_tasks WHERE project_id = ?1 ORDER BY start_date",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([project_id], |row| {
            let deps_str: String = row.get(5)?;
            let deps: Vec<i64> = serde_json::from_str(&deps_str).unwrap_or_default();
            Ok(GanttTask {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                start_date: row.get(3)?,
                duration_days: row.get(4)?,
                dependencies: deps,
                progress: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();
    for row in rows {
        tasks.push(row.map_err(|e| e.to_string())?);
    }
    Ok(tasks)
}

#[tauri::command]
pub fn add_gantt_task(
    app: AppHandle,
    db: State<'_, DbConn>,
    project_id: i64,
    name: String,
    start_date: String,
    duration_days: i32,
    dependencies: Option<Vec<i64>>,
) -> Result<GanttTask, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let deps = dependencies.unwrap_or_default();
    let deps_json = serde_json::to_string(&deps).unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "INSERT INTO gantt_tasks (project_id, name, start_date, duration_days, dependencies)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![project_id, name, start_date, duration_days, deps_json],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    conn.query_row(
        "SELECT id, project_id, name, start_date, duration_days, dependencies, progress, created_at
         FROM gantt_tasks WHERE id = ?1",
        [id],
        |row| {
            let deps_str: String = row.get(5)?;
            let deps: Vec<i64> = serde_json::from_str(&deps_str).unwrap_or_default();
            Ok(GanttTask {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                start_date: row.get(3)?,
                duration_days: row.get(4)?,
                dependencies: deps,
                progress: row.get(6)?,
                created_at: row.get(7)?,
            })
        },
    )
    .map_err(|e| e.to_string())
    .inspect(|_| {
        let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);
    })
}

#[tauri::command]
pub fn update_gantt_task(
    app: AppHandle,
    db: State<'_, DbConn>,
    id: i64,
    name: Option<String>,
    start_date: Option<String>,
    duration_days: Option<i32>,
    dependencies: Option<Vec<i64>>,
    progress: Option<f64>,
) -> Result<GanttTask, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let mut sets = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    if let Some(ref n) = name {
        sets.push(format!("name = ?{idx}"));
        params.push(Box::new(n.clone()));
        idx += 1;
    }
    if let Some(ref sd) = start_date {
        sets.push(format!("start_date = ?{idx}"));
        params.push(Box::new(sd.clone()));
        idx += 1;
    }
    if let Some(dd) = duration_days {
        sets.push(format!("duration_days = ?{idx}"));
        params.push(Box::new(dd));
        idx += 1;
    }
    if let Some(ref deps) = dependencies {
        let deps_json = serde_json::to_string(deps).unwrap_or_else(|_| "[]".to_string());
        sets.push(format!("dependencies = ?{idx}"));
        params.push(Box::new(deps_json));
        idx += 1;
    }
    if let Some(p) = progress {
        sets.push(format!("progress = ?{idx}"));
        params.push(Box::new(p));
        idx += 1;
    }

    if !sets.is_empty() {
        params.push(Box::new(id));
        let sql = format!(
            "UPDATE gantt_tasks SET {} WHERE id = ?{}",
            sets.join(", "),
            idx
        );
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())
            .map_err(|e| e.to_string())?;
    }

    conn.query_row(
        "SELECT id, project_id, name, start_date, duration_days, dependencies, progress, created_at
         FROM gantt_tasks WHERE id = ?1",
        [id],
        |row| {
            let deps_str: String = row.get(5)?;
            let deps: Vec<i64> = serde_json::from_str(&deps_str).unwrap_or_default();
            Ok(GanttTask {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                start_date: row.get(3)?,
                duration_days: row.get(4)?,
                dependencies: deps,
                progress: row.get(6)?,
                created_at: row.get(7)?,
            })
        },
    )
    .map_err(|e| e.to_string())
    .inspect(|task| {
        let _ = app.emit(events::EVENT_PROJECT_UPDATED, task.project_id);
    })
}

#[tauri::command]
pub fn delete_gantt_task(app: AppHandle, db: State<'_, DbConn>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // 先获取 project_id 用于事件通知
    let project_id: i64 = conn
        .query_row(
            "SELECT project_id FROM gantt_tasks WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM gantt_tasks WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);

    Ok(())
}
