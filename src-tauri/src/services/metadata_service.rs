use crate::models::{ClassInfo, ClassSummary, DumpAllResponse, ImageInfo};
use crate::state::AppState;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::State;

pub fn load_all_metadata(state: State<'_, AppState>) -> Result<DumpAllResponse, String> {
    let attached = state
        .attached_process
        .lock()
        .clone()
        .ok_or_else(|| "No process attached".to_string())?;

    let managed_dir = attached
        .managed_dir
        .clone()
        .ok_or_else(|| "Attached process has no Unity Managed directory".to_string())?;

    let helper_project = helper_project_path()?;
    let mut command = Command::new("dotnet");
    command
        .arg("run")
        .arg("--project")
        .arg(&helper_project)
        .arg("--")
        .arg("dump-all")
        .arg(&managed_dir);

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

fn helper_project_path() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let root = manifest_dir.parent().ok_or_else(|| "Failed to resolve project root".to_string())?;
    let project = root.join("tools").join("ManagedMetadataReader").join("ManagedMetadataReader.csproj");
    if Path::new(&project).is_file() {
        Ok(project)
    } else {
        Err(format!("Metadata reader project not found: {}", project.display()))
    }
}
