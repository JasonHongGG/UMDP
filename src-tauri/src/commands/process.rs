use crate::domain::analysis_models::{ProcessInfo, ProcessSession};
use crate::domain::workspace::WorkspaceLifecycleState;
use crate::services::analysis::{process_catalog_service, session_service};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn fetch_system_processes() -> Vec<ProcessInfo> {
    process_catalog_service::fetch_system_processes()
}

#[tauri::command]
pub fn attach_to_process(state: State<'_, AppState>, pid: u32, name: String) -> Result<ProcessSession, String> {
    state.workspace.set_attaching();

    match session_service::attach_to_process(&state, pid, name) {
        Ok(session) => {
            state.workspace.set_attached_without_snapshot(session.clone());
            Ok(session)
        }
        Err(error) => {
            state.workspace.set_bridge_error(error.clone());
            Err(error)
        }
    }
}

#[tauri::command]
pub fn get_workspace_lifecycle(state: State<'_, AppState>) -> WorkspaceLifecycleState {
    state.workspace.touch_runtime_session();
    state.workspace.current()
}
