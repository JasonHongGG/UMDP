mod application;
mod commands;
mod domain;
mod infrastructure;
mod kernel;
mod services;
mod state;

use commands::get_handlers;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    infrastructure::logging::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .invoke_handler(get_handlers())
        .run(tauri::generate_context!())
        .expect("error while running Unity Mono Studio");
}
