use crate::domain::analysis_models::{AnalysisSnapshot, ClassDescriptor, ProcessSession};
use crate::domain::operation::{OperationError, OperationResult};
use crate::kernel::runtime::access::current_runtime_session;
use crate::kernel::runtime::session::RuntimeSession;
use crate::kernel::workspace;
use crate::state::AppState;
use std::sync::Arc;

pub fn ensure_attached_session(state: &AppState) -> OperationResult<ProcessSession> {
    state
        .workspace()
        .analysis()
        .process_session()
        .ok_or_else(OperationError::not_attached)
}

pub fn ensure_metadata_snapshot(state: &AppState) -> OperationResult<AnalysisSnapshot> {
    state
        .workspace()
        .analysis()
        .metadata_snapshot()
        .ok_or_else(OperationError::metadata_unavailable)
}

pub fn resolve_class_descriptor(
    state: &AppState,
    class_stable_id: &str,
) -> OperationResult<ClassDescriptor> {
    let metadata = ensure_metadata_snapshot(state)?;

    metadata
        .classes
        .get(class_stable_id)
        .cloned()
        .ok_or_else(|| OperationError::class_not_found(class_stable_id))
}

pub fn ensure_runtime_session_ready(state: &AppState) -> OperationResult<Arc<RuntimeSession>> {
    let runtime_session =
        current_runtime_session(state).ok_or_else(OperationError::runtime_session_unavailable)?;

    if runtime_session.runtime_api().is_none() {
        return Err(OperationError::runtime_api_unavailable());
    }

    Ok(runtime_session)
}

pub fn execute_runtime_operation<T, E, F>(state: &AppState, operation: F) -> OperationResult<T>
where
    F: FnOnce() -> Result<T, E>,
    E: Into<OperationError>,
{
    let result = operation().map_err(Into::into);
    workspace::track_runtime_operation(state, &result);

    result
}

pub fn present<T>(result: OperationResult<T>) -> Result<T, String> {
    result.map_err(Into::into)
}
