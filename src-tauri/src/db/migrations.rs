use rusqlite::Connection;

/// 检查表中是否存在某列
fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, rusqlite::Error> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .any(|name| name == column);
    Ok(exists)
}

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        -- 项目表
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- 看板列
        CREATE TABLE IF NOT EXISTS kanban_columns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            position INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        -- 看板卡片（任务）
        CREATE TABLE IF NOT EXISTS kanban_cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            column_id INTEGER NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            position INTEGER NOT NULL,
            tags TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        -- 甘特图任务
        CREATE TABLE IF NOT EXISTS gantt_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            start_date TEXT NOT NULL,
            duration_days INTEGER NOT NULL DEFAULT 1,
            dependencies TEXT DEFAULT '[]',
            progress REAL DEFAULT 0.0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        -- 项目文件
        CREATE TABLE IF NOT EXISTS project_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            original_name TEXT NOT NULL,
            stored_name TEXT NOT NULL,
            size INTEGER NOT NULL,
            uploaded_at TEXT DEFAULT (datetime('now'))
        );

        -- 应用设置
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- 项目状态变更历史
        CREATE TABLE IF NOT EXISTS project_status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            status TEXT NOT NULL,
            changed_at TEXT NOT NULL
        );

        -- 项目里程碑
        CREATE TABLE IF NOT EXISTS project_milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            date TEXT NOT NULL,
            description TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- 用户
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            avatar_path TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- 索引
        CREATE INDEX IF NOT EXISTS idx_kanban_columns_project ON kanban_columns(project_id);
        CREATE INDEX IF NOT EXISTS idx_kanban_cards_column ON kanban_cards(column_id);
        CREATE INDEX IF NOT EXISTS idx_gantt_tasks_project ON gantt_tasks(project_id);
        CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);
        CREATE INDEX IF NOT EXISTS idx_status_history_project ON project_status_history(project_id);
        CREATE INDEX IF NOT EXISTS idx_milestones_project ON project_milestones(project_id);
        ",
    )?;

    // ── 增量迁移：projects 表新增字段 ──────────────────────────────
    let new_columns: &[(&str, &str)] = &[
        ("project_number", "ALTER TABLE projects ADD COLUMN project_number TEXT DEFAULT ''"),
        ("project_type", "ALTER TABLE projects ADD COLUMN project_type TEXT DEFAULT ''"),
        ("status", "ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'planning'"),
        ("start_date", "ALTER TABLE projects ADD COLUMN start_date TEXT"),
        ("end_date", "ALTER TABLE projects ADD COLUMN end_date TEXT"),
        ("status_changed_at", "ALTER TABLE projects ADD COLUMN status_changed_at TEXT"),
        ("created_by", "ALTER TABLE projects ADD COLUMN created_by TEXT DEFAULT ''"),
        ("folder_path", "ALTER TABLE projects ADD COLUMN folder_path TEXT DEFAULT ''"),
    ];

    for (col, alter_sql) in new_columns {
        if !column_exists(conn, "projects", col)? {
            conn.execute_batch(alter_sql)?;
        }
    }

    // 为旧记录填充默认值
    conn.execute_batch(
        "UPDATE projects SET status = 'planning' WHERE status IS NULL OR status = '';
         UPDATE projects SET status_changed_at = created_at WHERE status_changed_at IS NULL;
         UPDATE projects SET created_by = '' WHERE created_by IS NULL;
         UPDATE projects SET project_type = '' WHERE project_type IS NULL;",
    )?;

    // 自动为没有编号的旧项目生成编号
    let has_unnumbered: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM projects WHERE project_number IS NULL OR project_number = ''",
        [],
        |row| row.get(0),
    )?;

    if has_unnumbered {
        let mut stmt = conn.prepare("SELECT id FROM projects ORDER BY id")?;
        let ids: Vec<i64> = stmt.query_map([], |row| row.get(0))?.collect::<Result<Vec<_>, _>>()?;
        for (i, id) in ids.iter().enumerate() {
            let number = format!("PRJ-{:03}", i + 1);
            conn.execute(
                "UPDATE projects SET project_number = ?1 WHERE id = ?2 AND (project_number IS NULL OR project_number = '')",
                rusqlite::params![number, id],
            )?;
        }
    }

    // ── 增量迁移：看板列/卡片新增字段 ────────────────────────────
    let kanban_new_columns: &[(&str, &str, &str)] = &[
        ("kanban_columns", "column_type", "ALTER TABLE kanban_columns ADD COLUMN column_type TEXT DEFAULT NULL"),
        ("kanban_cards", "gantt_task_id", "ALTER TABLE kanban_cards ADD COLUMN gantt_task_id INTEGER DEFAULT NULL"),
        ("kanban_cards", "due_date", "ALTER TABLE kanban_cards ADD COLUMN due_date TEXT DEFAULT NULL"),
    ];

    for (table, col, alter_sql) in kanban_new_columns {
        if !column_exists(conn, table, col)? {
            conn.execute_batch(alter_sql)?;
        }
    }

    // ── 增量迁移：默认项目路径设置 ────────────────────────────────
    conn.execute_batch(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('default_project_path', '');"
    )?;

    // ── 增量迁移：合并旧 key project_root_path → default_project_path ──
    conn.execute_batch(
        "INSERT OR IGNORE INTO settings (key, value)
         SELECT 'default_project_path', value FROM settings WHERE key = 'project_root_path' AND value != '';
         DELETE FROM settings WHERE key = 'project_root_path';"
    )?;

    Ok(())
}
