use crate::models::RuntimeClassOverlayResponse;
use crate::state::AppState;
use serde::Deserialize;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Deserialize)]
struct HelperRuntimeStaticFields {
    static_fields: Vec<crate::models::StaticFieldInfo>,
    fields: Vec<crate::models::FieldInfo>,
}

pub fn get_runtime_static_fields(
    app: &AppHandle,
    state: State<'_, AppState>,
    image_id: &str,
    class_namespace: &str,
    class_name: &str,
) -> Result<RuntimeClassOverlayResponse, String> {
    let attached = state
        .attached_process
        .lock()
        .clone()
        .ok_or_else(|| "No process attached".to_string())?;

    let helper_exe = helper_executable_path(app)?;
    let output = Command::new(&helper_exe)
        .arg("--pid")
        .arg(attached.pid.to_string())
        .arg("--image")
        .arg(image_id)
        .arg("--namespace")
        .arg(class_namespace)
        .arg("--class")
        .arg(class_name)
        .output()
        .map_err(|error| format!("Failed to launch runtime bridge: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Runtime bridge failed: {}", stderr.trim()));
    }

    let response: HelperRuntimeStaticFields = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Failed to parse runtime bridge response: {error}"))?;

    Ok(RuntimeClassOverlayResponse {
        static_fields: response.static_fields,
        fields: response.fields,
    })
}

fn helper_executable_path(app: &AppHandle) -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut candidates = vec![manifest_dir.join("bin").join("UnityMonoBridge.exe")];

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("bin").join("UnityMonoBridge.exe"));
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join("UnityMonoBridge.exe"));
            candidates.push(exe_dir.join("resources").join("bin").join("UnityMonoBridge.exe"));
        }
    }

    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| {
            "UnityMonoBridge executable not found. Rebuild the Tauri app so src-tauri/bin/UnityMonoBridge.exe is built and bundled.".to_string()
        })
}