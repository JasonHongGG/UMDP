use crate::domain::analysis_models::{AnalysisSnapshot, ProcessInfo, ProcessSession};
use crate::domain::workspace::{current_contract_versions, SystemContractVersions, WorkspaceLifecycleState};
use crate::services::analysis::{
    metadata_query_service, process_catalog_service, runtime_session_service,
    session_service,
};
use crate::state::AppState;
use tauri::AppHandle;

pub fn fetch_system_processes() -> Vec<ProcessInfo> {
    process_catalog_service::fetch_system_processes()
}

pub fn get_contract_versions() -> SystemContractVersions {
    current_contract_versions()
}

pub fn attach_to_process(
    app: &AppHandle,
    state: &AppState,
    pid: u32,
    name: String,
) -> Result<ProcessSession, String> {
    state.workspace_session.lifecycle.set_attaching();

    match session_service::attach_to_process(state, pid, name) {
        Ok(session) => {
            state
                .workspace_session
                .lifecycle
                .set_attached_without_snapshot(session.clone());
            runtime_session_service::ensure_bridge_session_started(app, state)?;
            Ok(session)
        }
        Err(error) => {
            state.workspace_session.lifecycle.set_bridge_error(error.clone());
            Err(error)
        }
    }
}

pub fn load_all_metadata(app: &AppHandle, state: &AppState) -> Result<AnalysisSnapshot, String> {
    let session = state.workspace_session.analysis.process_session();
    state
        .workspace_session
        .lifecycle
        .set_snapshot_loading(session.clone());

    match metadata_query_service::load_all_metadata(app, state) {
        Ok(snapshot) => {
            state.workspace_session.lifecycle.set_ready(session);
            Ok(snapshot)
        }
        Err(error) => {
            state.workspace_session.lifecycle.set_bridge_error(error.clone());
            Err(error)
        }
    }
}

pub fn get_workspace_lifecycle(state: &AppState) -> WorkspaceLifecycleState {
    if state.runtime_infra.bridge.is_connected() {
        state.workspace_session.lifecycle.mark_runtime_bridge_connected();
    }

    state.workspace_session.lifecycle.touch_runtime_session();
    state.workspace_session.lifecycle.current()
}