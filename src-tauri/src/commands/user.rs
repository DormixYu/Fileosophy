use crate::db::DbConn;
use crate::db::models::User;
use crate::events;
use std::fs;
use tauri::{AppHandle, Emitter, Manager, State};

#[tauri::command]
pub fn get_current_user(db: State<'_, DbConn>) -> Result<Option<User>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let user_id: Option<i64> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'current_user_id'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|v| v.parse().ok());

    let Some(id) = user_id else {
        return Ok(None);
    };

    let user = conn.query_row(
        "SELECT id, name, avatar_path, created_at FROM users WHERE id = ?1",
        [id],
        |row| {
            Ok(User {
                id: row.get(0)?,
                name: row.get(1)?,
                avatar_path: row.get(2)?,
                created_at: row.get(3)?,
            })
        },
    );

    match user {
        Ok(u) => Ok(Some(u)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub fn create_or_update_user(
    app: AppHandle,
    db: State<'_, DbConn>,
    name: String,
    avatar_path: Option<String>,
) -> Result<User, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let user_id: Option<i64> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'current_user_id'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|v| v.parse().ok());

    match user_id {
        Some(id) => {
            // 更新现有用户
            conn.execute(
                "UPDATE users SET name = ?1, avatar_path = ?2 WHERE id = ?3",
                rusqlite::params![name, avatar_path, id],
            )
            .map_err(|e| e.to_string())?;

            let user = conn.query_row(
                "SELECT id, name, avatar_path, created_at FROM users WHERE id = ?1",
                [id],
                |row| {
                    Ok(User {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        avatar_path: row.get(2)?,
                        created_at: row.get(3)?,
                    })
                },
            ).map_err(|e| e.to_string())?;

            let _ = app.emit(events::EVENT_USER_UPDATED, user.id);
            Ok(user)
        }
        None => {
            // 创建新用户
            conn.execute(
                "INSERT INTO users (name, avatar_path) VALUES (?1, ?2)",
                rusqlite::params![name, avatar_path],
            )
            .map_err(|e| e.to_string())?;

            let id = conn.last_insert_rowid();

            // 保存 current_user_id 到 settings
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('current_user_id', ?1)",
                [id.to_string()],
            )
            .map_err(|e| e.to_string())?;

            let user = conn.query_row(
                "SELECT id, name, avatar_path, created_at FROM users WHERE id = ?1",
                [id],
                |row| {
                    Ok(User {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        avatar_path: row.get(2)?,
                        created_at: row.get(3)?,
                    })
                },
            ).map_err(|e| e.to_string())?;

            let _ = app.emit(events::EVENT_USER_UPDATED, user.id);
            Ok(user)
        }
    }
}

#[tauri::command]
pub fn upload_avatar(
    app: AppHandle,
    db: State<'_, DbConn>,
    image_data: String,
) -> Result<String, String> {
    // 解码 base64
    let bytes = base64_decode(&image_data)?;

    let avatars_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("avatars");

    fs::create_dir_all(&avatars_dir).map_err(|e| format!("创建头像目录失败: {e}"))?;

    let filename = format!("avatar_{}{}", chrono_timestamp(), avatar_extension(&image_data));
    let filepath = avatars_dir.join(&filename);
    fs::write(&filepath, &bytes).map_err(|e| format!("保存头像失败: {e}"))?;

    let path_str = filepath.to_string_lossy().to_string();

    // 更新当前用户的头像路径
    let conn = db.lock().map_err(|e| e.to_string())?;
    let user_id: Option<i64> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'current_user_id'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|v| v.parse().ok());

    if let Some(id) = user_id {
        conn.execute(
            "UPDATE users SET avatar_path = ?1 WHERE id = ?2",
            rusqlite::params![path_str, id],
        )
        .map_err(|e| e.to_string())?;
        let _ = app.emit(events::EVENT_USER_UPDATED, id);
    }

    Ok(path_str)
}

fn base64_decode(data: &str) -> Result<Vec<u8>, String> {
    // 移除 data URL 前缀（如 "data:image/png;base64,"）
    let raw = if let Some(idx) = data.find(',') {
        &data[idx + 1..]
    } else {
        data
    };

    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(raw)
        .map_err(|e| format!("Base64 解码失败: {e}"))
}

fn chrono_timestamp() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}

/// 从 data URL 的 MIME 类型提取文件扩展名
fn avatar_extension(data: &str) -> String {
    if let Some(idx) = data.find(';') {
        let mime = &data[..idx];
        // 提取 "data:image/png" 中的 "image/png" 部分
        let mime_type = if let Some(colon_pos) = mime.find(':') {
            &mime[colon_pos + 1..]
        } else {
            mime
        };
        match mime_type {
            "image/jpeg" | "image/jpg" => ".jpg".to_string(),
            "image/png" => ".png".to_string(),
            "image/gif" => ".gif".to_string(),
            "image/webp" => ".webp".to_string(),
            "image/svg+xml" => ".svg".to_string(),
            "image/bmp" => ".bmp".to_string(),
            _ => ".png".to_string(),
        }
    } else {
        ".png".to_string()
    }
}
