use crate::domain::analysis_models::ProcessSession;
use crate::domain::operation::{OperationError, OperationResult};
use crate::kernel::runtime::session::RuntimeSession;
use crate::state::AppState;
use std::sync::Arc;

pub fn refresh_runtime_session(
    state: &AppState,
    process_session: &ProcessSession,
) -> OperationResult<Arc<RuntimeSession>> {
    let session = Arc::new(RuntimeSession::create(process_session).map_err(OperationError::from)?);
    state.runtime_kernel().session().set_session(session.clone());
    Ok(session)
}

pub fn current_runtime_session(state: &AppState) -> Option<Arc<RuntimeSession>> {
    state.runtime_kernel().session().session()
}