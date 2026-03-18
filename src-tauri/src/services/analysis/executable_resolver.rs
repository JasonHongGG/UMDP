use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn find_bundled_executable(app: &AppHandle, executable_name: &str) -> Result<PathBuf, String> {
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
        .ok_or_else(|| format!("{executable_name} executable not found. Rebuild the Tauri app so it is published and bundled under src-tauri/bin/."))
}