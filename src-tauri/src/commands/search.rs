use crate::db::DbConn;
use crate::db::models::SearchResult;
use tauri::State;

#[tauri::command]
pub fn global_search(db: State<'_, DbConn>, query: String) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let conn = db.lock().map_err(|e| e.to_string())?;
    // 转义 LIKE 通配符，防止注入
    let escaped = query.trim().replace('%', "\\%").replace('_', "\\_");
    let pattern = format!("%{}%", escaped);
    let mut results = Vec::new();

    // 搜索项目
    {
        let mut stmt = conn
            .prepare("SELECT id, name, COALESCE(description, ''), id FROM projects WHERE name LIKE ?1 OR description LIKE ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&pattern], |row| {
                Ok(SearchResult {
                    result_type: "project".to_string(),
                    id: row.get(0)?,
                    title: row.get(1)?,
                    detail: row.get(2)?,
                    project_id: row.get(3)?,
                    project_name: row.get::<_, String>(1)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
    }

    // 搜索看板卡片
    {
        let mut stmt = conn
            .prepare(
                "SELECT c.id, c.title, COALESCE(c.description, ''), kc.project_id, p.name \
                 FROM kanban_cards c \
                 JOIN kanban_columns kc ON c.column_id = kc.id \
                 JOIN projects p ON kc.project_id = p.id \
                 WHERE c.title LIKE ?1 OR c.description LIKE ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&pattern], |row| {
                Ok(SearchResult {
                    result_type: "card".to_string(),
                    id: row.get(0)?,
                    title: row.get(1)?,
                    detail: row.get(2)?,
                    project_id: row.get(3)?,
                    project_name: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
    }

    // 搜索甘特图任务
    {
        let mut stmt = conn
            .prepare(
                "SELECT t.id, t.name, '', t.project_id, p.name \
                 FROM gantt_tasks t \
                 JOIN projects p ON t.project_id = p.id \
                 WHERE t.name LIKE ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&pattern], |row| {
                Ok(SearchResult {
                    result_type: "task".to_string(),
                    id: row.get(0)?,
                    title: row.get(1)?,
                    detail: String::new(),
                    project_id: row.get(3)?,
                    project_name: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
    }

    // 搜索项目文件
    {
        let mut stmt = conn
            .prepare(
                "SELECT f.id, f.original_name, '', f.project_id, p.name \
                 FROM project_files f \
                 JOIN projects p ON f.project_id = p.id \
                 WHERE f.original_name LIKE ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&pattern], |row| {
                Ok(SearchResult {
                    result_type: "file".to_string(),
                    id: row.get(0)?,
                    title: row.get(1)?,
                    detail: String::new(),
                    project_id: row.get(3)?,
                    project_name: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
    }

    Ok(results)
}