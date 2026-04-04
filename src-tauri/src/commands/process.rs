use crate::application::workspace as workspace_application;
use crate::domain::analysis_models::{ProcessInfo, ProcessSession};
use crate::domain::workspace::{SystemContractVersions, WorkspaceLifecycleState};
use crate::state::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn fetch_system_processes() -> Vec<ProcessInfo> {
    workspace_application::fetch_system_processes()
}

#[tauri::command]
pub fn get_contract_versions() -> SystemContractVersions {
    workspace_application::get_contract_versions()
}

#[tauri::command]
pub fn attach_to_process(
    app: AppHandle,
    state: State<'_, AppState>,
    pid: u32,
    name: String,
) -> Result<ProcessSession, String> {
    workspace_application::attach_to_process(&app, &state, pid, name).map_err(String::from)
}

#[tauri::command]
pub fn get_workspace_lifecycle(state: State<'_, AppState>) -> WorkspaceLifecycleState {
    workspace_application::get_workspace_lifecycle(&state)
}
