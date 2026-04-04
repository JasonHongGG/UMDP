use crate::domain::analysis_models::ProcessSession;
use crate::domain::operation::{OperationError, OperationResult};
use crate::kernel::runtime::session::RuntimeSession;
use crate::kernel::workspace;
use crate::state::AppState;
use std::sync::Arc;

pub fn refresh_runtime_session(
    state: &AppState,
    process_session: &ProcessSession,
) -> OperationResult<Arc<RuntimeSession>> {
    let session = Arc::new(RuntimeSession::create(process_session).map_err(OperationError::from)?);
    state
        .runtime_kernel()
        .session()
        .set_session(session.clone());
    Ok(session)
}

pub fn current_runtime_session(state: &AppState) -> Option<Arc<RuntimeSession>> {
    state.runtime_kernel().session().session()
}

pub fn ensure_runtime_session_ready(state: &AppState) -> OperationResult<Arc<RuntimeSession>> {
    let runtime_session =
        current_runtime_session(state).ok_or_else(OperationError::runtime_session_unavailable)?;

    runtime_session.require_runtime_api()?;
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
