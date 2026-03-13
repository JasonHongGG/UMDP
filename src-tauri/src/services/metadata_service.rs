use crate::models::{ClassInfo, ClassSummary, DumpAllResponse, ImageInfo};
use crate::state::AppState;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager, State};

pub fn load_all_metadata(app: &AppHandle, state: State<'_, AppState>) -> Result<DumpAllResponse, String> {
    let attached = state
        .attached_process
        .lock()
        .clone()
        .ok_or_else(|| "No process attached".to_string())?;

    let metadata_input = attached
        .data_dir
        .clone()
        .or(attached.managed_dir.clone())
        .ok_or_else(|| "Attached process has no Unity data directory or managed directory".to_string())?;

    let helper_executable = helper_executable_path(app)?;
    let mut command = Command::new(&helper_executable);
    command
        .arg("dump-all")
        .arg(&metadata_input);

    let output = command
        .output()
        .map_err(|error| format!("Failed to launch metadata reader: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Metadata reader failed: {}", stderr.trim()));
    }

    let response: DumpAllResponse = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Failed to parse metadata response: {error}"))?;

    *state.metadata.lock() = Some(response.clone());
    
    Ok(response)
}

pub fn get_image_catalog(state: State<'_, AppState>) -> Result<Vec<ImageInfo>, String> {
    if let Some(metadata) = state.metadata.lock().as_ref() {
        return Ok(metadata.images.clone());
    }
    Err("Metadata not loaded. Please attach to a process first.".to_string())
}

pub fn get_image_classes(state: State<'_, AppState>, image_id: &str) -> Result<Vec<ClassSummary>, String> {
    if let Some(metadata) = state.metadata.lock().as_ref() {
        if let Some(classes) = metadata.classes_by_image.get(image_id) {
            return Ok(classes.clone());
        }
    }
    Ok(vec![])
}

pub fn get_class_details(state: State<'_, AppState>, image_id: &str, class_id: &str) -> Result<ClassInfo, String> {
    let cache_key = format!("{image_id}::{class_id}");
    if let Some(metadata) = state.metadata.lock().as_ref() {
        if let Some(class_info) = metadata.class_details.get(&cache_key) {
            return Ok(class_info.clone());
        }
    }
    Err(format!("Class details not found for {cache_key}"))
}

fn helper_executable_path(app: &AppHandle) -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut candidates = vec![manifest_dir.join("bin").join("ManagedMetadataReader.exe")];

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("bin").join("ManagedMetadataReader.exe"));
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join("ManagedMetadataReader.exe"));
            candidates.push(exe_dir.join("resources").join("bin").join("ManagedMetadataReader.exe"));
        }
    }

    if let Some(path) = candidates.into_iter().find(|candidate| candidate.is_file()) {
        Ok(path)
    } else {
        Err("ManagedMetadataReader executable not found. Rebuild the Tauri app so src-tauri/bin/ManagedMetadataReader.exe is published and bundled.".to_string())
    }
}
