use crate::domain::analysis_models::AnalysisSnapshot;
use crate::domain::operation::{OperationError, OperationErrorCode, OperationResult};
use crate::infrastructure::clock::current_timestamp;
use crate::infrastructure::logging;
use crate::infrastructure::tooling::managed_metadata_reader;
use crate::kernel::workspace::access::ensure_attached_session;
use crate::state::AppState;
use std::time::Instant;
use tauri::AppHandle;

fn same_metadata_source(
    left: &crate::domain::analysis_models::ProcessSession,
    right: &crate::domain::analysis_models::ProcessSession,
) -> bool {
    left.pid == right.pid
        && left.exe_path == right.exe_path
        && left.data_dir == right.data_dir
        && left.managed_dir == right.managed_dir
        && left.runtime == right.runtime
}

pub fn load_all_metadata(app: &AppHandle, state: &AppState) -> OperationResult<AnalysisSnapshot> {
    let attached = ensure_attached_session(state)?;

    if let Some(mut cached) = state.workspace().lifecycle().metadata_snapshot() {
        if cached
            .process
            .as_ref()
            .is_some_and(|existing| same_metadata_source(existing, &attached))
        {
            cached.process = Some(attached.clone());
            logging::debug(
                "metadata",
                "metadata_query",
                "load_all_metadata cache hit.",
                vec![
                    ("pid", attached.pid.to_string()),
                    ("classCount", cached.classes.len().to_string()),
                    ("imageCount", cached.images.len().to_string()),
                ],
            );
            return Ok(cached);
        }
    }

    let started_at = Instant::now();
    let metadata_input = attached
        .data_dir
        .clone()
        .or(attached.managed_dir.clone())
        .ok_or_else(OperationError::metadata_source_unavailable)?;

    let mut response = managed_metadata_reader::dump_all_metadata(app, &metadata_input)
        .map_err(|error| OperationError::new(OperationErrorCode::MetadataUnavailable, error))?;

    response.process = Some(attached.clone());
    response.generated_at = current_timestamp();

    logging::debug(
        "metadata",
        "metadata_query",
        "load_all_metadata completed.",
        vec![
            ("durationMs", started_at.elapsed().as_millis().to_string()),
            ("input", metadata_input.clone()),
            ("classCount", response.classes.len().to_string()),
            ("imageCount", response.images.len().to_string()),
        ],
    );

    state
        .workspace()
        .lifecycle()
        .set_metadata_snapshot(response.clone());
    Ok(response)
}