mod commands;
mod db;
mod events;
mod mdns;
mod sharing;

use crate::db::DbConn;
use commands::files::MdnsState;
use commands::folder_share::FolderShareState;
use db::connection::init_database;
use mdns::MdnsService;
use sharing::{FileTransferServer, TransferState};
use std::sync::Mutex;
use std::collections::HashMap;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // 设置窗口图标
            if let Some(window) = app.get_webview_window("main") {
                let png_bytes = include_bytes!("../icons/icon.png");
                if let Ok(img) = image::load_from_memory(png_bytes) {
                    let rgba = img.to_rgba8();
                    let w = rgba.width();
                    let h = rgba.height();
                    let icon = tauri::image::Image::new_owned(rgba.into_raw(), w, h);
                    let _ = window.set_icon(icon);
                }
            }

            // 初始化数据库
            let conn = init_database(app.handle())?;
            app.manage(Mutex::new(conn) as DbConn);

            // 启动文件传输服务器
            let transfer_server = FileTransferServer::start(app.handle().clone())?;
            let transfer_port = transfer_server.port();
            let transfer_token = transfer_server.expected_token().to_string();
            app.manage(std::sync::Mutex::new(transfer_server) as TransferState);

            // 初始化文件夹分享状态（默认不启动）
            app.manage(Mutex::new(HashMap::new()) as FolderShareState);

            // 启动 mDNS 服务发现
            match MdnsService::new() {
                Ok(mut mdns_service) => {
                    if let Err(e) = mdns_service.register(transfer_port, &transfer_token) {
                        log::warn!("mDNS 注册失败: {e}");
                    }
                    if let Err(e) = mdns_service.start_discovery() {
                        log::warn!("mDNS 发现启动失败: {e}");
                    }
                    app.manage(Mutex::new(mdns_service) as MdnsState);
                }
                Err(e) => {
                    log::warn!("mDNS 初始化失败: {e}");
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let app = window.app_handle();
                // 停止文件传输服务器
                if let Ok(server) = app.state::<TransferState>().lock() {
                    server.stop();
                }
                // 停止 mDNS 服务发现
                if let Ok(service) = app.state::<MdnsState>().lock() {
                    let _ = service.shutdown();
                }
                // 停止所有文件夹分享服务器
                if let Ok(mut shares) = app.state::<FolderShareState>().lock() {
                    for (_, server) in shares.drain() {
                        server.stop();
                    }
                }
                log::info!("应用退出清理完成");
            }
        })
        .invoke_handler(tauri::generate_handler![
            // 项目管理
            commands::projects::get_all_projects,
            commands::projects::get_project_by_id,
            commands::projects::create_project,
            commands::projects::update_project,
            commands::projects::delete_project,
            // 看板
            commands::kanban::get_kanban_board,
            commands::kanban::add_column,
            commands::kanban::create_card,
            commands::kanban::move_card,
            commands::kanban::update_card,
            commands::kanban::update_column,
            commands::kanban::delete_column,
            commands::kanban::delete_card,
            commands::kanban::link_card_to_gantt,
            commands::kanban::unlink_card_from_gantt,
            commands::kanban::sync_gantt_to_kanban,
            // 甘特图
            commands::gantt::get_gantt_data,
            commands::gantt::add_gantt_task,
            commands::gantt::update_gantt_task,
            commands::gantt::delete_gantt_task,
            // 文件管理 & 网络共享
            commands::files::list_project_files,
            commands::files::upload_file_to_project,
            commands::files::delete_file,
            commands::files::download_file,
            commands::files::open_stored_file,
            commands::files::preview_file,
            commands::files::share_file_over_network,
            commands::files::discover_peers,
            commands::files::list_folder_contents,
            // 文件传输 token
            sharing::get_transfer_token,
            // 文件夹分享
            commands::folder_share::start_folder_share,
            commands::folder_share::stop_folder_share,
            commands::folder_share::get_share_status,
            commands::folder_share::get_connected_clients,
            commands::folder_share::get_activity_log,
            commands::folder_share::join_shared_folder,
            commands::folder_share::list_remote_files,
            commands::folder_share::download_remote_file,
            commands::folder_share::upload_remote_file,
            // 系统命令
            commands::system::open_user_guide,
            commands::system::open_folder,
            commands::system::open_file,
            commands::system::get_local_ip,
            // 状态历史
            commands::status_history::get_project_status_history,
            commands::status_history::get_all_status_histories,
            commands::status_history::add_status_history,
            commands::status_history::update_status_history,
            commands::status_history::delete_status_history,
            // 里程碑
            commands::milestones::add_project_milestone,
            commands::milestones::update_project_milestone,
            commands::milestones::delete_project_milestone,
            commands::milestones::get_project_milestones,
            commands::milestones::get_all_milestones,
            // 设置与系统
            commands::settings::get_app_settings,
            commands::settings::update_app_settings,
            // 项目导入导出
            commands::export::export_project,
            commands::export::import_project,
            commands::export::export_all_projects,
            commands::export::import_all_projects,
            // 全局搜索
            commands::search::global_search,
            // 通知管理
            commands::notifications::get_notifications,
            commands::notifications::add_notification,
            commands::notifications::mark_notification_read,
            commands::notifications::clear_notifications,
            commands::notifications::mark_all_notifications_read,
            commands::notifications::get_notification_preferences,
            commands::notifications::update_notification_preferences,
            // 文件夹扫描导入
            commands::folder_scan::scan_project_folders,
            commands::folder_scan::import_project_from_folder,
            // 用户
            commands::user::get_current_user,
            commands::user::create_or_update_user,
            commands::user::upload_avatar,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
