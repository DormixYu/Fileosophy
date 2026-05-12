use super::projects::DbConn;
use crate::db::models::{GanttTask, KanbanBoard, KanbanCard, KanbanColumn};
use crate::events;
use tauri::{AppHandle, Emitter, State};

/// 从行构造 KanbanColumn（含 column_type）
fn row_to_column(row: &rusqlite::Row) -> rusqlite::Result<KanbanColumn> {
    Ok(KanbanColumn {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        position: row.get(3)?,
        created_at: row.get(4)?,
        column_type: row.get(5)?,
        cards: Vec::new(),
    })
}

const COLUMN_SELECT: &str =
    "id, project_id, title, position, created_at, column_type";

/// 从行构造 KanbanCard（含 gantt_task_id, due_date）
fn row_to_card(row: &rusqlite::Row) -> rusqlite::Result<KanbanCard> {
    let tags_str: String = row.get(5)?;
    let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
    Ok(KanbanCard {
        id: row.get(0)?,
        column_id: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        position: row.get(4)?,
        tags,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        gantt_task_id: row.get(8)?,
        due_date: row.get(9)?,
    })
}

const CARD_SELECT: &str =
    "id, column_id, title, description, position, tags, created_at, updated_at, gantt_task_id, due_date";

#[tauri::command]
pub fn get_kanban_board(db: State<'_, DbConn>, project_id: i64) -> Result<KanbanBoard, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(&format!(
            "SELECT {COLUMN_SELECT} FROM kanban_columns WHERE project_id = ?1 ORDER BY position"
        ))
        .map_err(|e| e.to_string())?;

    let mut columns = Vec::new();
    let col_rows = stmt
        .query_map([project_id], row_to_column)
        .map_err(|e| e.to_string())?;

    for row in col_rows {
        columns.push(row.map_err(|e| e.to_string())?);
    }

    for col in &mut columns {
        let mut card_stmt = conn
            .prepare(&format!(
                "SELECT {CARD_SELECT} FROM kanban_cards WHERE column_id = ?1 ORDER BY position"
            ))
            .map_err(|e| e.to_string())?;

        let card_rows = card_stmt
            .query_map([col.id], row_to_card)
            .map_err(|e| e.to_string())?;

        for card in card_rows {
            col.cards.push(card.map_err(|e| e.to_string())?);
        }
    }

    Ok(KanbanBoard { columns })
}

#[tauri::command]
pub fn add_column(
    app: AppHandle,
    db: State<'_, DbConn>,
    project_id: i64,
    title: String,
    column_type: Option<String>,
) -> Result<KanbanColumn, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let max_pos: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM kanban_columns WHERE project_id = ?1",
            [project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let position = max_pos + 1;

    conn.execute(
        "INSERT INTO kanban_columns (project_id, title, position, column_type) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![project_id, title, position, column_type],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    conn.query_row(
        &format!("SELECT {COLUMN_SELECT} FROM kanban_columns WHERE id = ?1"),
        [id],
        row_to_column,
    )
    .map_err(|e| e.to_string())
    .inspect(|_| {
        let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);
    })
}

#[tauri::command]
pub fn create_card(
    app: AppHandle,
    db: State<'_, DbConn>,
    column_id: i64,
    title: String,
    description: Option<String>,
    due_date: Option<String>,
    gantt_task_id: Option<i64>,
) -> Result<KanbanCard, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let desc = description.unwrap_or_default();

    let max_pos: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM kanban_cards WHERE column_id = ?1",
            [column_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let position = max_pos + 1;

    conn.execute(
        "INSERT INTO kanban_cards (column_id, title, description, position, due_date, gantt_task_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![column_id, title, desc, position, due_date, gantt_task_id],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    conn.query_row(
        &format!("SELECT {CARD_SELECT} FROM kanban_cards WHERE id = ?1"),
        [id],
        row_to_card,
    )
    .map_err(|e| e.to_string())
    .inspect(|card| {
        if let Ok(project_id) = conn.query_row(
            "SELECT project_id FROM kanban_columns WHERE id = ?1",
            [card.column_id],
            |row| row.get::<_, i64>(0),
        ) {
            let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);
            let link = format!("/project/{}", project_id);
            events::emit_notification(&app, "info", "新卡片", &card.title, Some(&link));
        }
    })
}

#[tauri::command]
pub fn move_card(
    app: AppHandle,
    db: State<'_, DbConn>,
    card_id: i64,
    target_column_id: i64,
    position: i32,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // 获取卡片当前列和关联的甘特任务ID
    let (source_column_id, gantt_task_id): (i64, Option<i64>) = conn.query_row(
        "SELECT column_id, gantt_task_id FROM kanban_cards WHERE id = ?1",
        [card_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;

    // 读取 source 和 target 列的 column_type
    let source_type: Option<String> = conn.query_row(
        "SELECT column_type FROM kanban_columns WHERE id = ?1",
        [source_column_id],
        |row| row.get(0),
    ).ok();
    let target_type: Option<String> = conn.query_row(
        "SELECT column_type FROM kanban_columns WHERE id = ?1",
        [target_column_id],
        |row| row.get(0),
    ).ok();

    // 执行移动
    conn.execute(
        "UPDATE kanban_cards SET column_id = ?1, position = ?2, updated_at = datetime('now') WHERE id = ?3",
        rusqlite::params![target_column_id, position, card_id],
    )
    .map_err(|e| e.to_string())?;

    // 甘特进度联动：todo_pending → todo_done 设进度 1.0，反向设 0.0
    if let Some(task_id) = gantt_task_id {
        if source_type.as_deref() == Some("todo_pending") && target_type.as_deref() == Some("todo_done") {
            conn.execute("UPDATE gantt_tasks SET progress = 1.0 WHERE id = ?1", [task_id])
                .map_err(|e| e.to_string())?;
        } else if source_type.as_deref() == Some("todo_done") && target_type.as_deref() == Some("todo_pending") {
            conn.execute("UPDATE gantt_tasks SET progress = 0.0 WHERE id = ?1", [task_id])
                .map_err(|e| e.to_string())?;
        }
    }

    let _ = app.emit(
        events::EVENT_CARD_MOVED,
        serde_json::json!({
            "card_id": card_id,
            "target_column_id": target_column_id,
            "position": position,
        }),
    );

    let card_title: String = conn.query_row(
        "SELECT title FROM kanban_cards WHERE id = ?1", [card_id],
        |row| row.get(0),
    ).unwrap_or_else(|_| "卡片".to_string());
    let col_title: String = conn.query_row(
        "SELECT title FROM kanban_columns WHERE id = ?1", [target_column_id],
        |row| row.get(0),
    ).unwrap_or_else(|_| "列".to_string());
    let project_id: Option<i64> = conn.query_row(
        "SELECT project_id FROM kanban_columns WHERE id = ?1", [target_column_id],
        |row| row.get(0),
    ).ok();
    let link = project_id.map(|pid| format!("/project/{}", pid));
    events::emit_notification(&app, "info", "卡片移动", &format!("{} → {}", card_title, col_title), link.as_deref());

    Ok(())
}

#[tauri::command]
pub fn update_column(
    app: AppHandle,
    db: State<'_, DbConn>,
    column_id: i64,
    title: String,
    column_type: Option<String>,
) -> Result<KanbanColumn, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let project_id: i64 = conn
        .query_row(
            "SELECT project_id FROM kanban_columns WHERE id = ?1",
            [column_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE kanban_columns SET title = ?1, column_type = ?2 WHERE id = ?3",
        rusqlite::params![title, column_type, column_id],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("SELECT {COLUMN_SELECT} FROM kanban_columns WHERE id = ?1"),
        [column_id],
        row_to_column,
    )
    .map_err(|e| e.to_string())
    .inspect(|_| {
        let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);
    })
}

#[tauri::command]
pub fn delete_column(
    app: AppHandle,
    db: State<'_, DbConn>,
    column_id: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let project_id: i64 = conn
        .query_row(
            "SELECT project_id FROM kanban_columns WHERE id = ?1",
            [column_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM kanban_columns WHERE id = ?1", [column_id])
        .map_err(|e| e.to_string())?;

    let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);

    Ok(())
}

#[tauri::command]
pub fn delete_card(
    app: AppHandle,
    db: State<'_, DbConn>,
    card_id: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let project_id: i64 = conn
        .query_row(
            "SELECT kc.project_id FROM kanban_cards c \
             JOIN kanban_columns kc ON c.column_id = kc.id \
             WHERE c.id = ?1",
            [card_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM kanban_cards WHERE id = ?1", [card_id])
        .map_err(|e| e.to_string())?;

    let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);

    Ok(())
}

#[tauri::command]
pub fn update_card(
    app: AppHandle,
    db: State<'_, DbConn>,
    card_id: i64,
    title: Option<String>,
    description: Option<String>,
    tags: Option<Vec<String>>,
    due_date: Option<String>,
    gantt_task_id: Option<i64>,
) -> Result<KanbanCard, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let mut sets = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    if let Some(ref t) = title {
        sets.push(format!("title = ?{idx}"));
        params.push(Box::new(t.clone()));
        idx += 1;
    }
    if let Some(ref d) = description {
        sets.push(format!("description = ?{idx}"));
        params.push(Box::new(d.clone()));
        idx += 1;
    }
    if let Some(ref tg) = tags {
        let tags_json = serde_json::to_string(tg).unwrap_or_else(|_| "[]".to_string());
        sets.push(format!("tags = ?{idx}"));
        params.push(Box::new(tags_json));
        idx += 1;
    }
    if let Some(ref dd) = due_date {
        sets.push(format!("due_date = ?{idx}"));
        params.push(Box::new(dd.clone()));
        idx += 1;
    }
    if let Some(ref gid) = gantt_task_id {
        sets.push(format!("gantt_task_id = ?{idx}"));
        params.push(Box::new(*gid));
        idx += 1;
    }

    if !sets.is_empty() {
        sets.push("updated_at = datetime('now')".to_string());
        params.push(Box::new(card_id));

        let sql = format!(
            "UPDATE kanban_cards SET {} WHERE id = ?{}",
            sets.join(", "),
            idx
        );
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())
            .map_err(|e| e.to_string())?;
    }

    conn.query_row(
        &format!("SELECT {CARD_SELECT} FROM kanban_cards WHERE id = ?1"),
        [card_id],
        row_to_card,
    )
    .map_err(|e| e.to_string())
    .inspect(|card| {
        if let Ok(project_id) = conn.query_row(
            "SELECT project_id FROM kanban_columns WHERE id = ?1",
            [card.column_id],
            |row| row.get::<_, i64>(0),
        ) {
            let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);
        }
    })
}

// ── 看板与甘特图联动命令 ────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct LinkCardResult {
    pub card: KanbanCard,
    pub task: GanttTask,
}

#[tauri::command]
pub fn link_card_to_gantt(
    app: AppHandle,
    db: State<'_, DbConn>,
    card_id: i64,
    task_name: String,
    start_date: String,
    duration_days: i32,
) -> Result<LinkCardResult, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // 获取卡片所属项目
    let project_id: i64 = conn.query_row(
        "SELECT kc.project_id FROM kanban_cards c JOIN kanban_columns kc ON c.column_id = kc.id WHERE c.id = ?1",
        [card_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // 创建甘特任务
    let deps_json = "[]";
    conn.execute(
        "INSERT INTO gantt_tasks (project_id, name, start_date, duration_days, dependencies) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![project_id, task_name, start_date, duration_days, deps_json],
    ).map_err(|e| e.to_string())?;

    let task_id = conn.last_insert_rowid();

    // 更新卡片的 gantt_task_id 和 due_date（截止日 = 开始日 + 持续天数 - 1）
    let due_date = if duration_days > 1 {
        chrono::NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
            .ok()
            .and_then(|d| d.checked_add_days(chrono::Days::new((duration_days - 1) as u64)))
            .map(|d| d.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| start_date.clone())
    } else {
        start_date.clone()
    };
    conn.execute(
        "UPDATE kanban_cards SET gantt_task_id = ?1, due_date = ?2 WHERE id = ?3",
        rusqlite::params![task_id, due_date, card_id],
    ).map_err(|e| e.to_string())?;

    let card = conn.query_row(
        &format!("SELECT {CARD_SELECT} FROM kanban_cards WHERE id = ?1"),
        [card_id],
        row_to_card,
    ).map_err(|e| e.to_string())?;

    let task = conn.query_row(
        "SELECT id, project_id, name, start_date, duration_days, dependencies, progress, created_at FROM gantt_tasks WHERE id = ?1",
        [task_id],
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
    ).map_err(|e| e.to_string())?;

    let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);
    Ok(LinkCardResult { card, task })
}

#[tauri::command]
pub fn unlink_card_from_gantt(
    app: AppHandle,
    db: State<'_, DbConn>,
    card_id: i64,
) -> Result<KanbanCard, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE kanban_cards SET gantt_task_id = NULL WHERE id = ?1",
        [card_id],
    ).map_err(|e| e.to_string())?;

    let card = conn.query_row(
        &format!("SELECT {CARD_SELECT} FROM kanban_cards WHERE id = ?1"),
        [card_id],
        row_to_card,
    ).map_err(|e| e.to_string())?;

    let project_id: i64 = conn.query_row(
        "SELECT kc.project_id FROM kanban_cards c JOIN kanban_columns kc ON c.column_id = kc.id WHERE c.id = ?1",
        [card_id],
        |row| row.get(0),
    ).unwrap_or(0);

    let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);
    Ok(card)
}

#[tauri::command]
pub fn sync_gantt_to_kanban(
    app: AppHandle,
    db: State<'_, DbConn>,
    task_id: i64,
) -> Result<KanbanCard, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // 获取任务信息
    let (project_id, name, start_date): (i64, String, Option<String>) = conn.query_row(
        "SELECT project_id, name, start_date FROM gantt_tasks WHERE id = ?1",
        [task_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|e| e.to_string())?;

    // 找到该项目的 todo_pending 列
    let pending_col_id: i64 = conn.query_row(
        "SELECT id FROM kanban_columns WHERE project_id = ?1 AND column_type = 'todo_pending' ORDER BY position LIMIT 1",
        [project_id],
        |row| row.get(0),
    ).map_err(|_| "该项目没有待办事项列".to_string())?;

    // 检查是否已存在关联卡片（防重复）
    if let Ok(existing_id) = conn.query_row(
        "SELECT id FROM kanban_cards WHERE gantt_task_id = ?1 AND column_id = ?2 LIMIT 1",
        rusqlite::params![task_id, pending_col_id],
        |row| row.get::<_, i64>(0),
    ) {
        return conn.query_row(
            &format!("SELECT {CARD_SELECT} FROM kanban_cards WHERE id = ?1"),
            [existing_id],
            row_to_card,
        ).map_err(|e| e.to_string());
    }

    // 计算卡片 position
    let max_pos: i32 = conn.query_row(
        "SELECT COALESCE(MAX(position), -1) FROM kanban_cards WHERE column_id = ?1",
        [pending_col_id],
        |row| row.get(0),
    ).unwrap_or(-1);

    let position = max_pos + 1;

    conn.execute(
        "INSERT INTO kanban_cards (column_id, title, position, gantt_task_id, due_date) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![pending_col_id, name, position, task_id, start_date],
    ).map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    let card = conn.query_row(
        &format!("SELECT {CARD_SELECT} FROM kanban_cards WHERE id = ?1"),
        [id],
        row_to_card,
    ).map_err(|e| e.to_string())?;

    let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);
    Ok(card)
}