use super::projects::DbConn;
use crate::db::models::{KanbanBoard, KanbanCard, KanbanColumn};
use crate::events;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn get_kanban_board(db: State<'_, DbConn>, project_id: i64) -> Result<KanbanBoard, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // 获取所有列
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, title, position, created_at
             FROM kanban_columns WHERE project_id = ?1 ORDER BY position",
        )
        .map_err(|e| e.to_string())?;

    let mut columns = Vec::new();
    let col_rows = stmt
        .query_map([project_id], |row| {
            Ok(KanbanColumn {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                position: row.get(3)?,
                created_at: row.get(4)?,
                cards: Vec::new(),
            })
        })
        .map_err(|e| e.to_string())?;

    for row in col_rows {
        columns.push(row.map_err(|e| e.to_string())?);
    }

    // 为每列获取卡片
    for col in &mut columns {
        let mut card_stmt = conn
            .prepare(
                "SELECT id, column_id, title, description, position, tags, created_at, updated_at
                 FROM kanban_cards WHERE column_id = ?1 ORDER BY position",
            )
            .map_err(|e| e.to_string())?;

        let card_rows = card_stmt
            .query_map([col.id], |row| {
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
                })
            })
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
) -> Result<KanbanColumn, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // 获取当前最大 position
    let max_pos: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM kanban_columns WHERE project_id = ?1",
            [project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let position = max_pos + 1;

    conn.execute(
        "INSERT INTO kanban_columns (project_id, title, position) VALUES (?1, ?2, ?3)",
        rusqlite::params![project_id, title, position],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    conn.query_row(
        "SELECT id, project_id, title, position, created_at FROM kanban_columns WHERE id = ?1",
        [id],
        |row| {
            Ok(KanbanColumn {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                position: row.get(3)?,
                created_at: row.get(4)?,
                cards: Vec::new(),
            })
        },
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
        "INSERT INTO kanban_cards (column_id, title, description, position) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![column_id, title, desc, position],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    conn.query_row(
        "SELECT id, column_id, title, description, position, tags, created_at, updated_at
         FROM kanban_cards WHERE id = ?1",
        [id],
        |row| {
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
            })
        },
    )
    .map_err(|e| e.to_string())
    .inspect(|card| {
        let _ = app.emit(events::EVENT_PROJECT_UPDATED, card.column_id);
        let project_id: Option<i64> = conn.query_row(
            "SELECT project_id FROM kanban_columns WHERE id = ?1",
            [card.column_id],
            |row| row.get(0),
        ).ok();
        let link = project_id.map(|pid| format!("/project/{}", pid));
        events::emit_notification(&app, "info", "新卡片", &card.title, link.as_deref());
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

    conn.execute(
        "UPDATE kanban_cards SET column_id = ?1, position = ?2, updated_at = datetime('now')
         WHERE id = ?3",
        rusqlite::params![target_column_id, position, card_id],
    )
    .map_err(|e| e.to_string())?;

    let _ = app.emit(
        events::EVENT_CARD_MOVED,
        serde_json::json!({
            "card_id": card_id,
            "target_column_id": target_column_id,
            "position": position,
        }),
    );

    // 获取卡片标题和目标列标题用于通知
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
        "UPDATE kanban_columns SET title = ?1 WHERE id = ?2",
        rusqlite::params![title, column_id],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, project_id, title, position, created_at FROM kanban_columns WHERE id = ?1",
        [column_id],
        |row| {
            Ok(KanbanColumn {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                position: row.get(3)?,
                created_at: row.get(4)?,
                cards: Vec::new(),
            })
        },
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
        "SELECT id, column_id, title, description, position, tags, created_at, updated_at
         FROM kanban_cards WHERE id = ?1",
        [card_id],
        |row| {
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
            })
        },
    )
    .map_err(|e| e.to_string())
    .inspect(|card| {
        let _ = app.emit(events::EVENT_PROJECT_UPDATED, card.column_id);
    })
}
