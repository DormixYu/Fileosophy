mod commands;
mod db;
mod events;
mod mdns;
mod sharing;

use commands::files::MdnsState;
use commands::folder_share::FolderShareState;
use commands::projects::DbConn;
use db::connection::init_database;
use mdns::MdnsService;
use sharing::FileTransferServer;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // 初始化数据库
            let conn = init_database(app.handle())?;
            app.manage(Mutex::new(conn) as DbConn);

            // 启动文件传输服务器
            let transfer_server = FileTransferServer::start(app.handle().clone())?;
            let transfer_port = transfer_server.port();
            app.manage(Mutex::new(transfer_server));

            // 初始化文件夹分享状态（默认不启动）
            app.manage(Mutex::new(None) as FolderShareState);

            // 启动 mDNS 服务发现
            match MdnsService::new() {
                Ok(mut mdns_service) => {
                    if let Err(e) = mdns_service.register(transfer_port) {
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
            commands::files::preview_file,
            commands::files::share_file_over_network,
            commands::files::discover_peers,
            commands::files::list_folder_contents,
            // 文件夹分享
            commands::folder_share::start_folder_share,
            commands::folder_share::stop_folder_share,
            commands::folder_share::get_share_status,
            commands::folder_share::join_shared_folder,
            commands::folder_share::list_remote_files,
            commands::folder_share::download_remote_file,
            // 项目命令
            commands::projects::open_folder,
            commands::projects::open_file,
            commands::projects::get_local_ip,
            // 状态历史 & 里程碑
            commands::projects::get_project_status_history,
            commands::projects::get_all_status_histories,
            commands::projects::add_project_milestone,
            commands::projects::update_project_milestone,
            commands::projects::delete_project_milestone,
            commands::projects::get_project_milestones,
            commands::projects::get_all_milestones,
            // 设置与系统
            commands::settings::get_app_settings,
            commands::settings::update_app_settings,
            commands::settings::export_project,
            commands::settings::import_project,
            commands::settings::export_all_projects,
            commands::settings::import_all_projects,
            commands::settings::global_search,
            commands::settings::get_notifications,
            commands::settings::add_notification,
            commands::settings::mark_notification_read,
            commands::settings::clear_notifications,
            commands::settings::mark_all_notifications_read,
            commands::settings::get_notification_preferences,
            commands::settings::update_notification_preferences,
            commands::settings::scan_project_folders,
            commands::settings::import_project_from_folder,
            // 用户
            commands::user::get_current_user,
            commands::user::create_or_update_user,
            commands::user::upload_avatar,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
