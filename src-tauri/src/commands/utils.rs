/// 从 settings 表读取值
pub fn get_setting(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |row| row.get::<_, String>(0),
    )
    .ok()
}

/// 向 settings 表写入值
pub fn set_setting(conn: &rusqlite::Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// hex 编码辅助
pub fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// TCP 帧协议常量：最大帧大小
pub const MAX_FRAME_SIZE: usize = 10 * 1024 * 1024;

/// TCP 帧协议：读取 JSON 帧
pub fn read_json_frame<T: serde::de::DeserializeOwned>(stream: &mut std::net::TcpStream) -> Result<T, String> {
    use std::io::Read;

    let mut len_buf = [0u8; 4];
    stream
        .read_exact(&mut len_buf)
        .map_err(|e| format!("读取帧长度失败: {e}"))?;
    let frame_len = u32::from_be_bytes(len_buf) as usize;
    if frame_len > MAX_FRAME_SIZE {
        return Err(format!("帧大小超限: {frame_len} > {MAX_FRAME_SIZE}"));
    }

    let mut frame_buf = vec![0u8; frame_len];
    stream
        .read_exact(&mut frame_buf)
        .map_err(|e| format!("读取帧数据失败: {e}"))?;

    serde_json::from_slice(&frame_buf).map_err(|e| format!("解析帧数据失败: {e}"))
}

/// TCP 帧协议：发送 JSON 帧
pub fn send_json_frame(stream: &mut std::net::TcpStream, data: &impl serde::Serialize) -> Result<(), String> {
    use std::io::Write;

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

/// 设置 TCP 流超时
pub fn set_stream_timeout(stream: &mut std::net::TcpStream, timeout: std::time::Duration) -> Result<(), String> {
    stream.set_read_timeout(Some(timeout)).map_err(|e| format!("设置读超时失败: {e}"))?;
    stream.set_write_timeout(Some(timeout)).map_err(|e| format!("设置写超时失败: {e}"))?;
    Ok(())
}