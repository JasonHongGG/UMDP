use crate::application::workspace as workspace_application;
use crate::domain::analysis_models::{ProcessInfo, ProcessSession};
use crate::domain::operation::{command_result, command_success, CommandEnvelope};
use crate::domain::workspace::{SystemContractVersions, WorkspaceLifecycleState};
use crate::state::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn fetch_system_processes() -> CommandEnvelope<Vec<ProcessInfo>> {
    command_success(workspace_application::fetch_system_processes())
}

#[tauri::command]
pub fn get_contract_versions() -> CommandEnvelope<SystemContractVersions> {
    command_success(workspace_application::get_contract_versions())
}

#[tauri::command]
pub fn attach_to_process(
    app: AppHandle,
    state: State<'_, AppState>,
    pid: u32,
    name: String,
) -> CommandEnvelope<ProcessSession> {
    command_result(
        workspace_application::attach_to_process(&app, &state, pid, name),
        "workspace.attach-to-process",
    )
}

#[tauri::command]
pub fn get_workspace_lifecycle(state: State<'_, AppState>) -> CommandEnvelope<WorkspaceLifecycleState> {
    command_success(workspace_application::get_workspace_lifecycle(&state))
}
