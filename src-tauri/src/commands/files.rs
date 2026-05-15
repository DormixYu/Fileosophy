use crate::db::DbConn;
use crate::db::models::{FileEntry, FilePreview};
use crate::events;
use crate::mdns::{MdnsService, Peer};
use crate::sharing;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

/// mDNS 服务的托管状态类型
pub type MdnsState = Mutex<MdnsService>;

#[tauri::command]
pub fn list_project_files(
    db: State<'_, DbConn>,
    project_id: i64,
) -> Result<Vec<FileEntry>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, original_name, stored_name, size, uploaded_at
             FROM project_files WHERE project_id = ?1 ORDER BY uploaded_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
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
        .map_err(|e| e.to_string())?;

    let mut files = Vec::new();
    for row in rows {
        files.push(row.map_err(|e| e.to_string())?);
    }
    Ok(files)
}

#[tauri::command]
pub fn upload_file_to_project(
    app: AppHandle,
    db: State<'_, DbConn>,
    project_id: i64,
    file_path: String,
) -> Result<FileEntry, String> {
    let src = PathBuf::from(&file_path);
    if !src.exists() {
        return Err("源文件不存在".to_string());
    }

    let original_name = src
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let ext = src
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();

    let stored_name = format!("{}{}", Uuid::new_v4(), ext);

    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let files_dir = data_dir.join("files").join(project_id.to_string());
    fs::create_dir_all(&files_dir).map_err(|e| e.to_string())?;

    let dest = files_dir.join(&stored_name);
    fs::copy(&src, &dest).map_err(|e| e.to_string())?;

    let size = fs::metadata(&dest).map(|m| m.len() as i64).unwrap_or(0);

    let conn = db.lock().map_err(|e| e.to_string())?;
    let insert_result = conn.execute(
        "INSERT INTO project_files (project_id, original_name, stored_name, size)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![project_id, original_name, stored_name, size],
    );

    if let Err(e) = insert_result {
        // 数据库插入失败，清理已复制的文件
        let _ = fs::remove_file(&dest);
        return Err(e.to_string());
    }

    let id = conn.last_insert_rowid();

    let entry = conn
        .query_row(
            "SELECT id, project_id, original_name, stored_name, size, uploaded_at
             FROM project_files WHERE id = ?1",
            [id],
            |row| {
                Ok(FileEntry {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    original_name: row.get(2)?,
                    stored_name: row.get(3)?,
                    size: row.get(4)?,
                    uploaded_at: row.get(5)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    // 通知前端文件已上传
    let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);
    events::emit_notification(&app, "success", "文件已上传", &entry.original_name, Some(&format!("/project/{}", project_id)));

    Ok(entry)
}

#[tauri::command]
pub fn delete_file(app: AppHandle, db: State<'_, DbConn>, file_id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let (project_id, stored_name, original_name): (i64, String, String) = conn
        .query_row(
            "SELECT project_id, stored_name, original_name FROM project_files WHERE id = ?1",
            [file_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file_path = data_dir
        .join("files")
        .join(project_id.to_string())
        .join(&stored_name);

    // 先删 DB 记录，再删磁盘文件（避免 DB 删除失败导致孤儿记录）
    conn.execute("DELETE FROM project_files WHERE id = ?1", [file_id])
        .map_err(|e| e.to_string())?;

    if file_path.exists() {
        let _ = fs::remove_file(&file_path); // 磁盘文件删除失败不影响结果
    }

    let _ = app.emit(events::EVENT_PROJECT_UPDATED, project_id);
    events::emit_notification(&app, "warning", "文件已删除", &original_name, None);

    Ok(())
}

/// 将文件发送到局域网中的指定对等节点
#[tauri::command]
pub fn share_file_over_network(
    app: AppHandle,
    db: State<'_, DbConn>,
    file_id: i64,
    peer_addr: String,
    peer_port: u16,
    token: String,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // 获取文件信息
    let (project_id, stored_name, original_name): (i64, String, String) = conn
        .query_row(
            "SELECT project_id, stored_name, original_name FROM project_files WHERE id = ?1",
            [file_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file_path = data_dir
        .join("files")
        .join(project_id.to_string())
        .join(&stored_name);

    if !file_path.exists() {
        return Err("文件不存在于磁盘".to_string());
    }

    // 获取本机名称作为发送者标识
    let sender_name = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Fileosophy".to_string());

    drop(conn);

    sharing::send_file(
        &peer_addr,
        peer_port,
        file_path.to_string_lossy().as_ref(),
        &sender_name,
        &token,
    )?;

    let _ = app.emit(
        events::EVENT_FILE_SHARED,
        serde_json::json!({
            "file_id": file_id,
            "file_name": original_name,
            "peer_addr": peer_addr,
            "status": "sent",
        }),
    );

    Ok(())
}

/// 获取文件的原始文件名（不再暴露磁盘绝对路径）
#[tauri::command]
pub fn download_file(
    db: State<'_, DbConn>,
    file_id: i64,
) -> Result<String, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let original_name: String = conn
        .query_row(
            "SELECT original_name FROM project_files WHERE id = ?1",
            [file_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(original_name)
}

/// 用系统默认程序打开已存储的项目文件（不暴露路径给前端）
#[tauri::command]
pub fn open_stored_file(
    app: AppHandle,
    db: State<'_, DbConn>,
    file_id: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let (project_id, stored_name): (i64, String) = conn
        .query_row(
            "SELECT project_id, stored_name FROM project_files WHERE id = ?1",
            [file_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file_path = data_dir
        .join("files")
        .join(project_id.to_string())
        .join(&stored_name);

    if !file_path.exists() {
        return Err("文件不存在于磁盘".to_string());
    }

    drop(conn);

    // 用系统默认程序打开
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &file_path.to_string_lossy()])
        .spawn()
        .map_err(|e| format!("打开文件失败: {e}"))?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&file_path)
        .spawn()
        .map_err(|e| format!("打开文件失败: {e}"))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&file_path)
        .spawn()
        .map_err(|e| format!("打开文件失败: {e}"))?;

    Ok(())
}

/// 发现局域网中的其他 Fileosophy 实例
#[tauri::command]
pub fn discover_peers(mdns: State<'_, MdnsState>) -> Result<Vec<Peer>, String> {
    let service = mdns.lock().map_err(|e| e.to_string())?;
    Ok(service.get_peers())
}

/// 预览文件内容（图片返回 base64 data URL，文本返回内容）
#[tauri::command]
pub fn preview_file(
    app: AppHandle,
    db: State<'_, DbConn>,
    file_id: i64,
) -> Result<FilePreview, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let (project_id, stored_name, original_name, size): (i64, String, String, i64) = conn
        .query_row(
            "SELECT project_id, stored_name, original_name, size FROM project_files WHERE id = ?1",
            [file_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| e.to_string())?;

    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file_path = data_dir
        .join("files")
        .join(project_id.to_string())
        .join(&stored_name);

    if !file_path.exists() {
        return Err("文件不存在于磁盘".to_string());
    }

    let ext = std::path::Path::new(&original_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    // 图片类型 → base64 data URL
    let image_exts = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"];
    if image_exts.contains(&ext.as_str()) {
        let mime = match ext.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "svg" => "image/svg+xml",
            "bmp" => "image/bmp",
            _ => "image/png",
        };
        let bytes = std::fs::read(&file_path).map_err(|e| e.to_string())?;
        let b64 = base64_encode(&bytes);
        return Ok(FilePreview {
            mime_type: mime.to_string(),
            content: format!("data:{};base64,{}", mime, b64),
            original_name,
            size,
        });
    }

    // Markdown → 返回原始文本，mime 标记为 text/markdown
    if ext == "md" {
        let content = std::fs::read_to_string(&file_path)
            .map_err(|e| format!("无法读取文件内容: {}", e))?;
        let truncated = truncate_text(content, 512_000);
        return Ok(FilePreview {
            mime_type: "text/markdown".to_string(),
            content: truncated,
            original_name,
            size,
        });
    }

    // 文本类型 → 返回文本内容
    let text_exts = ["txt", "json", "xml", "csv", "log", "yaml", "yml", "toml", "ini", "cfg", "conf", "rs", "ts", "tsx", "js", "jsx", "py", "html", "css", "sql", "sh", "bat", "ps1", "env"];
    if text_exts.contains(&ext.as_str()) {
        let content = std::fs::read_to_string(&file_path)
            .map_err(|e| format!("无法读取文件内容: {}", e))?;
        let truncated = truncate_text(content, 512_000);

        let mime = match ext.as_str() {
            "json" => "application/json",
            "xml" => "application/xml",
            "html" => "text/html",
            "css" => "text/css",
            "js" | "jsx" => "text/javascript",
            "ts" | "tsx" => "text/typescript",
            _ => "text/plain",
        };

        return Ok(FilePreview {
            mime_type: mime.to_string(),
            content: truncated,
            original_name,
            size,
        });
    }

    // 不支持预览的类型
    Err(format!("不支持预览此文件类型 (.{})，请使用系统默认应用打开", ext))
}

fn base64_encode(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn truncate_text(content: String, max_bytes: usize) -> String {
    if content.len() <= max_bytes {
        return content;
    }
    // 找到不超过 max_bytes 的最后一个有效 UTF-8 字符边界
    let mut boundary = max_bytes;
    while boundary > 0 && !content.is_char_boundary(boundary) {
        boundary -= 1;
    }
    let mut s = content[..boundary].to_string();
    s.push_str("\n\n... (文件过大，仅显示前 500KB)");
    s
}

// ── 文件夹树浏览 ──────────────────────────────────────────────

#[derive(serde::Serialize, Clone)]
pub struct FolderEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub children: Vec<FolderEntry>,
}

#[tauri::command]
pub fn list_folder_contents(path: String) -> Result<FolderEntry, String> {
    let root = std::path::PathBuf::from(&path);
    if !root.is_dir() {
        return Err("路径不是目录".to_string());
    }
    let abs_root = root
        .canonicalize()
        .map_err(|e| format!("路径无效: {e}"))?;
    scan_dir(&abs_root, &abs_root, 0)
}

fn scan_dir(root: &std::path::Path, dir: &std::path::Path, depth: u32) -> Result<FolderEntry, String> {
    if depth > 10 {
        return Err("目录层级过深".to_string());
    }

    let name = dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| dir.to_string_lossy().to_string());

    let mut children = Vec::new();
    let entries = fs::read_dir(dir).map_err(|e| format!("读取目录失败: {e}"))?;

    let mut dirs: Vec<std::path::PathBuf> = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {e}"))?;
        let entry_path = entry.path();
        let file_type = entry.file_type().map_err(|e| format!("获取类型失败: {e}"))?;

        // 路径穿越防护：canonicalize 解析符号链接后验证仍在 root 内
        let canonical_entry = match entry_path.canonicalize() {
            Ok(p) => p,
            Err(_) => continue, // 符号链接指向不存在目标等，跳过
        };
        if !canonical_entry.starts_with(root) {
            continue;
        }

        if file_type.is_dir() {
            dirs.push(canonical_entry);
        } else {
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let entry_name = entry.file_name().to_string_lossy().to_string();
            children.push(FolderEntry {
                name: entry_name,
                path: entry_path.to_string_lossy().to_string(),
                is_dir: false,
                size,
                children: vec![],
            });
        }
    }

    // 目录排前，文件排后，各自按名称排序
    dirs.sort_by(|a, b| {
        a.file_name().unwrap_or_default().cmp(b.file_name().unwrap_or_default())
    });
    children.sort_by(|a, b| a.name.cmp(&b.name));

    let mut result_children = Vec::new();
    for d in &dirs {
        result_children.push(scan_dir(root, d, depth + 1)?);
    }
    result_children.extend(children);

    Ok(FolderEntry {
        name,
        path: dir.to_string_lossy().to_string(),
        is_dir: true,
        size: 0,
        children: result_children,
    })
}
