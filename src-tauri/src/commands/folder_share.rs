use crate::events;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, State};

// ── 协议消息 ──────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
enum ShareRequest {
    #[serde(rename = "auth")]
    Auth { password: String },
    #[serde(rename = "list_dir")]
    ListDir { path: String },
    #[serde(rename = "download")]
    Download { path: String },
}

#[derive(Debug, Serialize, Deserialize)]
struct StatusResponse {
    success: bool,
    message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DirEntry {
    name: String,
    is_dir: bool,
    size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct ListDirResponse {
    entries: Vec<DirEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DownloadHeader {
    file_name: String,
    file_size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum ShareResponse {
    Status(StatusResponse),
    List(ListDirResponse),
}

// ── 服务器 ────────────────────────────────────────────────────

pub struct FolderShareServer {
    port: u16,
    running: Arc<AtomicBool>,
    password: String,
    root_path: PathBuf,
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

        thread::spawn(move || {
            log::info!("文件夹分享服务器已启动，端口: {port}, 根目录: {:?}", root_clone);
            listener.set_nonblocking(true).ok();

            loop {
                if !running_clone.load(Ordering::SeqCst) {
                    break;
                }

                match listener.accept() {
                    Ok((stream, addr)) => {
                        log::info!("分享连接: {addr}");
                        let pw = pw.clone();
                        let root = root_clone.clone();
                        thread::spawn(move || {
                            if let Err(e) = handle_connection(stream, &root, &pw) {
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
            password,
            root_path: abs_root,
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

fn handle_connection(mut stream: TcpStream, root: &Path, password: &str) -> Result<(), String> {
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(60)))
        .ok();

    // 第一步：认证
    let auth_req: ShareRequest = read_json_frame(&mut stream)?;
    let authenticated = match &auth_req {
        ShareRequest::Auth { password: pw } => pw == password,
        _ => false,
    };

    if !authenticated {
        let resp = StatusResponse {
            success: false,
            message: Some("认证失败，密码错误或请求格式错误".to_string()),
        };
        send_json_frame(&mut stream, &ShareResponse::Status(resp))?;
        return Err("认证失败".to_string());
    }

    // 发送认证成功响应
    let ok = StatusResponse {
        success: true,
        message: None,
    };
    send_json_frame(&mut stream, &ShareResponse::Status(ok))?;

    // 命令循环
    loop {
        let request = match read_json_frame::<ShareRequest>(&mut stream) {
            Ok(req) => req,
            Err(_) => break, // 连接关闭或超时
        };

        match request {
            ShareRequest::Auth { .. } => {
                // 已认证，忽略重复认证
                let resp = StatusResponse {
                    success: true,
                    message: Some("已认证".to_string()),
                };
                send_json_frame(&mut stream, &ShareResponse::Status(resp))?;
            }
            ShareRequest::ListDir { path } => {
                let result = handle_list_dir(root, &path);
                match result {
                    Ok(entries) => {
                        send_json_frame(&mut stream, &ShareResponse::List(ListDirResponse { entries }))?;
                    }
                    Err(e) => {
                        let resp = StatusResponse {
                            success: false,
                            message: Some(e),
                        };
                        send_json_frame(&mut stream, &ShareResponse::Status(resp))?;
                    }
                }
            }
            ShareRequest::Download { path } => {
                if let Err(e) = handle_download(&mut stream, root, &path) {
                    log::error!("下载失败: {e}");
                    // 发送失败响应（通过 JSON 帧，因为文件传输前需要先发送 header）
                    let resp = StatusResponse {
                        success: false,
                        message: Some(e),
                    };
                    let _ = send_json_frame(&mut stream, &ShareResponse::Status(resp));
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
fn handle_download(stream: &mut TcpStream, root: &Path, rel_path: &str) -> Result<(), String> {
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

    // 发送下载头
    let header = DownloadHeader {
        file_name,
        file_size,
    };
    let header_json = serde_json::to_vec(&header).map_err(|e| format!("序列化下载头失败: {e}"))?;
    let header_len = (header_json.len() as u32).to_be_bytes();
    stream
        .write_all(&header_len)
        .map_err(|e| format!("发送下载头长度失败: {e}"))?;
    stream
        .write_all(&header_json)
        .map_err(|e| format!("发送下载头失败: {e}"))?;

    // 发送文件内容
    let mut file = fs::File::open(&target).map_err(|e| format!("打开文件失败: {e}"))?;
    std::io::copy(&mut file, stream).map_err(|e| format!("发送文件内容失败: {e}"))?;

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

// ── 帧读写工具 ────────────────────────────────────────────────

fn read_json_frame<T: serde::de::DeserializeOwned>(stream: &mut TcpStream) -> Result<T, String> {
    let mut len_buf = [0u8; 4];
    stream
        .read_exact(&mut len_buf)
        .map_err(|e| format!("读取帧长度失败: {e}"))?;
    let frame_len = u32::from_be_bytes(len_buf) as usize;

    let mut frame_buf = vec![0u8; frame_len];
    stream
        .read_exact(&mut frame_buf)
        .map_err(|e| format!("读取帧数据失败: {e}"))?;

    serde_json::from_slice(&frame_buf).map_err(|e| format!("解析帧数据失败: {e}"))
}

fn send_json_frame(stream: &mut TcpStream, data: &impl Serialize) -> Result<(), String> {
    let json_bytes = serde_json::to_vec(data).map_err(|e| format!("序列化失败: {e}"))?;
    let len_bytes = (json_bytes.len() as u32).to_be_bytes();
    stream
        .write_all(&len_bytes)
        .map_err(|e| format!("发送帧长度失败: {e}"))?;
    stream
        .write_all(&json_bytes)
        .map_err(|e| format!("发送帧数据失败: {e}"))?;
    Ok(())
}

// ── Tauri 命令 ────────────────────────────────────────────────

pub type FolderShareState = Mutex<Option<FolderShareServer>>;

#[derive(Serialize)]
pub struct ShareStatus {
    pub port: u16,
    pub path: String,
}

#[tauri::command]
pub fn start_folder_share(
    app: tauri::AppHandle,
    state: State<'_, FolderShareState>,
    path: String,
    password: String,
) -> Result<u16, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;

    // 检查是否已在运行
    if let Some(ref server) = *guard {
        if server.is_running() {
            return Ok(server.port());
        }
    }

    let server = FolderShareServer::start(path, password)?;
    let port = server.port();
    *guard = Some(server);
    events::emit_notification(&app, "success", "共享已开启", &format!("端口: {}", port), None);
    Ok(port)
}

#[tauri::command]
pub fn stop_folder_share(app: tauri::AppHandle, state: State<'_, FolderShareState>) -> Result<(), String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    if let Some(server) = guard.take() {
        server.stop();
    }
    events::emit_notification(&app, "info", "共享已停止", "", None);
    Ok(())
}

#[tauri::command]
pub fn get_share_status(state: State<'_, FolderShareState>) -> Result<Option<ShareStatus>, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    Ok(guard.as_ref().map(|s| ShareStatus {
        port: s.port(),
        path: s.root_path().to_string_lossy().to_string(),
    }))
}

// ── TCP 客户端（加入远程共享）────────────────────────────────────

fn connect_and_auth(addr: &str, password: &str) -> Result<TcpStream, String> {
    let mut stream = TcpStream::connect(addr)
        .map_err(|e| format!("连接失败: {e}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| format!("设置超时失败: {e}"))?;

    // 发送认证请求
    send_json_frame(&mut stream, &ShareRequest::Auth {
        password: password.to_string(),
    })?;

    // 读取认证响应
    let resp: StatusResponse = read_json_frame(&mut stream)?;
    if !resp.success {
        return Err(resp.message.unwrap_or_else(|| "认证失败".to_string()));
    }

    Ok(stream)
}

#[derive(Serialize)]
pub struct RemoteDirEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
}

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

    send_json_frame(&mut stream, &ShareRequest::ListDir {
        path: path.clone(),
    })?;

    let resp: ListDirResponse = read_json_frame(&mut stream)?;
    Ok(resp.entries.into_iter().map(|e| RemoteDirEntry {
        name: e.name,
        is_dir: e.is_dir,
        size: e.size,
    }).collect())
}

#[tauri::command]
pub fn download_remote_file(
    addr: String,
    password: String,
    remote_path: String,
    local_path: String,
) -> Result<(), String> {
    let mut stream = connect_and_auth(&addr, &password)?;

    send_json_frame(&mut stream, &ShareRequest::Download {
        path: remote_path.clone(),
    })?;

    // 读取下载头
    let mut len_buf = [0u8; 4];
    stream
        .read_exact(&mut len_buf)
        .map_err(|e| format!("读取下载头长度失败: {e}"))?;
    let header_len = u32::from_be_bytes(len_buf) as usize;

    let mut header_buf = vec![0u8; header_len];
    stream
        .read_exact(&mut header_buf)
        .map_err(|e| format!("读取下载头数据失败: {e}"))?;

    let header: DownloadHeader =
        serde_json::from_slice(&header_buf).map_err(|e| format!("解析下载头失败: {e}"))?;

    // 确保目标目录存在
    if let Some(parent) = Path::new(&local_path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {e}"))?;
    }

    // 接收文件内容
    let mut file = fs::File::create(&local_path)
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

    Ok(())
}
