use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use super::migrations::run_migrations;

pub fn init_database(app: &AppHandle) -> Result<Connection, String> {
    let db_path = get_db_path(app)?;
    fs::create_dir_all(db_path.parent().unwrap()).map_err(|e| e.to_string())?;

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // 启用外键约束
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| e.to_string())?;

    // 运行迁移
    run_migrations(&conn).map_err(|e| e.to_string())?;

    Ok(conn)
}

fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(data_dir.join("fileosophy.db"))
}
