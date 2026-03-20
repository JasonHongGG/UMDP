use crate::domain::analysis_models::{
    RuntimeInvokeArgumentKind, RuntimeMethodInvokeArgument, RuntimeMethodInvokeRequest,
    RuntimeMethodInvokeResult, RuntimeMethodInvokeValue,
};
use crate::services::analysis::executable_resolver::find_bundled_executable;
use crate::state::AppState;
use serde::Deserialize;
use std::process::Command;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
struct HelperInvokeValue {
    kind: String,
    value: Option<String>,
    object_address: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HelperInvokeResponse {
    success: bool,
    method_name: String,
    method_signature: String,
    return_type: String,
    error: Option<String>,
    exception: Option<String>,
    result: Option<HelperInvokeValue>,
}

fn resolve_attached_session(state: &AppState) -> Result<crate::domain::analysis_models::ProcessSession, String> {
    state
        .analysis
        .process_session()
        .ok_or_else(|| "No process attached".to_string())
}

fn resolve_metadata_descriptor(
    state: &AppState,
    class_stable_id: &str,
) -> Result<crate::domain::analysis_models::ClassDescriptor, String> {
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

fn push_argument(command: &mut Command, argument: &RuntimeMethodInvokeArgument) {
    let kind = match argument.value_kind {
        RuntimeInvokeArgumentKind::Null => "null",
        RuntimeInvokeArgumentKind::Boolean => "boolean",
        RuntimeInvokeArgumentKind::Number => "number",
        RuntimeInvokeArgumentKind::String => "string",
    };

    command.arg("--arg-kind").arg(kind);
    if let Some(value) = &argument.value {
        command.arg("--arg-value").arg(value);
    }
}

pub fn invoke_runtime_method(
    app: &AppHandle,
    state: &AppState,
    request: RuntimeMethodInvokeRequest,
) -> Result<RuntimeMethodInvokeResult, String> {
    let attached = resolve_attached_session(state)?;
    let descriptor = resolve_metadata_descriptor(state, &request.class_stable_id)?;
    let method = descriptor
        .methods
        .iter()
        .find(|candidate| candidate.stable_id == request.method_stable_id)
        .cloned()
        .ok_or_else(|| format!("Method details not found for {}", request.method_stable_id))?;

    if !method.is_static && request.instance_address.as_deref().is_none() {
        return Err("Instance address is required for non-static method".to_string());
    }

    if method.parameters.len() != request.arguments.len() {
        return Err("Argument count does not match method signature".to_string());
    }

    let helper_exe = find_bundled_executable(app, "UnityMonoBridge.exe")?;
    let mut command = Command::new(&helper_exe);
    command
        .arg("--operation")
        .arg("invoke")
        .arg("--pid")
        .arg(attached.pid.to_string())
        .arg("--image")
        .arg(&descriptor.legacy_image_id)
        .arg("--namespace")
        .arg(&descriptor.namespace)
        .arg("--class")
        .arg(&descriptor.name)
        .arg("--method-name")
        .arg(&method.name)
        .arg("--method-signature")
        .arg(&method.signature);

    if let Some(instance_address) = &request.instance_address {
        command.arg("--instance").arg(instance_address);
    }

    for argument in &request.arguments {
        push_argument(&mut command, argument);
    }

    let output = command
        .output()
        .map_err(|error| format!("Failed to launch runtime bridge: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Runtime bridge failed: {}", stderr.trim()));
    }

    let response: HelperInvokeResponse = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Failed to parse runtime bridge response: {error}"))?;

    Ok(RuntimeMethodInvokeResult {
        class_stable_id: request.class_stable_id,
        method_stable_id: request.method_stable_id,
        method_name: response.method_name,
        method_signature: response.method_signature,
        return_type: response.return_type,
        success: response.success,
        error: response.error,
        exception: response.exception,
        result: response.result.map(|value| RuntimeMethodInvokeValue {
            kind: value.kind,
            value: value.value,
            object_address: value.object_address,
        }),
    })
}