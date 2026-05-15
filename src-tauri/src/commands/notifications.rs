use crate::db::DbConn;
use crate::commands::utils::{get_setting, set_setting};
use crate::db::models::NotificationRecord;
use serde::{Deserialize, Serialize};
use tauri::State;

const NOTIFICATION_KEY: &str = "notification_history";
const NOTIFICATION_PREFS_KEY: &str = "notification_preferences";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NotificationPreferences {
    pub project_created: bool,
    pub project_deleted: bool,
    pub project_status_changed: bool,
    pub card_created: bool,
    pub card_moved: bool,
    pub file_uploaded: bool,
    pub file_deleted: bool,
    pub file_received: bool,
    pub share_started: bool,
    pub share_stopped: bool,
}

impl Default for NotificationPreferences {
    fn default() -> Self {
        Self {
            project_created: true,
            project_deleted: true,
            project_status_changed: true,
            card_created: false,
            card_moved: false,
            file_uploaded: true,
            file_deleted: true,
            file_received: true,
            share_started: true,
            share_stopped: true,
        }
    }
}

#[tauri::command]
pub fn get_notifications(db: State<'_, DbConn>) -> Result<Vec<NotificationRecord>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let json = get_setting(&conn, NOTIFICATION_KEY).unwrap_or("[]".to_string());
    let notifications: Vec<NotificationRecord> =
        serde_json::from_str(&json).unwrap_or_default();
    Ok(notifications)
}

#[tauri::command]
pub fn add_notification(
    db: State<'_, DbConn>,
    id: String,
    type_: String,
    title: String,
    message: String,
    link: Option<String>,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let json = get_setting(&conn, NOTIFICATION_KEY).unwrap_or("[]".to_string());
    let mut notifications: Vec<NotificationRecord> =
        serde_json::from_str(&json).unwrap_or_default();

    notifications.push(NotificationRecord {
        id,
        type_,
        title,
        message,
        read: false,
        created_at: chrono::Utc::now().to_rfc3339(),
        link,
    });

    let new_json = serde_json::to_string(&notifications).unwrap_or_else(|_| "[]".to_string());
    set_setting(&conn, NOTIFICATION_KEY, &new_json)?;

    Ok(())
}

#[tauri::command]
pub fn mark_notification_read(db: State<'_, DbConn>, id: String) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let json = get_setting(&conn, NOTIFICATION_KEY).unwrap_or("[]".to_string());
    let mut notifications: Vec<NotificationRecord> =
        serde_json::from_str(&json).unwrap_or_default();

    for n in &mut notifications {
        if n.id == id {
            n.read = true;
        }
    }

    let new_json = serde_json::to_string(&notifications).unwrap_or_else(|_| "[]".to_string());
    set_setting(&conn, NOTIFICATION_KEY, &new_json)?;

    Ok(())
}

#[tauri::command]
pub fn clear_notifications(db: State<'_, DbConn>) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    set_setting(&conn, NOTIFICATION_KEY, "[]")?;
    Ok(())
}

#[tauri::command]
pub fn mark_all_notifications_read(db: State<'_, DbConn>) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let json = get_setting(&conn, NOTIFICATION_KEY).unwrap_or("[]".to_string());
    let mut notifications: Vec<NotificationRecord> =
        serde_json::from_str(&json).unwrap_or_default();

    for n in &mut notifications {
        n.read = true;
    }

    let new_json = serde_json::to_string(&notifications).unwrap_or_else(|_| "[]".to_string());
    set_setting(&conn, NOTIFICATION_KEY, &new_json)?;

    Ok(())
}

#[tauri::command]
pub fn get_notification_preferences(db: State<'_, DbConn>) -> Result<NotificationPreferences, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let json = get_setting(&conn, NOTIFICATION_PREFS_KEY);

    match json {
        Some(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        None => Ok(NotificationPreferences::default()),
    }
}

#[tauri::command]
pub fn update_notification_preferences(
    db: State<'_, DbConn>,
    preferences: NotificationPreferences,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let json = serde_json::to_string(&preferences).map_err(|e| e.to_string())?;
    set_setting(&conn, NOTIFICATION_PREFS_KEY, &json)?;
    Ok(())
}