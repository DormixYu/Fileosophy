use tauri::AppHandle;
use tauri::Manager;

#[tauri::command]
pub fn open_user_guide(app: AppHandle) -> Result<(), String> {
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;

    // 开发模式: src-tauri/resources/user-guide.html
    // 生产模式: resource_dir/user-guide.html
    let html_path = if resource_dir.join("user-guide.html").exists() {
        resource_dir.join("user-guide.html")
    } else if resource_dir.join("resources").join("user-guide.html").exists() {
        resource_dir.join("resources").join("user-guide.html")
    } else {
        return Err("使用手册文件不存在".to_string());
    };

    let path_str = html_path.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &path_str])
        .spawn()
        .map_err(|e| format!("打开使用手册失败: {e}"))?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path_str)
        .spawn()
        .map_err(|e| format!("打开使用手册失败: {e}"))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path_str)
        .spawn()
        .map_err(|e| format!("打开使用手册失败: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    // 拒绝 URL 协议前缀（防止 explorer 解释 URL）
    let lower = path.trim_start().to_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://")
        || lower.starts_with("ftp://") || lower.starts_with("ftps://")
        || lower.starts_with("file://") || lower.starts_with("mailto:")
    {
        return Err("不允许打开 URL 路径".to_string());
    }

    // 检查路径是否存在
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("文件夹不存在".to_string());
    }

    // 检查是否为目录
    if !p.is_dir() {
        return Err("路径不是目录".to_string());
    }

    // 禁止含 shell 元字符和控制字符的路径（防止命令注入）
    if path.contains('&') || path.contains('|') || path.contains(';')
        || path.contains('^') || path.contains('%') || path.contains('<')
        || path.contains('>') || path.contains('!') || path.contains('"')
        || path.contains('\n') || path.contains('\r')
    {
        return Err("路径包含非法字符".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("文件或文件夹不存在".to_string());
    }
    // 禁止含 shell 元字符和控制字符的路径（防止命令注入）
    if path.contains('&') || path.contains('|') || path.contains(';')
        || path.contains('^') || path.contains('%') || path.contains('<')
        || path.contains('>') || path.contains('!') || path.contains('"')
        || path.contains('\n') || path.contains('\r')
    {
        return Err("路径包含非法字符".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &path])
            .spawn()
            .map_err(|e| format!("打开文件失败: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开文件失败: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开文件失败: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_local_ip() -> Result<String, String> {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .map_err(|e| format!("获取本机IP失败: {e}"))
}