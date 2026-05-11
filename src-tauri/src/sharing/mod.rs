use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

use crate::events;

/// 文件传输协议头部，通过 JSON 序列化后以 4 字节长度前缀发送
#[derive(Debug, Serialize, Deserialize)]
pub struct TransferHeader {
    pub file_name: String,
    pub file_size: u64,
    pub sender: String,
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
    running: Arc<Mutex<bool>>,
}

impl FileTransferServer {
    /// 启动文件传输服务器，返回监听端口
    pub fn start(app_handle: AppHandle) -> Result<Self, String> {
        let listener = TcpListener::bind("0.0.0.0:0").map_err(|e| format!("绑定端口失败: {e}"))?;
        let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
        let running = Arc::new(Mutex::new(true));
        let running_clone = Arc::clone(&running);

        thread::spawn(move || {
            log::info!("文件传输服务器已启动，端口: {port}");
            listener.set_nonblocking(true).ok();

            loop {
                if !running_clone.lock().map(|r| *r).unwrap_or(false) {
                    break;
                }

                match listener.accept() {
                    Ok((stream, addr)) => {
                        log::info!("收到连接: {addr}");
                        let handle = app_handle.clone();
                        thread::spawn(move || {
                            if let Err(e) = handle_incoming(stream, handle) {
                                log::error!("处理传入文件失败: {e}");
                            }
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

        Ok(Self { port, running })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn stop(&self) {
        if let Ok(mut r) = self.running.lock() {
            *r = false;
        }
    }
}

/// 处理传入的文件传输连接
fn handle_incoming(mut stream: TcpStream, app_handle: AppHandle) -> Result<(), String> {
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(30)))
        .ok();

    // 读取 4 字节头部长度
    let mut len_buf = [0u8; 4];
    stream
        .read_exact(&mut len_buf)
        .map_err(|e| format!("读取头部长度失败: {e}"))?;
    let header_len = u32::from_be_bytes(len_buf) as usize;

    // 读取 JSON 头部
    let mut header_buf = vec![0u8; header_len];
    stream
        .read_exact(&mut header_buf)
        .map_err(|e| format!("读取头部数据失败: {e}"))?;
    let header: TransferHeader =
        serde_json::from_slice(&header_buf).map_err(|e| format!("解析头部失败: {e}"))?;

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
        let bytes_read = stream
            .read(&mut buf[..to_read])
            .map_err(|e| format!("读取文件数据失败: {e}"))?;
        if bytes_read == 0 {
            break;
        }
        file.write_all(&buf[..bytes_read])
            .map_err(|e| format!("写入文件失败: {e}"))?;
        remaining -= bytes_read as u64;
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

    let header = TransferHeader {
        file_name,
        file_size,
        sender: sender_name.to_string(),
    };

    let header_json =
        serde_json::to_vec(&header).map_err(|e| format!("序列化头部失败: {e}"))?;
    let header_len = (header_json.len() as u32).to_be_bytes();

    let addr = format!("{peer_addr}:{peer_port}");
    let mut stream =
        TcpStream::connect(&addr).map_err(|e| format!("连接对等节点失败: {e}"))?;

    // 发送: 4字节长度 + JSON头部 + 文件内容
    stream
        .write_all(&header_len)
        .map_err(|e| format!("发送头部长度失败: {e}"))?;
    stream
        .write_all(&header_json)
        .map_err(|e| format!("发送头部数据失败: {e}"))?;

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
