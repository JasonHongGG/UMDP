use crate::domain::analysis_models::{AnalysisSnapshot, ProcessInfo, ProcessSession};
use crate::domain::operation::OperationResult;
use crate::domain::workspace::{
    current_contract_versions, SystemContractVersions, WorkspaceLifecycleState,
};
use crate::infrastructure::process_catalog;
use crate::infrastructure::logging;
use crate::kernel::metadata::query as metadata_query;
use crate::kernel::runtime::access as runtime_access;
use crate::kernel::workspace::{self as workspace_kernel, session as workspace_session};
use crate::state::AppState;
use tauri::AppHandle;

pub fn fetch_system_processes() -> Vec<ProcessInfo> {
    process_catalog::fetch_system_processes()
}

pub fn get_contract_versions() -> SystemContractVersions {
    current_contract_versions()
}

pub fn attach_to_process(
    _app: &AppHandle,
    state: &AppState,
    pid: u32,
    name: String,
) -> OperationResult<ProcessSession> {
    workspace_kernel::begin_attach(state);

    match workspace_session::attach_to_process(state, pid, name) {
        Ok(session) => {
            let runtime_result = workspace_kernel::complete_attach_with_runtime_refresh(
                state,
                &session,
                |state, session| runtime_access::refresh_runtime_session(state, session).map(|_| ()),
            );
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
            if let Err(error) = runtime_result {
                workspace_kernel::apply_operation_failure(state, &error);
            }
            Ok(session)
        }
        Err(error) => {
            workspace_kernel::fail_attach(state, &error);
            Err(error)
        }
    }
}

pub fn load_all_metadata(app: &AppHandle, state: &AppState) -> OperationResult<AnalysisSnapshot> {
    workspace_kernel::run_snapshot_load(state, |state| {
        metadata_query::load_all_metadata(app, state)
    })
}

pub fn get_workspace_lifecycle(state: &AppState) -> WorkspaceLifecycleState {
    workspace_kernel::current_lifecycle(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::analysis_models::RuntimeFlavor;
    use crate::domain::workspace::{RuntimeSessionStatus, WorkspaceLifecycleStatus};
    use crate::kernel::runtime::session::RuntimeSession;
    use std::sync::Arc;

    fn sample_session() -> ProcessSession {
        ProcessSession {
            pid: 777,
            process_name: "Unity.exe".to_string(),
            exe_path: "C:/Game/Unity.exe".to_string(),
            data_dir: Some("C:/Game/Unity_Data".to_string()),
            managed_dir: Some("C:/Game/Unity_Data/Managed".to_string()),
            runtime: RuntimeFlavor::Mono,
        }
    }

    #[test]
    fn finalize_attach_keeps_new_runtime_session_available_for_snapshot_ready_projection() {
        let state = AppState::new();
        let session = sample_session();

        workspace_kernel::begin_attach(&state);

        let result = workspace_kernel::complete_attach_with_runtime_refresh(
            &state,
            &session,
            |state, session| {
                state
                    .runtime_kernel()
                    .session()
                    .set_session(Arc::new(RuntimeSession::for_tests(session.pid)));
                Ok(())
            },
        );

        assert!(result.is_ok());

        workspace_kernel::finish_snapshot_load(&state);

        let lifecycle = workspace_kernel::current_lifecycle(&state);
        assert_eq!(lifecycle.status, WorkspaceLifecycleStatus::Ready);
        assert_eq!(
            lifecycle.runtime_session.status,
            RuntimeSessionStatus::Ready
        );
        assert!(lifecycle.runtime_session.connected);
        assert_eq!(
            lifecycle.runtime_session.session_key.as_deref(),
            Some("777:Unity.exe:Mono")
        );
        assert_eq!(
            lifecycle
                .process_session
                .as_ref()
                .map(|process| process.pid),
            Some(777)
        );
    }

    #[test]
    fn run_snapshot_load_preserves_attached_session_on_metadata_failure() {
        let state = AppState::new();
        let session = sample_session();

        workspace_kernel::finish_attach(&state, session.clone());

        let result = workspace_kernel::run_snapshot_load(&state, |_| {
            Err(crate::domain::operation::OperationError::metadata_unavailable())
        });

        assert!(result.is_err());

        let lifecycle = workspace_kernel::current_lifecycle(&state);
        assert_eq!(lifecycle.status, WorkspaceLifecycleStatus::AttachedWithoutSnapshot);
        assert_eq!(
            lifecycle
                .process_session
                .as_ref()
                .map(|process| process.pid),
            Some(777)
        );
        assert_eq!(
            lifecycle.error_message.as_deref(),
            Some("Metadata not loaded. Please attach to a process first.")
        );
    }
}
