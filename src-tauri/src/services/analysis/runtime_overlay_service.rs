use crate::models::RuntimeClassOverlayResponse;
use crate::services::analysis::executable_resolver::find_bundled_executable;
use crate::state::AppState;
use serde::Deserialize;
use std::process::Command;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
struct HelperRuntimeStaticFields {
    static_fields: Vec<crate::models::StaticFieldInfo>,
    fields: Vec<crate::models::FieldInfo>,
}

pub fn get_runtime_static_fields(
    app: &AppHandle,
    state: &AppState,
    image_id: &str,
    class_namespace: &str,
    class_name: &str,
) -> Result<RuntimeClassOverlayResponse, String> {
    let attached = state
        .analysis
        .process_session()
        .ok_or_else(|| "No process attached".to_string())?;

    let helper_exe = find_bundled_executable(app, "UnityMonoBridge.exe")?;
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