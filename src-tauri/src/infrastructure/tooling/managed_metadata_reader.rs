use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};

use crate::domain::analysis_models::AnalysisSnapshot;

pub fn find_managed_metadata_reader(app: &AppHandle) -> Result<PathBuf, String> {
    let executable_name = "ManagedMetadataReader.exe";
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut candidates = vec![manifest_dir.join("bin").join(executable_name)];

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("bin").join(executable_name));
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join(executable_name));
            candidates.push(exe_dir.join("resources").join("bin").join(executable_name));
        }
    }

    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| {
            format!(
                "{} executable not found. Rebuild the Tauri app so it is published and bundled under src-tauri/bin/.",
                executable_name
            )
        })
}

pub fn dump_all_metadata(
    app: &AppHandle,
    metadata_input: &str,
) -> Result<AnalysisSnapshot, String> {
    let executable = find_managed_metadata_reader(app)?;
    let output = Command::new(&executable)
        .arg("dump-all")
        .arg(metadata_input)
        .output()
        .map_err(|error| format!("Failed to launch managed metadata reader: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Managed metadata reader failed: {}", stderr.trim()));
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Failed to parse managed metadata snapshot: {error}"))
}
