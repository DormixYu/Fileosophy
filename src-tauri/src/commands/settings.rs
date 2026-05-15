use crate::db::DbConn;
use crate::db::models::AppSettings;
use std::collections::HashMap;
use tauri::State;

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