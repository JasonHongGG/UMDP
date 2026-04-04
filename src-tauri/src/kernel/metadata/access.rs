use crate::domain::analysis_models::{AnalysisSnapshot, ClassDescriptor};
use crate::domain::operation::{OperationError, OperationResult};
use crate::state::AppState;

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