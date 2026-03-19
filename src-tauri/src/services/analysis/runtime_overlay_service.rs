use crate::domain::analysis_models::{
    create_field_stable_id, FieldDescriptor, RuntimeClassOverlayDescriptor, RuntimeInstanceFieldSnapshot,
    RuntimeOverlaySnapshot, RuntimeResolvedFieldDescriptor, StaticFieldDescriptor,
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
    address: Option<String>,
    value: Option<String>,
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

fn resolve_attached_session(state: &AppState) -> Result<crate::domain::analysis_models::ProcessSession, String> {
    state
        .analysis
        .process_session()
        .ok_or_else(|| "No process attached".to_string())
}

fn resolve_metadata_descriptor(state: &AppState, class_stable_id: &str) -> Result<crate::domain::analysis_models::ClassDescriptor, String> {
    let metadata = state
        .analysis
        .metadata_snapshot()
        .ok_or_else(|| "Metadata not loaded. Please attach to a process first.".to_string())?;

    metadata
        .classes
        .get(class_stable_id)
        .cloned()
        .ok_or_else(|| format!("Class details not found for {class_stable_id}"))
}

fn run_runtime_bridge(
    app: &AppHandle,
    pid: u32,
    descriptor: &crate::domain::analysis_models::ClassDescriptor,
    instance_address: Option<&str>,
) -> Result<HelperRuntimeStaticFields, String> {
    let helper_exe = find_bundled_executable(app, "UnityMonoBridge.exe")?;
    let mut command = Command::new(&helper_exe);
    command
        .arg("--pid")
        .arg(pid.to_string())
        .arg("--image")
        .arg(&descriptor.legacy_image_id)
        .arg("--namespace")
        .arg(&descriptor.namespace)
        .arg("--class")
        .arg(&descriptor.name);

    if let Some(address) = instance_address {
        command.arg("--instance").arg(address);
    }

    let output = command
        .output()
        .map_err(|error| format!("Failed to launch runtime bridge: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Runtime bridge failed: {}", stderr.trim()));
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Failed to parse runtime bridge response: {error}"))
}

pub fn get_runtime_static_fields(
    app: &AppHandle,
    state: &AppState,
    class_stable_id: &str,
) -> Result<RuntimeOverlaySnapshot, String> {
    let attached = resolve_attached_session(state)?;
    let descriptor = resolve_metadata_descriptor(state, class_stable_id)?;
    let response = run_runtime_bridge(app, attached.pid, &descriptor, None)?;

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

pub fn get_runtime_instance_fields(
    app: &AppHandle,
    state: &AppState,
    class_stable_id: &str,
    instance_address: &str,
) -> Result<RuntimeInstanceFieldSnapshot, String> {
    let attached = resolve_attached_session(state)?;
    let descriptor = resolve_metadata_descriptor(state, class_stable_id)?;
    let response = run_runtime_bridge(app, attached.pid, &descriptor, Some(instance_address))?;

    Ok(RuntimeInstanceFieldSnapshot {
        class_stable_id: descriptor.stable_id.clone(),
        instance_address: instance_address.to_string(),
        fields: response
            .fields
            .into_iter()
            .map(|field| RuntimeResolvedFieldDescriptor {
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
                address: field.address,
                value: field.value,
            })
            .collect(),
    })
}