use crate::domain::analysis_models::AnalysisSnapshot;
use crate::services::analysis::bridge_gateway::{current_timestamp, load_all_metadata as load_analysis_snapshot};
use crate::state::AppState;
use tauri::AppHandle;

pub fn load_all_metadata(app: &AppHandle, state: &AppState) -> Result<AnalysisSnapshot, String> {
    let attached = state
        .analysis
        .process_session()
        .ok_or_else(|| "No process attached".to_string())?;

    let metadata_input = attached
        .data_dir
        .clone()
        .or(attached.managed_dir.clone())
        .ok_or_else(|| "Attached process has no Unity data directory or managed directory".to_string())?;

    let mut response = load_analysis_snapshot(app, &metadata_input)?;

    response.process = Some(attached);
    response.generated_at = current_timestamp();

    state.analysis.set_metadata_snapshot(response.clone());
    Ok(response)
}
