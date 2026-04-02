use crate::domain::analysis_models::ProcessSession;
use crate::kernel::runtime::session::RuntimeSession;
use crate::state::AppState;
use std::sync::Arc;

pub fn refresh_runtime_session(
    state: &AppState,
    process_session: &ProcessSession,
) -> Result<Arc<RuntimeSession>, String> {
    let session = Arc::new(RuntimeSession::create(process_session)?);
    state.runtime_kernel.runtime.set_session(session.clone());
    Ok(session)
}

pub fn current_runtime_session(state: &AppState) -> Option<Arc<RuntimeSession>> {
    state.runtime_kernel.runtime.session()
}