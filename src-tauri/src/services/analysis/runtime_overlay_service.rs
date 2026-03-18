use crate::domain::analysis_models::{
    create_field_stable_id, FieldDescriptor, RuntimeClassOverlayDescriptor, RuntimeOverlaySnapshot,
    StaticFieldDescriptor,
};
use crate::services::analysis::executable_resolver::find_bundled_executable;
use crate::state::AppState;
use serde::Deserialize;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
struct HelperRuntimeStaticFields {
    static_fields: Vec<HelperStaticField>,
    fields: Vec<HelperField>,
}

#[derive(Debug, Deserialize)]
struct HelperField {
    offset: Option<String>,
    name: String,
    field_type: String,
}

#[derive(Debug, Deserialize)]
struct HelperStaticField {
    address: Option<String>,
    value: Option<String>,
    name: String,
    field_type: String,
}

fn current_timestamp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    now.to_string()
}

pub fn get_runtime_static_fields(
    app: &AppHandle,
    state: &AppState,
    class_stable_id: &str,
) -> Result<RuntimeOverlaySnapshot, String> {
    let attached = state
        .analysis
        .process_session()
        .ok_or_else(|| "No process attached".to_string())?;
    let metadata = state
        .analysis
        .metadata_snapshot()
        .ok_or_else(|| "Metadata not loaded. Please attach to a process first.".to_string())?;
    let descriptor = metadata
        .classes
        .get(class_stable_id)
        .ok_or_else(|| format!("Class details not found for {class_stable_id}"))?;

    let helper_exe = find_bundled_executable(app, "UnityMonoBridge.exe")?;
    let output = Command::new(&helper_exe)
        .arg("--pid")
        .arg(attached.pid.to_string())
        .arg("--image")
        .arg(&descriptor.legacy_image_id)
        .arg("--namespace")
        .arg(&descriptor.namespace)
        .arg("--class")
        .arg(&descriptor.name)
        .output()
        .map_err(|error| format!("Failed to launch runtime bridge: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Runtime bridge failed: {}", stderr.trim()));
    }

    let response: HelperRuntimeStaticFields = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Failed to parse runtime bridge response: {error}"))?;

    let overlay = RuntimeClassOverlayDescriptor {
        class_stable_id: descriptor.stable_id.clone(),
        fields: response
            .fields
            .into_iter()
            .map(|field| FieldDescriptor {
                stable_id: create_field_stable_id(
                    &descriptor.stable_id,
                    &field.name,
                    &field.field_type,
                    "instance",
                ),
                legacy_field_name: field.name.clone(),
                name: field.name,
                field_type: field.field_type,
                offset: field.offset,
            })
            .collect(),
        static_fields: response
            .static_fields
            .into_iter()
            .map(|field| StaticFieldDescriptor {
                stable_id: create_field_stable_id(
                    &descriptor.stable_id,
                    &field.name,
                    &field.field_type,
                    "static",
                ),
                legacy_field_name: field.name.clone(),
                name: field.name,
                field_type: field.field_type,
                offset: None,
                address: field.address,
                value: field.value,
            })
            .collect(),
    };

    Ok(RuntimeOverlaySnapshot {
        schema_version: 1,
        generated_at: current_timestamp(),
        classes: std::collections::HashMap::from([(descriptor.stable_id.clone(), overlay)]),
    })
}