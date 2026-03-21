use crate::domain::analysis_models::{
    AnalysisSnapshot, ClassDescriptor, ProcessSession, RuntimeFieldSetFailureKind,
    RuntimeInvokeFailureKind,
};
use crate::state::AppState;

pub fn ensure_attached_session(state: &AppState) -> Result<ProcessSession, String> {
    state
        .analysis
        .process_session()
        .ok_or_else(|| "No process attached".to_string())
}

pub fn ensure_metadata_snapshot(state: &AppState) -> Result<AnalysisSnapshot, String> {
    state
        .analysis
        .metadata_snapshot()
        .ok_or_else(|| "Metadata not loaded. Please attach to a process first.".to_string())
}

pub fn resolve_class_descriptor(state: &AppState, class_stable_id: &str) -> Result<ClassDescriptor, String> {
    let metadata = ensure_metadata_snapshot(state)?;

    metadata
        .classes
        .get(class_stable_id)
        .cloned()
        .ok_or_else(|| format!("Class details not found for {class_stable_id}"))
}

pub fn execute_runtime_operation<T, F>(state: &AppState, operation: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String>,
{
    let result = operation();
    match &result {
        Ok(_) => {
            state.workspace.touch_runtime_session();
        }
        Err(error) => {
            state.workspace.set_bridge_error(error.clone());
        }
    }

    result
}

fn is_bridge_parse_error(error: &str) -> bool {
    error.contains("parse")
}

fn is_bridge_launch_error(error: &str) -> bool {
    error.contains("resolve") || error.contains("launch")
}

pub fn classify_invoke_bridge_error(error: &str) -> RuntimeInvokeFailureKind {
    if is_bridge_parse_error(error) {
        RuntimeInvokeFailureKind::BridgeParseFailed
    } else if is_bridge_launch_error(error) {
        RuntimeInvokeFailureKind::BridgeLaunchFailed
    } else {
        RuntimeInvokeFailureKind::BridgeFailed
    }
}

pub fn classify_field_set_bridge_error(error: &str) -> RuntimeFieldSetFailureKind {
    if is_bridge_parse_error(error) {
        RuntimeFieldSetFailureKind::BridgeParseFailed
    } else if is_bridge_launch_error(error) {
        RuntimeFieldSetFailureKind::BridgeLaunchFailed
    } else {
        RuntimeFieldSetFailureKind::BridgeFailed
    }
}