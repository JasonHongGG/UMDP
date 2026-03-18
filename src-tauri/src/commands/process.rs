use crate::domain::analysis_models::{ProcessInfo, ProcessSession};
use crate::services::analysis::{process_catalog_service, session_service};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn fetch_system_processes() -> Vec<ProcessInfo> {
    process_catalog_service::fetch_system_processes()
}

#[tauri::command]
pub fn attach_to_process(state: State<'_, AppState>, pid: u32, name: String) -> Result<ProcessSession, String> {
    session_service::attach_to_process(&state, pid, name)
}
