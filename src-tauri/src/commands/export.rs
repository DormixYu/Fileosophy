use crate::db::DbConn;
use super::projects::{row_to_project, PROJECT_COLUMNS};
use crate::db::models::{FileEntry, GanttTask, KanbanCard, KanbanColumn, ProjectExport};
use crate::events;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State};

fn load_kanban_columns(conn: &rusqlite::Connection, project_id: i64) -> Result<Vec<KanbanColumn>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.project_id, c.title, c.position, c.created_at, c.column_type,
                    card.id, card.column_id, card.title, card.description, card.position, card.tags, card.created_at, card.updated_at, card.gantt_task_id, card.due_date
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
                column_type: row.get(5)?,
                cards: Vec::new(),
            };

            let card_id: Option<i64> = row.get(6)?;
            let card = card_id.map(|cid| KanbanCard {
                id: cid,
                column_id: row.get(7).unwrap_or(col_id),
                title: row.get(8).unwrap_or_default(),
                description: row.get(9).ok(),
                position: row.get(10).unwrap_or(0),
                tags: row
                    .get::<_, String>(11)
                    .ok()
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default(),
                created_at: row.get(12).unwrap_or_default(),
                updated_at: row.get(13).unwrap_or_default(),
                gantt_task_id: row.get(14).ok(),
                due_date: row.get(15).ok(),
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
pub fn import_project(app: AppHandle, db: State<'_, DbConn>, file_path: String) -> Result<crate::db::models::Project, String> {
    let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;

    // 尝试解析为完整导出格式
    if let Ok(export) = serde_json::from_str::<ProjectExport>(&content) {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let project = import_full_project_impl(&conn, export)?;
        let _ = app.emit(events::EVENT_PROJECT_UPDATED, project.id);
        return Ok(project);
    }

    // 回退为简单项目格式
    let project: crate::db::models::Project =
        serde_json::from_str(&content).map_err(|e| format!("无法解析项目文件: {e}"))?;

    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let tx_result: Result<crate::db::models::Project, String> = (|| {
        conn.execute(
            "INSERT INTO projects (name, description, project_number, project_type, status, start_date, end_date, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![project.name, project.description, project.project_number, project.project_type, project.status, project.start_date, project.end_date, project.created_by],
        )
        .map_err(|e| e.to_string())?;

        let id = conn.last_insert_rowid();

        // 自动创建看板默认列
        conn.execute(
            "INSERT INTO kanban_columns (project_id, title, position, column_type) VALUES (?1, '待办事项', 0, 'todo_pending')",
            rusqlite::params![id],
        ).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO kanban_columns (project_id, title, position, column_type) VALUES (?1, '已完成事项', 1, 'todo_done')",
            rusqlite::params![id],
        ).map_err(|e| e.to_string())?;

        Ok(conn.query_row(
            &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1"),
            [id],
            row_to_project,
        ).map_err(|e| e.to_string())?)
    })();

    if tx_result.is_ok() {
        conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    } else {
        conn.execute_batch("ROLLBACK").ok();
    }

    let imported = tx_result?;
    let _ = app.emit(events::EVENT_PROJECT_UPDATED, imported.id);
    Ok(imported)
}

fn import_full_project_impl(conn: &rusqlite::Connection, export: ProjectExport) -> Result<crate::db::models::Project, String> {
    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let tx_result: Result<crate::db::models::Project, String> = (|| {
        conn.execute(
            "INSERT INTO projects (name, description, project_number, project_type, status, start_date, end_date, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![export.project.name, export.project.description, export.project.project_number, export.project.project_type, export.project.status, export.project.start_date, export.project.end_date, export.project.created_by],
        )
        .map_err(|e| e.to_string())?;

        let new_project_id = conn.last_insert_rowid();

        for col in &export.kanban_columns {
            conn.execute(
                "INSERT INTO kanban_columns (project_id, title, position, column_type) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![new_project_id, col.title, col.position, col.column_type],
            )
            .map_err(|e| e.to_string())?;

            let new_col_id = conn.last_insert_rowid();

            for card in &col.cards {
                let tags_json = serde_json::to_string(&card.tags).unwrap_or_else(|_| "[]".to_string());
                conn.execute(
                    "INSERT INTO kanban_cards (column_id, title, description, position, tags, due_date, gantt_task_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    rusqlite::params![new_col_id, card.title, card.description, card.position, tags_json, card.due_date, card.gantt_task_id],
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

        Ok(conn.query_row(
            &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1"),
            [new_project_id],
            row_to_project,
        ).map_err(|e| e.to_string())?)
    })();

    if tx_result.is_ok() {
        conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
    } else {
        conn.execute_batch("ROLLBACK").ok();
    }

    tx_result
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
pub fn import_all_projects(app: AppHandle, db: State<'_, DbConn>, file_path: String) -> Result<Vec<crate::db::models::Project>, String> {
    let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let exports: Vec<ProjectExport> =
        serde_json::from_str(&content).map_err(|e| format!("无法解析备份文件: {e}"))?;

    let mut imported = Vec::new();
    for export in exports {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let project = import_full_project_impl(&conn, export)?;
        let _ = app.emit(events::EVENT_PROJECT_UPDATED, project.id);
        imported.push(project);
    }

    Ok(imported)
}