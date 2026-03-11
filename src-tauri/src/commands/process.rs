use crate::models::{AttachResponse, ProcessInfo};
use crate::services::process_service;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn fetch_system_processes() -> Vec<ProcessInfo> {
    process_service::fetch_system_processes()
}

#[tauri::command]
pub fn attach_to_process(state: State<'_, AppState>, pid: u32, name: String) -> Result<AttachResponse, String> {
    process_service::attach_to_process(state, pid, name)
}
