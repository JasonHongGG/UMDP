use crate::domain::analysis_models::AnalysisSnapshot;
use crate::services::analysis::executable_resolver::find_bundled_executable;
use crate::state::AppState;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

fn current_timestamp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    now.to_string()
}

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

    let helper_executable = find_bundled_executable(app, "ManagedMetadataReader.exe")?;
    let output = Command::new(&helper_executable)
        .arg("dump-all")
        .arg(&metadata_input)
        .output()
        .map_err(|error| format!("Failed to launch metadata reader: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Metadata reader failed: {}", stderr.trim()));
    }

    let mut response: AnalysisSnapshot = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Failed to parse metadata response: {error}"))?;

    response.process = Some(attached);
    response.generated_at = current_timestamp();

    state.analysis.set_metadata_snapshot(response.clone());
    Ok(response)
}
