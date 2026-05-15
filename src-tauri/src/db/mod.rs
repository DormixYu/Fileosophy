pub mod connection;
pub mod migrations;
pub mod models;

use std::sync::Mutex;

/// 全局数据库连接类型别名，所有 command 模块共享
pub type DbConn = Mutex<rusqlite::Connection>;
