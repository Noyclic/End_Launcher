#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // без чёрного окна консоли в релизе

// End Launcher — точка входа Rust-бэкенда.
//
// КАК ЭТО РАБОТАЕТ (коротко):
//   Фронтенд (JavaScript) вызывает:  invoke('detect_bedrock')
//   Rust отвечает функцией ниже:     async fn detect_bedrock() -> ...
//   Tauri сам сериализует возврат в JSON и возвращает его в JS как Promise.
//
// Каждая функция с #[tauri::command] — это «кнопка», которую может нажать JS.

mod ai;
mod auth;
mod bedrock;
mod config;
mod instances;
mod java;
mod mc;
mod mods;
mod news;
mod p2p;
mod runtime;
mod update;

fn main() {
    tauri::Builder::default()
        // Регистрируем все команды, доступные фронтенду через invoke()
        .invoke_handler(tauri::generate_handler![
            // конфиг и ключи
            config::save_api_key,
            config::has_api_key,
            config::get_theme,
            config::set_theme,
            config::get_settings,
            config::set_settings,
            config::get_advanced,
            config::set_advanced,
            config::get_ui_style,
            config::set_ui_style,
            config::get_ai_enabled,
            config::set_ai_enabled,
            config::get_palette,
            config::set_palette,
            // вход через Microsoft
            auth::get_account,
            auth::get_accounts,
            auth::set_active_account,
            auth::ely_login,
            auth::ely_logout,
            auth::get_ms_client_id,
            auth::set_ms_client_id,
            auth::ms_login_start,
            auth::ms_login_finish,
            auth::ms_logout,
            auth::open_url,
            // bedrock
            bedrock::detect_bedrock,
            bedrock::launch_bedrock,
            // java edition
            java::list_java_versions,
            java::install_fabric,
            java::install_forge,
            java::list_installed_versions,
            java::launch_instance,
            instances::list_instances,
            instances::create_instance,
            instances::rename_instance,
            instances::delete_instance,
            instances::get_active_instance,
            instances::set_active_instance,
            instances::open_instance_folder,
            ai::ai_install_state,
            ai::ai_install,
            runtime::check_java,
            // моды
            mods::modrinth_search,
            mods::download_mod,
            mods::open_mods_folder,
            mods::open_mod_browser,
            mods::import_mod_files,
            mods::list_mods,
            mods::toggle_mod,
            mods::delete_mod,
            mods::check_mod_updates,
            mods::apply_mod_update,
            update::check_launcher_update,
            p2p::p2p_host,
            p2p::connect_to_peer,
            p2p::generate_address_ticket,
            p2p::p2p_stop,
            news::mc_news,
            p2p::p2p_available,
            p2p::p2p_detect_port,
            p2p::p2p_status,
            // ии
            ai::analyze_crash,
            ai::generate_modpack,
        ])
        .run(tauri::generate_context!())
        .expect("ошибка запуска End Launcher");
}
