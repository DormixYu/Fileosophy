use crate::commands::utils::{hex_encode, read_json_frame, send_json_frame};
use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::events;

/// 接收文件大小上限（500MB）
const MAX_RECEIVED_FILE_SIZE: u64 = 500 * 1024 * 1024;

/// 最大并发连接数
const MAX_CONNECTIONS: u32 = 10;

/// 文件传输协议头部，通过 JSON 序列化后以 4 字节长度前缀发送
#[derive(Debug, Serialize, Deserialize)]
pub struct TransferHeader {
    pub file_name: String,
    pub file_size: u64,
    pub sender: String,
    pub token: String,
    pub sha256_hash: String,
}

/// 接收到的文件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceivedFile {
    pub file_name: String,
    pub file_size: u64,
    pub sender: String,
    pub saved_path: String,
}

/// 文件传输服务器，监听局域网连接
pub struct FileTransferServer {
    port: u16,
    #[allow(dead_code)]
    running: Arc<AtomicBool>,
    #[allow(dead_code)]
    connection_count: Arc<AtomicU32>,
    expected_token: String,
}

impl FileTransferServer {
    /// 启动文件传输服务器，返回监听端口
    pub fn start(app_handle: AppHandle) -> Result<Self, String> {
        let listener = TcpListener::bind("0.0.0.0:0").map_err(|e| format!("绑定端口失败: {e}"))?;
        let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = Arc::clone(&running);
        let connection_count = Arc::new(AtomicU32::new(0));
        let conn_count_clone = Arc::clone(&connection_count);
        let expected_token = Uuid::new_v4().to_string();
        let expected_token_clone = expected_token.clone();

        thread::spawn(move || {
            log::info!("文件传输服务器已启动，端口: {port}");
            listener.set_nonblocking(true).ok();

            loop {
                if !running_clone.load(Ordering::SeqCst) {
                    break;
                }

                match listener.accept() {
                    Ok((stream, addr)) => {
                        // 检查连接数上限
                        if conn_count_clone.load(Ordering::SeqCst) >= MAX_CONNECTIONS {
                            log::warn!("拒绝连接 {addr}: 已达到最大连接数 {MAX_CONNECTIONS}");
                            continue;
                        }
                        log::info!("收到连接: {addr}");
                        conn_count_clone.fetch_add(1, Ordering::SeqCst);
                        let handle = app_handle.clone();
                        let cc = Arc::clone(&conn_count_clone);
                        let token = expected_token_clone.clone();
                        thread::spawn(move || {
                            if let Err(e) = handle_incoming(stream, handle, &token) {
                                log::error!("处理传入文件失败: {e}");
                            }
                            cc.fetch_sub(1, Ordering::SeqCst);
                        });
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(std::time::Duration::from_millis(100));
                        continue;
                    }
                    Err(e) => {
                        log::error!("接受连接失败: {e}");
                        break;
                    }
                }
            }
        });

        Ok(Self { port, running, connection_count, expected_token })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn expected_token(&self) -> &str {
        &self.expected_token
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

pub type TransferState = std::sync::Mutex<FileTransferServer>;

#[tauri::command]
pub fn get_transfer_token(state: State<'_, TransferState>) -> Result<String, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    Ok(guard.expected_token().to_string())
}

/// 处理传入的文件传输连接
fn handle_incoming(stream: TcpStream, app_handle: AppHandle, expected_token: &str) -> Result<(), String> {
    // 显式设为阻塞模式（Windows 上从非阻塞 listener accept 的 stream 可能继承非阻塞）
    let socket = socket2::Socket::from(stream);
    socket.set_nonblocking(false).map_err(|e| format!("设置阻塞模式失败: {e}"))?;
    let mut stream: TcpStream = socket.into();

    stream.set_read_timeout(Some(std::time::Duration::from_secs(30)))
        .map_err(|e| format!("设置读超时失败: {e}"))?;
    stream.set_write_timeout(Some(std::time::Duration::from_secs(30)))
        .map_err(|e| format!("设置写超时失败: {e}"))?;

    let header: TransferHeader = read_json_frame(&mut stream)?;

    // 检查接收文件大小上限
    if header.file_size > MAX_RECEIVED_FILE_SIZE {
        return Err(format!("接收文件过大: {} bytes，超过上限 {} bytes", header.file_size, MAX_RECEIVED_FILE_SIZE));
    }

    // 检查 token 是否与 expected_token 匹配
    if header.token != expected_token {
        return Err("认证 token 不匹配，连接被拒绝".to_string());
    }

    // 确定保存路径
    let save_dir = get_received_files_dir(&app_handle);
    fs::create_dir_all(&save_dir).map_err(|e| format!("创建接收目录失败: {e}"))?;

    let safe_name = sanitize_filename(&header.file_name);
    let save_path = unique_file_path(&save_dir, &safe_name);

    // 读取文件内容
    let mut file = fs::File::create(&save_path).map_err(|e| format!("创建文件失败: {e}"))?;
    let mut remaining = header.file_size;
    let mut buf = vec![0u8; 8192];

    while remaining > 0 {
        let to_read = std::cmp::min(remaining, buf.len() as u64) as usize;
        stream
            .read_exact(&mut buf[..to_read])
            .map_err(|e| format!("读取文件数据失败: {e}"))?;
        file.write_all(&buf[..to_read])
            .map_err(|e| format!("写入文件失败: {e}"))?;
        remaining -= to_read as u64;
    }

    // 验证 SHA-256
    let mut hasher = Sha256::new();
    {
        let mut verify_file = fs::File::open(&save_path).map_err(|e| format!("打开文件验证hash失败: {e}"))?;
        std::io::copy(&mut verify_file, &mut hasher).map_err(|e| format!("计算验证hash失败: {e}"))?;
    }
    let computed_hash = hex_encode(&hasher.finalize());
    if computed_hash != header.sha256_hash {
        let _ = fs::remove_file(&save_path);
        return Err(format!("文件完整性校验失败: SHA-256 不匹配 (期望: {}, 实际: {})", header.sha256_hash, computed_hash));
    }

    log::info!(
        "文件接收完成: {} ({} bytes) from {}",
        header.file_name,
        header.file_size,
        header.sender
    );

    // 发送接收确认事件给前端
    let received = ReceivedFile {
        file_name: header.file_name,
        file_size: header.file_size,
        sender: header.sender,
        saved_path: save_path.to_string_lossy().to_string(),
    };

    let _ = app_handle.emit(events::EVENT_FILE_SHARED, &received);
    let _ = app_handle.emit(
        events::EVENT_NOTIFICATION,
        serde_json::json!({
            "type": "file-received",
            "title": "收到文件",
            "message": format!("{} 发送了 \"{}\"", received.sender, received.file_name),
        }),
    );

    Ok(())
}

/// 向指定对等节点发送文件
pub fn send_file(
    peer_addr: &str,
    peer_port: u16,
    file_path: &str,
    sender_name: &str,
    token: &str,
) -> Result<(), String> {
    let src = PathBuf::from(file_path);
    if !src.exists() {
        return Err("文件不存在".to_string());
    }

    let file_name = src
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let file_size = fs::metadata(&src)
        .map(|m| m.len())
        .map_err(|e| format!("获取文件大小失败: {e}"))?;

    // 计算 SHA-256
    let mut hasher = Sha256::new();
    {
        let mut hash_file = fs::File::open(&src).map_err(|e| format!("打开文件计算hash失败: {e}"))?;
        std::io::copy(&mut hash_file, &mut hasher).map_err(|e| format!("计算文件hash失败: {e}"))?;
    }
    let sha256_hash = hex_encode(&hasher.finalize());

    let header = TransferHeader {
        file_name,
        file_size,
        sender: sender_name.to_string(),
        token: token.to_string(),
        sha256_hash,
    };

    let addr = format!("{peer_addr}:{peer_port}");
    let mut stream =
        TcpStream::connect(&addr).map_err(|e| format!("连接对等节点失败: {e}"))?;

    // 发送 JSON 头部帧
    send_json_frame(&mut stream, &header)?;

    let mut file = fs::File::open(&src).map_err(|e| format!("打开文件失败: {e}"))?;
    std::io::copy(&mut file, &mut stream).map_err(|e| format!("发送文件内容失败: {e}"))?;

    log::info!("文件发送完成: {file_path} -> {addr}");
    Ok(())
}

fn get_received_files_dir(app_handle: &AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("received_files")
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c => c,
        })
        .collect()
}

fn unique_file_path(dir: &PathBuf, name: &str) -> PathBuf {
    let path = dir.join(name);
    if !path.exists() {
        return path;
    }

    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    let ext = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();

    for i in 1..10000 {
        let new_name = format!("{stem}_{i}{ext}");
        let new_path = dir.join(&new_name);
        if !new_path.exists() {
            return new_path;
        }
    }

    path
}
