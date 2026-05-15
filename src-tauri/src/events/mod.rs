use tauri::Emitter;

pub const EVENT_PROJECT_UPDATED: &str = "project-updated";
pub const EVENT_CARD_MOVED: &str = "card-moved";
pub const EVENT_FILE_SHARED: &str = "file-shared";
pub const EVENT_NOTIFICATION: &str = "app-notification";
pub const EVENT_USER_UPDATED: &str = "user-updated";

/// 发送通知事件到前端
pub fn emit_notification(app: &tauri::AppHandle, type_: &str, title: &str, message: &str, link: Option<&str>) {
    let mut payload = serde_json::json!({
        "type": type_,
        "title": title,
        "message": message,
    });
    if let Some(l) = link {
        payload["link"] = serde_json::json!(l);
    }
    let _ = app.emit(EVENT_NOTIFICATION, payload);
}
