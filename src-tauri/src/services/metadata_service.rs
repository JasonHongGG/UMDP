use crate::models::{ClassInfo, ClassSummary, ImageInfo};
use crate::state::AppState;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::State;

#[derive(Debug, Deserialize)]
struct HelperImageCatalog {
    images: Vec<ImageInfo>,
}

#[derive(Debug, Deserialize)]
struct HelperClassCatalog {
    classes: Vec<ClassSummary>,
}

#[derive(Debug, Deserialize)]
struct HelperClassDetails {
    class: ClassInfo,
}

pub fn get_image_catalog(state: State<'_, AppState>) -> Result<Vec<ImageInfo>, String> {
    if let Some(images) = state.image_catalog.lock().clone() {
        return Ok(images);
    }

    let helper: HelperImageCatalog = run_helper(&state, &["images"])?;
    *state.image_catalog.lock() = Some(helper.images.clone());
    Ok(helper.images)
}

pub fn get_image_classes(state: State<'_, AppState>, image_id: &str) -> Result<Vec<ClassSummary>, String> {
    if let Some(classes) = state.class_catalog.lock().get(image_id).cloned() {
        return Ok(classes);
    }

    let helper: HelperClassCatalog = run_helper(&state, &["classes", image_id])?;
    state.class_catalog.lock().insert(image_id.to_string(), helper.classes.clone());
    Ok(helper.classes)
}

pub fn get_class_details(state: State<'_, AppState>, image_id: &str, class_id: &str) -> Result<ClassInfo, String> {
    let cache_key = format!("{image_id}::{class_id}");
    if let Some(class_info) = state.class_details.lock().get(&cache_key).cloned() {
        return Ok(class_info);
    }

    let helper: HelperClassDetails = run_helper(&state, &["class-details", image_id, class_id])?;
    state.class_details.lock().insert(cache_key, helper.class.clone());
    Ok(helper.class)
}

fn run_helper<T: for<'de> Deserialize<'de>>(state: &State<'_, AppState>, args: &[&str]) -> Result<T, String> {
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
        .arg("--");

    for arg in args {
        command.arg(arg);
    }
    command.arg(&managed_dir);

    let output = command
        .output()
        .map_err(|error| format!("Failed to launch metadata reader: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Metadata reader failed: {}", stderr.trim()));
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Failed to parse metadata response: {error}"))
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
