use crate::db::DbConn;
use super::projects::{row_to_project, PROJECT_COLUMNS, DEFAULT_PROJECT_TYPES_JSON, generate_project_number, get_system_username};
use crate::commands::utils::get_setting;
use crate::db::models::ScannedFolder;
use crate::events;
use regex::Regex;
use tauri::{AppHandle, Emitter, State};

/// 将文件夹模板转为正则，提取 {code} 和 {name} 的捕获组
fn template_to_regex(template: &str) -> Regex {
    let mut pattern = String::from("^");
    let mut chars = template.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '{' {
            let mut key = String::new();
            for ch in chars.by_ref() {
                if ch == '}' { break; }
                key.push(ch);
            }
            match key.as_str() {
                "code" => pattern.push_str(r"(.+?)"),
                "name" => pattern.push_str(r"(.+)"),
                _ => {
                    pattern.push('{');
                    pattern.push_str(&key);
                    pattern.push('}');
                }
            }
        } else if c.is_whitespace() {
            // 模板中的空白字符匹配零个或多个空白字符，兼容有无空格的分隔方式
            pattern.push_str(r"\s*");
            while chars.peek().map_or(false, |c| c.is_whitespace()) {
                chars.next();
            }
        } else {
            pattern.push_str(&regex::escape(&c.to_string()));
        }
    }
    pattern.push('$');
    Regex::new(&pattern).unwrap_or_else(|_| Regex::new(r"^(.+)$").unwrap())
}

/// 从文本中提取日期（支持 YYYY-MM-DD / YYYYMMDD / YYMMDD / YYYY.MM.DD 等）
/// 日期可以嵌在字符串中，如 "TB-260407-02" 中的 "260407"
fn extract_date(text: &str) -> Option<String> {
    // YYYY-MM-DD 或 YYYY.MM.DD 或 YYYY/MM/DD
    let re_iso = Regex::new(r"\b(\d{4})[-./](\d{2})[-./](\d{2})\b").ok()?;
    if let Some(caps) = re_iso.captures(text) {
        return Some(format!("{}-{}-{}", &caps[1], &caps[2], &caps[3]));
    }
    // YYYYMMDD（8 位连续数字）
    let re_ymd8 = Regex::new(r"\b(\d{4})(\d{2})(\d{2})\b").ok()?;
    for caps in re_ymd8.captures_iter(text) {
        let y: i32 = caps[1].parse().ok()?;
        let m: i32 = caps[2].parse().ok()?;
        let d: i32 = caps[3].parse().ok()?;
        if (2000..=2099).contains(&y) && (1..=12).contains(&m) && (1..=31).contains(&d) {
            return Some(format!("{}-{}-{}", &caps[1], &caps[2], &caps[3]));
        }
    }
    // YYMMDD（6 位连续数字，支持嵌在编号中如 "TB-260407-02"）
    let re_ymd6 = Regex::new(r"\b(\d{2})(\d{2})(\d{2})\b").ok()?;
    for caps in re_ymd6.captures_iter(text) {
        let _y: i32 = caps[1].parse().ok()?;
        let m: i32 = caps[2].parse().ok()?;
        let d: i32 = caps[3].parse().ok()?;
        if (1..=12).contains(&m) && (1..=31).contains(&d) {
            return Some(format!("20{}-{}-{}", &caps[1], &caps[2], &caps[3]));
        }
    }
    None
}

/// 从多个来源按优先级提取开始日期：
/// 1. 编号中的日期（如 TB-260407-02 → 2026-04-07）
/// 2. 文件夹名称中疑似日期格式的部分
/// 3. 导入路径中是否包含日期信息
/// 4. 文件夹自身的最后修改日期
fn extract_start_date(code: Option<&str>, folder_name: &str, parent_path: &str, folder_path: &std::path::Path) -> Option<String> {
    // 1. 编号中的日期
    if let Some(c) = code {
        if let Some(d) = extract_date(c) {
            return Some(d);
        }
    }
    // 2. 文件夹名称中的日期
    if let Some(d) = extract_date(folder_name) {
        return Some(d);
    }
    // 3. 导入路径中的日期
    if let Some(d) = extract_date(parent_path) {
        return Some(d);
    }
    // 4. 文件夹最后修改日期
    std::fs::metadata(folder_path).ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| {
            let dt: chrono::DateTime<chrono::Utc> = t.into();
            Some(dt.format("%Y-%m-%d").to_string())
        })
}

/// 递归遍历文件夹，返回所有文件中最晚的修改日期
fn get_folder_latest_date(folder_path: &std::path::Path) -> Option<String> {
    let mut latest: Option<std::time::SystemTime> = None;
    // 先检查文件夹自身
    if let Ok(meta) = std::fs::metadata(folder_path) {
        if let Ok(m) = meta.modified() {
            latest = Some(m);
        }
    }
    // 递归遍历
    walk_dir(folder_path, &mut latest);
    latest.and_then(|t| {
        let dt: chrono::DateTime<chrono::Utc> = t.into();
        Some(dt.format("%Y-%m-%d").to_string())
    })
}

fn walk_dir(dir: &std::path::Path, latest: &mut Option<std::time::SystemTime>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk_dir(&path, latest);
            } else if let Ok(meta) = entry.metadata() {
                if let Ok(m) = meta.modified() {
                    if latest.map_or(true, |l| m > l) {
                        *latest = Some(m);
                    }
                }
            }
        }
    }
}

/// 扫描指定路径下的一级子文件夹，尝试识别项目信息
#[tauri::command]
pub fn scan_project_folders(db: State<'_, DbConn>, parent_path: String) -> Result<Vec<ScannedFolder>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // 读取文件夹模板
    let folder_template = get_setting(&conn, "folder_template")
        .unwrap_or_else(|| "[{code}] {name}".to_string());

    let tpl_regex = template_to_regex(&folder_template);
    log::info!("[scan] folder_template='{}', regex='{}'", folder_template, tpl_regex.as_str());

    // 读取项目分类及关键词
    let types_json = get_setting(&conn, "project_types")
        .unwrap_or_else(|| DEFAULT_PROJECT_TYPES_JSON.to_string());

    // 读取完 settings 后释放锁，文件系统操作不需要持锁
    drop(conn);

    let types: Vec<serde_json::Value> = serde_json::from_str(&types_json).unwrap_or_default();

    // 扫描目录
    let entries = std::fs::read_dir(&parent_path)
        .map_err(|e| format!("读取目录失败: {e}"))?;

    let mut results = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let folder_name = entry.file_name().to_string_lossy().to_string();

        // ① 尝试模板匹配
        if let Some(caps) = tpl_regex.captures(&folder_name) {
            let code = caps.get(1).map(|m| m.as_str().to_string());
            let parsed_name = caps.get(2).map(|m| m.as_str().to_string());

            // 多级回退提取开始日期
            let inferred_date = extract_start_date(code.as_deref(), &folder_name, &parent_path, &path);
            // 文件夹内最晚文件修改日期 → 终止日期
            let inferred_end_date = get_folder_latest_date(&path);
            // 从编号前缀反查分类
            let inferred_type = code.as_ref().and_then(|c| {
                let prefix = c.split('-').next().unwrap_or("");
                types.iter().find(|t| {
                    t.get("prefix").and_then(|v| v.as_str()) == Some(prefix)
                }).and_then(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
            });

            log::info!("[scan] MATCHED: folder={}, code={:?}, name={:?}, type={:?}, date={:?}",
                folder_name, code, parsed_name, inferred_type, inferred_date);

            results.push(ScannedFolder {
                folder_name,
                path: path.to_string_lossy().to_string(),
                matched: true,
                parsed_code: code,
                parsed_name,
                inferred_type,
                inferred_date,
                inferred_end_date,
            });
        } else {
            // ② 关键词匹配
            let name_lower = folder_name.to_lowercase();

            let inferred_type = types.iter().find_map(|t| {
                let type_id = t.get("id")?.as_str()?;
                let keywords = t.get("keywords")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_lowercase())).collect::<Vec<_>>())
                    .unwrap_or_default();
                if keywords.iter().any(|kw| name_lower.contains(kw)) {
                    Some(type_id.to_string())
                } else {
                    None
                }
            });

            let inferred_date = extract_start_date(None, &folder_name, &parent_path, &path);
            let inferred_end_date = get_folder_latest_date(&path);

            // 清理文件夹名：作为项目名建议
            let mut clean_name = folder_name.clone();
            // 如果文件夹名包含 [xxx] 模式，优先提取 ] 后面的内容作为名称
            if let Some(bracket_end) = clean_name.find(']') {
                let after = clean_name[bracket_end + 1..].trim_start().to_string();
                if !after.is_empty() {
                    clean_name = after;
                }
            }
            // 去掉常见日期格式
            let date_patterns = [
                Regex::new(r"\d{4}[-./]\d{2}[-./]\d{2}").ok(),
                Regex::new(r"\d{8}").ok(),
                Regex::new(r"\d{6}").ok(),
            ];
            for pat in date_patterns.into_iter().flatten() {
                clean_name = pat.replace(&clean_name, "").to_string();
            }
            // 去掉匹配的关键词（大小写不敏感）
            if let Some(ref ty) = inferred_type {
                if let Some(t) = types.iter().find(|t| t.get("id").and_then(|v| v.as_str()) == Some(ty)) {
                    if let Some(kws) = t.get("keywords").and_then(|v| v.as_array()) {
                        for kw in kws.iter().filter_map(|v| v.as_str()) {
                            if let Ok(re) = Regex::new(&format!("(?i){}", regex::escape(kw))) {
                                clean_name = re.replace_all(&clean_name, "").to_string();
                            }
                        }
                    }
                }
            }
            // 压缩因移除内容产生的连续重复标点符号
            if let Ok(re) = Regex::new(r"[-_.]{2,}") {
                clean_name = re.replace_all(&clean_name, "-").to_string();
            }
            // 去掉首尾多余符号和空白
            clean_name = clean_name.trim_matches(|c: char| c == '-' || c == '_' || c == '.' || c == ' ').to_string();

            log::info!("[scan] UNMATCHED: folder={}, clean_name={:?}, type={:?}, date={:?}",
                folder_name, clean_name, inferred_type, inferred_date);

            results.push(ScannedFolder {
                folder_name,
                path: path.to_string_lossy().to_string(),
                matched: false,
                parsed_code: None,
                parsed_name: if clean_name.is_empty() { None } else { Some(clean_name) },
                inferred_type,
                inferred_date,
                inferred_end_date,
            });
        }
    }

    // 已匹配的排前面
    results.sort_by(|a, b| b.matched.cmp(&a.matched));
    Ok(results)
}

/// 从已有的文件夹导入为项目
#[tauri::command]
pub fn import_project_from_folder(
    app: AppHandle,
    db: State<'_, DbConn>,
    parent_path: String,
    folder_name: String,
    name: String,
    project_number: Option<String>,
    project_type: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<crate::db::models::Project, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let p_type = project_type.unwrap_or_default();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // 优先使用从文件夹名解析出的编号，否则自动生成
    let project_number = project_number
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| generate_project_number(&conn, &p_type, &name));
    let full_path = std::path::Path::new(&parent_path).join(&folder_name);
    let folder_path = full_path.to_string_lossy().to_string();

    log::info!("[import] name={}, project_number={}, p_type={}, start_date={:?}, end_date={:?}, folder_path={}",
        name, project_number, p_type, start_date, end_date, folder_path);

    conn.execute(
        "INSERT INTO projects (name, description, project_number, project_type, status, start_date, end_date, status_changed_at, created_by, folder_path)
         VALUES (?1, '', ?2, ?3, 'planning', ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![name, project_number, p_type, start_date, end_date, now, get_system_username(), folder_path],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    log::info!("[import] Inserted project id={}", id);

    conn.query_row(
        &format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1"),
        [id],
        row_to_project,
    )
    .map_err(|e| e.to_string())
    .inspect(|project| {
        log::info!("[import] Returned project: id={}, number={:?}, name={}, type={:?}, date={:?}, folder={:?}",
            project.id, project.project_number, project.name, project.project_type, project.start_date, project.folder_path);
        let _ = app.emit(events::EVENT_PROJECT_UPDATED, project.id);
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_regex_compiles() {
        let re = Regex::new(r"\b(\d{4})[-./](\d{2})[-./](\d{2})\b");
        assert!(re.is_ok(), "ISO regex failed: {:?}", re.err());
        let re = Regex::new(r"\b(\d{2})(\d{2})(\d{2})\b");
        assert!(re.is_ok(), "YYMMDD regex failed: {:?}", re.err());
        let re = Regex::new(r"\b(\d{4})(\d{2})(\d{2})\b");
        assert!(re.is_ok(), "YYYYMMDD regex failed: {:?}", re.err());
    }

    #[test]
    fn test_extract_date_from_code() {
        assert_eq!(extract_date("TB-260407-02"), Some("2026-04-07".to_string()));
        assert_eq!(extract_date("RD-251215-001"), Some("2025-12-15".to_string()));
        assert_eq!(extract_date("PRJ-20260407-01"), Some("2026-04-07".to_string()));
    }

    #[test]
    fn test_extract_date_iso() {
        assert_eq!(extract_date("2026-04-07"), Some("2026-04-07".to_string()));
        assert_eq!(extract_date("2026.04.07"), Some("2026-04-07".to_string()));
    }

    #[test]
    fn test_extract_start_date_priority() {
        // 编号中有日期时，应优先使用编号中的日期
        let result = extract_start_date(
            Some("TB-260407-02"),
            "[TB-260407-02]西南油田天然气内控总厂",
            "/some/path/2025",
            std::path::Path::new("."),
        );
        assert_eq!(result, Some("2026-04-07".to_string()));
    }
}