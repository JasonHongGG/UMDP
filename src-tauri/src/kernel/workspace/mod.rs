use crate::domain::analysis_models::ProcessSession;
use crate::domain::operation::{OperationError, OperationFailureEffect, OperationResult};
use crate::domain::workspace::WorkspaceLifecycleState;
use crate::state::AppState;

pub fn begin_attach(state: &AppState) {
    state.workspace().lifecycle().set_attaching();
}

pub fn finish_attach(state: &AppState, process_session: ProcessSession) {
    reset_runtime_backing_state(state);
    state
        .workspace()
        .lifecycle()
        .set_attached_without_snapshot(process_session);
}

pub fn fail_attach(state: &AppState, error: &OperationError) {
    state.workspace().analysis().reset();
    reset_runtime_backing_state(state);
    state
        .workspace()
        .lifecycle()
        .set_attach_error(error.public_message());
}

pub fn begin_snapshot_load(state: &AppState) {
    let session = state.workspace().analysis().process_session();
    state.workspace().lifecycle().set_snapshot_loading(session);
}

pub fn finish_snapshot_load(state: &AppState) {
    let session = state.workspace().analysis().process_session();
    let runtime_connected = state.runtime_kernel().session().has_session();
    state
        .workspace()
        .lifecycle()
        .set_ready(session, runtime_connected);
}

pub fn fail_snapshot_load(state: &AppState, error: &OperationError) {
    match error.effect {
        OperationFailureEffect::None => state
            .workspace()
            .lifecycle()
            .set_snapshot_error(error.public_message()),
        OperationFailureEffect::RuntimeSessionDropped => state
            .workspace()
            .lifecycle()
            .set_runtime_error(error.public_message()),
    }
}

pub fn current_lifecycle(state: &AppState) -> WorkspaceLifecycleState {
    state.workspace().lifecycle().sync_runtime_context();
    state.workspace().lifecycle().current()
}

pub fn track_runtime_operation<T>(state: &AppState, result: &OperationResult<T>) {
    match result {
        Ok(_) => {
            state.workspace().lifecycle().record_runtime_heartbeat();
        }
        Err(error) => apply_operation_failure(state, error),
    }
}

pub fn apply_operation_failure(state: &AppState, error: &OperationError) {
    if error.effect == OperationFailureEffect::RuntimeSessionDropped {
        state
            .workspace()
            .lifecycle()
            .set_runtime_error(error.public_message());
    }
}

fn reset_runtime_backing_state(state: &AppState) {
    state.runtime_kernel().session().reset();
    state.scene().workspace().reset();
    state.scene().children().reset();
    state.scene().inspector().reset();
}
