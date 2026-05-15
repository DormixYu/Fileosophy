use crate::commands::utils::{hex_encode, read_json_frame, send_json_frame, set_stream_timeout};
use crate::events;
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::thread;
use std::time::Duration;
use tauri::State;

/// 最大并发连接数
const MAX_SHARE_CONNECTIONS: u32 = 10;

// ── 协议消息 ──────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
enum ShareRequest {
    #[serde(rename = "auth")]
    Auth { password_hash: String },
    #[serde(rename = "list_dir")]
    ListDir { path: String },
    #[serde(rename = "download")]
    Download { path: String },
    #[serde(rename = "upload")]
    Upload { path: String, file_name: String, file_size: u64 },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DirEntry {
    name: String,
    is_dir: bool,
    size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
enum ServerResponse {
    #[serde(rename = "nonce")]
    Nonce { nonce: String },
    #[serde(rename = "status")]
    Status { success: bool, message: Option<String> },
    #[serde(rename = "list")]
    List { entries: Vec<DirEntry> },
    #[serde(rename = "download_header")]
    DownloadHeader { file_name: String, file_size: u64, sha256_hash: String },
    #[serde(rename = "upload_ack")]
    UploadAck { accepted: bool, reason: Option<String> },
}

// ── 活动日志 ──────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct ActivityLogEntry {
    pub client_addr: String,
    pub action: String,
    pub file_path: String,
    pub file_size: u64,
    pub timestamp: String,
}

const MAX_ACTIVITY_LOG: usize = 100;

// ── 服务器 ────────────────────────────────────────────────────

pub struct FolderShareServer {
    port: u16,
    running: Arc<AtomicBool>,
    root_path: PathBuf,
    clients: Arc<Mutex<Vec<ClientInfo>>>,
    activity_log: Arc<Mutex<Vec<ActivityLogEntry>>>,
    #[allow(dead_code)]
    connection_count: Arc<AtomicU32>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ClientInfo {
    pub addr: String,
    pub connected_at: String,
}

impl FolderShareServer {
    pub fn start(root_path: String, password: String) -> Result<Self, String> {
        let path = PathBuf::from(&root_path);
        if !path.is_dir() {
            return Err("文件夹路径不存在或不是目录".to_string());
        }

        let abs_root = path
            .canonicalize()
            .map_err(|e| format!("获取绝对路径失败: {e}"))?;

        let listener =
            TcpListener::bind("0.0.0.0:0").map_err(|e| format!("绑定端口失败: {e}"))?;
        let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = Arc::clone(&running);
        let pw = password.clone();
        let root_clone = abs_root.clone();
        let clients = Arc::new(Mutex::new(Vec::<ClientInfo>::new()));
        let clients_clone = Arc::clone(&clients);
        let activity_log = Arc::new(Mutex::new(Vec::<ActivityLogEntry>::new()));
        let activity_log_clone = Arc::clone(&activity_log);
        let connection_count = Arc::new(AtomicU32::new(0));
        let conn_count_clone = Arc::clone(&connection_count);

        thread::spawn(move || {
            log::info!("文件夹分享服务器已启动，端口: {port}, 根目录: {:?}", root_clone);
            listener.set_nonblocking(true).ok();

            loop {
                if !running_clone.load(Ordering::SeqCst) {
                    break;
                }

                match listener.accept() {
                    Ok((stream, addr)) => {
                        // 检查连接数上限：发送明确拒绝消息后关闭
                        if conn_count_clone.load(Ordering::SeqCst) >= MAX_SHARE_CONNECTIONS {
                            log::warn!("拒绝分享连接 {addr}: 已达到最大连接数 {MAX_SHARE_CONNECTIONS}");
                            let mut s = stream;
                            if s.set_write_timeout(Some(Duration::from_secs(2))).is_ok() {
                                let _ = send_json_frame(&mut s, &ServerResponse::Status {
                                    success: false,
                                    message: Some(format!("已达最大连接数 {}", MAX_SHARE_CONNECTIONS)),
                                });
                            }
                            continue;
                        }
                        log::info!("分享连接: {addr}");
                        conn_count_clone.fetch_add(1, Ordering::SeqCst);
                        let pw = pw.clone();
                        let root = root_clone.clone();
                        let client_addr = addr.to_string();
                        let clients = Arc::clone(&clients_clone);

                        // 记录已连接客户端
                        {
                            let Ok(mut guard) = clients.lock() else {
                                log::error!("无法获取客户端列表锁（可能已损坏），跳过连接记录");
                                continue;
                            };
                            guard.push(ClientInfo {
                                addr: client_addr.clone(),
                                connected_at: chrono::Local::now().to_rfc3339(),
                            });
                        }

                        let activity_log = Arc::clone(&activity_log_clone);
                        let cc = Arc::clone(&conn_count_clone);

                        thread::spawn(move || {
                            let result = handle_connection(stream, &root, &pw, &client_addr, &activity_log);
                            // 连接断开后移除客户端记录并减少连接计数
                            {
                                if let Ok(mut guard) = clients.lock() {
                                    guard.retain(|c| c.addr != client_addr);
                                }
                            }
                            cc.fetch_sub(1, Ordering::SeqCst);
                            if let Err(e) = result {
                                log::error!("处理分享连接失败: {e}");
                            }
                        });
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(std::time::Duration::from_millis(100));
                        continue;
                    }
                    Err(e) => {
                        log::error!("接受分享连接失败: {e}");
                        break;
                    }
                }
            }
        });

        Ok(Self {
            port,
            running,
            root_path: abs_root,
            clients,
            activity_log,
            connection_count,
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn root_path(&self) -> &Path {
        &self.root_path
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}

// ── 连接处理 ──────────────────────────────────────────────────

fn handle_connection(stream: TcpStream, root: &Path, password: &str, client_addr: &str, activity_log: &Arc<Mutex<Vec<ActivityLogEntry>>>) -> Result<(), String> {
    // 显式设为阻塞模式（Windows 上从非阻塞 listener accept 的 stream 可能继承非阻塞）
    let socket = socket2::Socket::from(stream);
    socket.set_nonblocking(false).map_err(|e| format!("设置阻塞模式失败: {e}"))?;
    let mut stream: TcpStream = socket.into();

    stream.set_read_timeout(Some(Duration::from_secs(60)))
        .map_err(|e| format!("设置读超时失败: {e}"))?;
    stream.set_write_timeout(Some(Duration::from_secs(60)))
        .map_err(|e| format!("设置写超时失败: {e}"))?;

    // 第一步：发送 nonce
    let nonce = generate_nonce();
    send_json_frame(&mut stream, &ServerResponse::Nonce { nonce: nonce.clone() })?;

    // 第二步：读取认证请求（含 password_hash）
    let auth_req: ShareRequest = read_json_frame(&mut stream)?;
    let authenticated = match &auth_req {
        ShareRequest::Auth { password_hash: pw_hash } => {
            // 计算 SHA-256(password + nonce)，与客户端发来的 hash 比对
            let expected_hash = compute_auth_hash(password, &nonce);
            pw_hash == &expected_hash // hex 字符串长度固定，比较天然恒定时间
        },
        _ => false,
    };

    if !authenticated {
        send_json_frame(&mut stream, &ServerResponse::Status {
            success: false,
            message: Some("认证失败，密码错误或请求格式错误".to_string()),
        })?;
        return Err("认证失败".to_string());
    }

    // 发送认证成功响应
    send_json_frame(&mut stream, &ServerResponse::Status {
        success: true,
        message: None,
    })?;

    // 命令循环
    loop {
        let request = match read_json_frame::<ShareRequest>(&mut stream) {
            Ok(req) => req,
            Err(_) => break, // 连接关闭或超时
        };

        match request {
            ShareRequest::Auth { .. } => {
                // 已认证，忽略重复认证
                send_json_frame(&mut stream, &ServerResponse::Status {
                    success: true,
                    message: Some("已认证".to_string()),
                })?;
            }
            ShareRequest::ListDir { path } => {
                set_stream_timeout(&mut stream, Duration::from_secs(30))?;
                let result = handle_list_dir(root, &path);
                match result {
                    Ok(entries) => {
                        send_json_frame(&mut stream, &ServerResponse::List { entries })?;
                    }
                    Err(e) => {
                        send_json_frame(&mut stream, &ServerResponse::Status {
                            success: false,
                            message: Some(e),
                        })?;
                    }
                }
            }
            ShareRequest::Download { path } => {
                set_stream_timeout(&mut stream, Duration::from_secs(300))?;
                if let Err(e) = handle_download(&mut stream, root, &path, client_addr, activity_log) {
                    log::error!("下载失败: {e}");
                    let _ = send_json_frame(&mut stream, &ServerResponse::Status {
                        success: false,
                        message: Some(e),
                    });
                }
            }
            ShareRequest::Upload { path, file_name, file_size } => {
                set_stream_timeout(&mut stream, Duration::from_secs(300))?;
                if let Err(e) = handle_upload(&mut stream, root, &path, &file_name, file_size, client_addr, activity_log) {
                    log::error!("上传失败: {e}");
                }
            }
        }
    }

    Ok(())
}

/// 处理列目录请求，返回目录条目列表
fn handle_list_dir(root: &Path, rel_path: &str) -> Result<Vec<DirEntry>, String> {
    let target = resolve_path(root, rel_path)?;
    if !target.is_dir() {
        return Err("路径不是目录".to_string());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(&target).map_err(|e| format!("读取目录失败: {e}"))? {
        let entry = entry.map_err(|e| format!("读取目录项失败: {e}"))?;
        let name = entry
            .file_name()
            .to_string_lossy()
            .to_string();
        let file_type = entry.file_type().map_err(|e| format!("获取文件类型失败: {e}"))?;
        let size = if file_type.is_file() {
            entry.metadata().map(|m| m.len()).unwrap_or(0)
        } else {
            0
        };
        entries.push(DirEntry {
            name,
            is_dir: file_type.is_dir(),
            size,
        });
    }

    // 目录在前，按名称排序
    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.cmp(&b.name)
        }
    });

    Ok(entries)
}

/// 处理文件下载请求
fn handle_download(stream: &mut TcpStream, root: &Path, rel_path: &str, client_addr: &str, activity_log: &Arc<Mutex<Vec<ActivityLogEntry>>>) -> Result<(), String> {
    let target = resolve_path(root, rel_path)?;
    if !target.is_file() {
        return Err("路径不是文件".to_string());
    }

    let file_size = fs::metadata(&target)
        .map(|m| m.len())
        .map_err(|e| format!("获取文件大小失败: {e}"))?;

    let file_name = target
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    // 计算 SHA-256
    let mut hasher = Sha256::new();
    {
        let mut hash_file = fs::File::open(&target).map_err(|e| format!("打开文件计算hash失败: {e}"))?;
        std::io::copy(&mut hash_file, &mut hasher).map_err(|e| format!("计算文件hash失败: {e}"))?;
    }
    let sha256_hash = hex_encode(&hasher.finalize());

    // 发送下载头（使用统一帧协议）
    send_json_frame(stream, &ServerResponse::DownloadHeader { file_name, file_size, sha256_hash })?;

    // 发送文件内容
    let mut file = fs::File::open(&target).map_err(|e| format!("打开文件失败: {e}"))?;
    std::io::copy(&mut file, stream).map_err(|e| format!("发送文件内容失败: {e}"))?;

    // 记录下载活动
    log_activity(activity_log, client_addr, "download", rel_path, file_size);

    Ok(())
}

/// 记录活动日志（FIFO 淘汰，最多 MAX_ACTIVITY_LOG 条）
fn log_activity(activity_log: &Arc<Mutex<Vec<ActivityLogEntry>>>, client_addr: &str, action: &str, file_path: &str, file_size: u64) {
    if let Ok(mut guard) = activity_log.lock() {
        guard.push(ActivityLogEntry {
            client_addr: client_addr.to_string(),
            action: action.to_string(),
            file_path: file_path.to_string(),
            file_size,
            timestamp: chrono::Local::now().to_rfc3339(),
        });
        if guard.len() > MAX_ACTIVITY_LOG {
            let excess = guard.len() - MAX_ACTIVITY_LOG;
            guard.drain(0..excess);
        }
    }
}

/// 上传文件大小上限（500MB）
const MAX_UPLOAD_SIZE: u64 = 500 * 1024 * 1024;

/// 处理文件上传请求
fn handle_upload(
    stream: &mut TcpStream,
    root: &Path,
    rel_dir: &str,
    file_name: &str,
    file_size: u64,
    client_addr: &str,
    activity_log: &Arc<Mutex<Vec<ActivityLogEntry>>>,
) -> Result<(), String> {
    // 检查上传大小
    if file_size > MAX_UPLOAD_SIZE {
        send_json_frame(stream, &ServerResponse::UploadAck {
            accepted: false,
            reason: Some(format!("文件过大: {} bytes，上传上限 {} bytes", file_size, MAX_UPLOAD_SIZE)),
        })?;
        return Err("上传文件过大".to_string());
    }

    // 解析目标目录路径
    let target_dir = resolve_path(root, rel_dir)?;
    if !target_dir.is_dir() {
        send_json_frame(stream, &ServerResponse::UploadAck {
            accepted: false,
            reason: Some("目标路径不是目录".to_string()),
        })?;
        return Err("目标路径不是目录".to_string());
    }

    // 构建完整目标文件路径并验证安全
    let canonical_dir = target_dir.canonicalize().map_err(|_| "目标目录路径无效".to_string())?;
    let clean_name = Path::new(file_name).file_name().unwrap_or_default().to_string_lossy().to_string();
    if clean_name != file_name || file_name.contains('/') || file_name.contains('\\') {
        send_json_frame(stream, &ServerResponse::UploadAck {
            accepted: false,
            reason: Some("文件名包含非法字符".to_string()),
        })?;
        return Err("文件名包含路径穿越字符".to_string());
    }

    let safe_target = canonical_dir.join(&clean_name);

    // 发送 ack 接受上传
    send_json_frame(stream, &ServerResponse::UploadAck { accepted: true, reason: None })?;

    // 确保目录存在
    if let Some(parent) = safe_target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }

    // 接收文件内容并写入
    let mut file = fs::File::create(&safe_target).map_err(|e| format!("创建文件失败: {e}"))?;
    let mut remaining = file_size;
    let mut buf = vec![0u8; 8192];
    while remaining > 0 {
        let to_read = std::cmp::min(remaining, buf.len() as u64) as usize;
        stream
            .read_exact(&mut buf[..to_read])
            .map_err(|e| {
                // 写入失败时清理不完整文件
                let _ = fs::remove_file(&safe_target);
                format!("接收上传数据失败: {e}")
            })?;
        file.write_all(&buf[..to_read])
            .map_err(|e| {
                // 写入失败时清理不完整文件
                let _ = fs::remove_file(&safe_target);
                format!("写入上传文件失败: {e}")
            })?;
        remaining -= to_read as u64;
    }

    // 记录上传活动
    let rel_path = if rel_dir.is_empty() {
        clean_name
    } else {
        format!("{}/{}", rel_dir, clean_name)
    };
    log_activity(activity_log, client_addr, "upload", &rel_path, file_size);

    Ok(())
}

/// 解析相对路径，确保不超出 root 目录（防止路径穿越）
fn resolve_path(root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    // 移除前导斜杠，防止路径穿越
    let clean = rel_path.trim_start_matches('/').trim_start_matches('\\');
    let target = if clean.is_empty() {
        root.to_path_buf()
    } else {
        let joined = root.join(clean);
        let canonical = joined
            .canonicalize()
            .map_err(|_| format!("路径无效: {rel_path}"))?;
        if !canonical.starts_with(root) {
            return Err("路径被拒绝（目录遍历）".to_string());
        }
        canonical
    };
    Ok(target)
}

// ── Tauri 命令 ────────────────────────────────────────────────

pub type FolderShareState = Mutex<HashMap<u16, FolderShareServer>>;

#[derive(Serialize)]
pub struct ShareStatus {
    pub port: u16,
    pub path: String,
    pub is_running: bool,
}

#[tauri::command]
pub fn start_folder_share(
    app: tauri::AppHandle,
    state: State<'_, FolderShareState>,
    path: String,
    password: String,
) -> Result<u16, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;

    // 检查同路径是否已共享
    let canonical = PathBuf::from(&path).canonicalize()
        .map_err(|e| format!("路径无效: {e}"))?;
    for server in guard.values() {
        if server.root_path().canonicalize().map(|p| p == canonical).unwrap_or(false) {
            return Ok(server.port());
        }
    }

    let server = FolderShareServer::start(path, password)?;
    let port = server.port();
    guard.insert(port, server);
    events::emit_notification(&app, "success", "共享已开启", &format!("端口: {}", port), None);
    Ok(port)
}

#[tauri::command]
pub fn stop_folder_share(app: tauri::AppHandle, state: State<'_, FolderShareState>, port: u16) -> Result<(), String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    if let Some(server) = guard.remove(&port) {
        server.stop();
    }
    events::emit_notification(&app, "info", "共享已停止", "", None);
    Ok(())
}

#[tauri::command]
pub fn get_share_status(state: State<'_, FolderShareState>) -> Result<Vec<ShareStatus>, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    Ok(guard.values().map(|s| ShareStatus {
        port: s.port(),
        path: s.root_path().to_string_lossy().to_string(),
        is_running: s.is_running(),
    }).collect())
}

#[tauri::command]
pub fn get_connected_clients(state: State<'_, FolderShareState>, port: u16) -> Result<Vec<ClientInfo>, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    match guard.get(&port) {
        Some(server) => {
            let clients = server.clients.lock().map_err(|e| e.to_string())?;
            Ok(clients.clone())
        }
        None => Ok(Vec::new()),
    }
}

#[tauri::command]
pub fn get_activity_log(state: State<'_, FolderShareState>, port: u16) -> Result<Vec<ActivityLogEntry>, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    match guard.get(&port) {
        Some(server) => {
            let log = server.activity_log.lock().map_err(|e| e.to_string())?;
            Ok(log.clone())
        }
        None => Ok(Vec::new()),
    }
}

// ── TCP 客户端（加入远程共享）────────────────────────────────────

fn connect_and_auth(addr: &str, password: &str) -> Result<TcpStream, String> {
    let socket_addr = addr.parse::<std::net::SocketAddr>()
        .map_err(|e| format!("地址格式无效: {e}"))?;
    let mut stream = TcpStream::connect_timeout(&socket_addr, Duration::from_secs(5))
        .map_err(|e| format!("连接超时或失败: {e}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| format!("设置读超时失败: {e}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| format!("设置写超时失败: {e}"))?;

    // 第一步：读取服务端发送的 nonce
    let nonce_resp: ServerResponse = read_json_frame(&mut stream)?;
    let nonce = match nonce_resp {
        ServerResponse::Nonce { nonce } => nonce,
        ServerResponse::Status { success: false, message } => {
            return Err(message.unwrap_or_else(|| "服务端拒绝连接".to_string()));
        }
        _ => return Err("意外的响应类型，期望 nonce".to_string()),
    };

    // 第二步：计算 SHA-256(password + nonce)，发送 hash
    let password_hash = compute_auth_hash(password, &nonce);
    send_json_frame(&mut stream, &ShareRequest::Auth {
        password_hash,
    })?;

    // 读取认证响应
    let resp: ServerResponse = read_json_frame(&mut stream)?;
    match resp {
        ServerResponse::Status { success, message } => {
            if !success {
                return Err(message.unwrap_or_else(|| "认证失败".to_string()));
            }
        }
        _ => return Err("意外的认证响应类型".to_string()),
    }

    Ok(stream)
}

pub type RemoteDirEntry = DirEntry;

#[tauri::command]
pub fn join_shared_folder(addr: String, password: String) -> Result<String, String> {
    let _stream = connect_and_auth(&addr, &password)?;
    Ok("连接成功".to_string())
}

#[tauri::command]
pub fn list_remote_files(
    addr: String,
    password: String,
    path: String,
) -> Result<Vec<RemoteDirEntry>, String> {
    let mut stream = connect_and_auth(&addr, &password)?;
    set_stream_timeout(&mut stream, Duration::from_secs(30))?;

    send_json_frame(&mut stream, &ShareRequest::ListDir {
        path: path.clone(),
    })?;

    let resp: ServerResponse = read_json_frame(&mut stream)?;
    match resp {
        ServerResponse::List { entries } => {
            Ok(entries)
        }
        ServerResponse::Status { success: false, message } => {
            Err(message.unwrap_or_else(|| "列目录失败".to_string()))
        }
        _ => Err("意外的响应类型".to_string()),
    }
}

#[tauri::command]
pub fn download_remote_file(
    addr: String,
    password: String,
    remote_path: String,
    local_path: String,
) -> Result<String, String> {
    let local_path_buf = PathBuf::from(&local_path);
    // 验证路径有有效文件名
    local_path_buf
        .file_name()
        .ok_or_else(|| "保存路径无有效文件名".to_string())?;
    let parent_dir = local_path_buf.parent()
        .ok_or_else(|| "保存路径无父目录".to_string())?;
    fs::create_dir_all(parent_dir).map_err(|e| format!("创建目录失败: {e}"))?;

    let mut stream = connect_and_auth(&addr, &password)?;
    set_stream_timeout(&mut stream, Duration::from_secs(300))?;

    send_json_frame(&mut stream, &ShareRequest::Download {
        path: remote_path.clone(),
    })?;

    // 读取响应（可能是 DownloadHeader 或 Status 错误）
    let resp: ServerResponse = read_json_frame(&mut stream)?;
    let header = match resp {
        ServerResponse::DownloadHeader { file_size, sha256_hash, .. } => DownloadHeaderInfo { file_size, sha256_hash },
        ServerResponse::Status { success: false, message } => {
            return Err(message.unwrap_or_else(|| "下载失败".to_string()));
        }
        _ => return Err("意外的响应类型".to_string()),
    };

    // 限制文件大小上限（10 GB）
    const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024 * 1024;
    if header.file_size > MAX_FILE_SIZE {
        return Err(format!(
            "文件过大: {} bytes，超过上限 {} bytes",
            header.file_size, MAX_FILE_SIZE
        ));
    }

    // 接收文件内容（写入到用户选择的路径）
    let mut file = fs::File::create(&local_path_buf)
        .map_err(|e| format!("创建文件失败: {e}"))?;

    let mut remaining = header.file_size;
    let mut buf = vec![0u8; 8192];
    while remaining > 0 {
        let to_read = std::cmp::min(remaining, buf.len() as u64) as usize;
        stream
            .read_exact(&mut buf[..to_read])
            .map_err(|e| format!("接收文件数据失败: {e}"))?;
        file.write_all(&buf[..to_read])
            .map_err(|e| format!("写入文件失败: {e}"))?;
        remaining -= to_read as u64;
    }

    // 验证 SHA-256
    let mut hasher = Sha256::new();
    {
        let mut verify_file = fs::File::open(&local_path_buf).map_err(|e| format!("打开文件验证hash失败: {e}"))?;
        std::io::copy(&mut verify_file, &mut hasher).map_err(|e| format!("计算验证hash失败: {e}"))?;
    }
    let computed_hash = hex_encode(&hasher.finalize());
    if computed_hash != header.sha256_hash {
        let _ = fs::remove_file(&local_path_buf);
        return Err(format!("文件完整性校验失败: SHA-256 不匹配 (期望: {}, 实际: {})", header.sha256_hash, computed_hash));
    }

    Ok(local_path_buf.to_string_lossy().to_string())
}

struct DownloadHeaderInfo {
    file_size: u64,
    sha256_hash: String,
}

#[tauri::command]
pub fn upload_remote_file(
    addr: String,
    password: String,
    remote_dir: String,
    file_name: String,
    local_path: String,
) -> Result<(), String> {
    let local_path_buf = PathBuf::from(&local_path);
    if !local_path_buf.exists() {
        return Err("本地文件不存在".to_string());
    }
    let file_size = fs::metadata(&local_path_buf)
        .map(|m| m.len())
        .map_err(|e| format!("获取文件大小失败: {e}"))?;

    let mut stream = connect_and_auth(&addr, &password)?;
    set_stream_timeout(&mut stream, Duration::from_secs(300))?;

    // 发送上传请求
    send_json_frame(&mut stream, &ShareRequest::Upload {
        path: remote_dir,
        file_name: file_name.clone(),
        file_size,
    })?;

    // 读取上传确认
    let resp: ServerResponse = read_json_frame(&mut stream)?;
    match resp {
        ServerResponse::UploadAck { accepted, reason } => {
            if !accepted {
                return Err(reason.unwrap_or_else(|| "上传被拒绝".to_string()));
            }
        }
        ServerResponse::Status { success: false, message } => {
            return Err(message.unwrap_or_else(|| "上传失败".to_string()));
        }
        _ => return Err("意外的响应类型".to_string()),
    }

    // 读取本地文件并发送内容
    let mut file = fs::File::open(&local_path_buf)
        .map_err(|e| format!("打开本地文件失败: {e}"))?;
    std::io::copy(&mut file, &mut stream)
        .map_err(|e| format!("发送文件内容失败: {e}"))?;

    Ok(())
}

/// 生成随机 nonce（8 字节的 hex 字符串）
fn generate_nonce() -> String {
    let nonce_bytes: [u8; 8] = rand::random();
    hex_encode(&nonce_bytes)
}

/// 计算 SHA-256(password + nonce)，返回 hex 字符串
fn compute_auth_hash(password: &str, nonce: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hasher.update(nonce.as_bytes());
    let hash = hasher.finalize();
    hex_encode(&hash)
}
