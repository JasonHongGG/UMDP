use crate::domain::analysis_models::{AnalysisSnapshot, ProcessInfo, ProcessSession};
use crate::domain::workspace::{current_contract_versions, SystemContractVersions, WorkspaceLifecycleState};
use crate::infrastructure::logging;
use crate::kernel::workspace as workspace_kernel;
use crate::kernel::runtime::access as runtime_access;
use crate::services::analysis::{
    metadata_query_service, process_catalog_service, session_service,
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
    _app: &AppHandle,
    state: &AppState,
    pid: u32,
    name: String,
) -> Result<ProcessSession, String> {
    workspace_kernel::begin_attach(state);

    match session_service::attach_to_process(state, pid, name) {
        Ok(session) => {
            let runtime_result = runtime_access::refresh_runtime_session(state, &session);
            if let Err(error) = &runtime_result {
                logging::error(
                    "runtime",
                    "workspace_application",
                    "Native runtime session initialization failed.",
                    vec![
                        ("pid", session.pid.to_string()),
                        ("error", error.to_string()),
                    ],
                );
            }
            workspace_kernel::finish_attach(state, session.clone());
            if let Err(error) = runtime_result {
                workspace_kernel::apply_operation_failure(state, &error);
            }
            Ok(session)
        }
        Err(error) => {
            workspace_kernel::fail_attach(state, &error);
            Err(error.into())
        }
    }
}

pub fn load_all_metadata(app: &AppHandle, state: &AppState) -> Result<AnalysisSnapshot, String> {
    workspace_kernel::begin_snapshot_load(state);

    match metadata_query_service::load_all_metadata(app, state) {
        Ok(snapshot) => {
            workspace_kernel::finish_snapshot_load(state);
            Ok(snapshot)
        }
        Err(error) => {
            workspace_kernel::fail_snapshot_load(state, &error);
            Err(error.into())
        }
    }
}

pub fn get_workspace_lifecycle(state: &AppState) -> WorkspaceLifecycleState {
    workspace_kernel::current_lifecycle(state)
}