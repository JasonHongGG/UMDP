use crate::models::{ClassInfo, ClassSummary, DumpAllResponse, ImageInfo};
use crate::services::analysis::executable_resolver::find_bundled_executable;
use crate::state::AppState;
use std::process::Command;
use tauri::AppHandle;

pub fn load_all_metadata(app: &AppHandle, state: &AppState) -> Result<DumpAllResponse, String> {
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

    let response: DumpAllResponse = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Failed to parse metadata response: {error}"))?;

    state.analysis.set_metadata_snapshot(response.clone());
    Ok(response)
}

pub fn get_image_catalog(state: &AppState) -> Result<Vec<ImageInfo>, String> {
    if let Some(metadata) = state.analysis.metadata_snapshot() {
        return Ok(metadata.images.clone());
    }
    Err("Metadata not loaded. Please attach to a process first.".to_string())
}

pub fn get_image_classes(state: &AppState, image_id: &str) -> Result<Vec<ClassSummary>, String> {
    if let Some(metadata) = state.analysis.metadata_snapshot() {
        if let Some(classes) = metadata.classes_by_image.get(image_id) {
            return Ok(classes.clone());
        }
    }
    Ok(vec![])
}

pub fn get_class_details(state: &AppState, image_id: &str, class_id: &str) -> Result<ClassInfo, String> {
    let cache_key = format!("{image_id}::{class_id}");
    if let Some(metadata) = state.analysis.metadata_snapshot() {
        if let Some(class_info) = metadata.class_details.get(&cache_key) {
            return Ok(class_info.clone());
        }
    }
    Err(format!("Class details not found for {cache_key}"))
}