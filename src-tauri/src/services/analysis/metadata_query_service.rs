use crate::domain::analysis_models::AnalysisSnapshot;
use crate::domain::operation::{OperationError, OperationErrorCode, OperationResult};
use crate::infrastructure::clock::current_timestamp;
use crate::infrastructure::tooling::managed_metadata_reader;
use crate::services::analysis::runtime_session_service::ensure_attached_session;
use std::time::Instant;
use tauri::AppHandle;
use crate::state::AppState;

fn same_metadata_source(left: &crate::domain::analysis_models::ProcessSession, right: &crate::domain::analysis_models::ProcessSession) -> bool {
    left.pid == right.pid
        && left.exe_path == right.exe_path
        && left.data_dir == right.data_dir
        && left.managed_dir == right.managed_dir
        && left.runtime == right.runtime
}

pub fn load_all_metadata(app: &AppHandle, state: &AppState) -> OperationResult<AnalysisSnapshot> {
    let attached = ensure_attached_session(state)?;

    if let Some(mut cached) = state.workspace().analysis().metadata_snapshot() {
        if cached
            .process
            .as_ref()
            .is_some_and(|existing| same_metadata_source(existing, &attached))
        {
            cached.process = Some(attached.clone());
            eprintln!(
                "[perf][metadata] load_all_metadata cache hit pid={} class_count={} image_count={}",
                attached.pid,
                cached.classes.len(),
                cached.images.len()
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

    eprintln!(
        "[perf][metadata] load_all_metadata service completed in {}ms input={} class_count={} image_count={}",
        started_at.elapsed().as_millis(),
        metadata_input,
        response.classes.len(),
        response.images.len()
    );

    state.workspace().analysis().set_metadata_snapshot(response.clone());
    Ok(response)
}
