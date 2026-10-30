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
mod ai_browser;
mod auth;
mod bedrock;
mod config;
mod diag;
mod instances;
mod java;
mod mc;
mod mods;
mod net;
mod news;
mod p2p;
mod shield;
mod runtime;
mod update;

/// Паника пишется в crash.log рядом с настройками: у пользователей Windows-сборки нет консоли,
/// а без отчёта о падении исправить ошибку трудно.
fn install_panic_hook() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let text = format!(
            "[{secs}] End Launcher {} ({} / {})\n{info}\n{}\n\n",
            env!("CARGO_PKG_VERSION"),
            std::env::consts::OS,
            std::env::consts::ARCH,
            std::backtrace::Backtrace::force_capture(),
        );
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(config::config_dir().join("crash.log"))
            .and_then(|mut f| std::io::Write::write_all(&mut f, text.as_bytes()));
        default(info);
    }));
}

/// Linux: WebKitGTK на части систем (видеокарты NVIDIA, Wayland, свежие Mesa) показывает пустое окно или
/// падает с ошибкой EGL из-за DMABUF-рендерера. Отключаем его заранее — окно открывается везде.
/// Вернуть прежнее поведение: запустить с переменной END_LAUNCHER_GPU=1.
#[cfg(target_os = "linux")]
fn linux_webkit_workarounds() {
    if std::env::var_os("END_LAUNCHER_GPU").is_none() && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}
#[cfg(not(target_os = "linux"))]
fn linux_webkit_workarounds() {}

fn main() {
    install_panic_hook();
    linux_webkit_workarounds();
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
            java::list_loader_versions,
            java::install_fabric,
            java::install_quilt,
            java::install_forge,
            java::list_installed_versions,
            java::launch_instance,
            java::stop_instance,
            instances::list_instances,
            instances::create_instance,
            instances::rename_instance,
            instances::update_instance,
            instances::duplicate_instance,
            instances::export_instance,
            instances::export_instance_to_path,
            instances::import_instance,
            instances::pick_local_path,
            instances::delete_instance,
            instances::get_active_instance,
            instances::set_active_instance,
            instances::create_instance_shortcut,
            instances::get_startup_instance,
            instances::open_instance_folder,
            instances::open_instances_folder,
            instances::open_launcher_folder,
            instances::open_game_folder,
            instances::open_launcher_resource_folder,
            diag::system_info,
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
            shield::verify_release_manifest,
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
            ai_browser::open_ai_browser,
            ai_browser::open_latest_minecraft_logs,
            ai::generate_modpack,
        ])
        .build(tauri::generate_context!())
        .expect("ошибка запуска End Launcher")
        .run(|_app, event| {
            // при выходе закрываем P2P-комнату и убираем проброс порта на роутере
            if let tauri::RunEvent::Exit = event {
                p2p::shutdown();
            }
        });
}
