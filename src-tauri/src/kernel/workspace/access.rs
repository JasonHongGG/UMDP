use crate::domain::analysis_models::ProcessSession;
use crate::domain::operation::{OperationError, OperationResult};
use crate::state::AppState;

pub fn ensure_attached_session(state: &AppState) -> OperationResult<ProcessSession> {
    state
        .workspace()
        .process_session()
        .ok_or_else(OperationError::not_attached)
}