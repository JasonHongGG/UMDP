use crate::domain::analysis_models::{
    ClassDescriptor, RuntimeFieldSetFailureKind, RuntimeFieldSetRequest, RuntimeFieldSetResult,
    RuntimeFieldValueKind,
};
use crate::services::analysis::executable_resolver::find_bundled_executable;
use crate::state::AppState;
use serde::Deserialize;
use std::process::Command;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
struct HelperFieldSetResponse {
    success: bool,
    failure_kind: String,
    field_name: String,
    field_type: String,
    is_static: bool,
    address: Option<String>,
    error: Option<String>,
    previous_value: Option<String>,
    applied_value: Option<String>,
}

fn build_failure_result(
    request: &RuntimeFieldSetRequest,
    failure_kind: RuntimeFieldSetFailureKind,
    error: impl Into<String>,
) -> RuntimeFieldSetResult {
    RuntimeFieldSetResult {
        class_stable_id: request.class_stable_id.clone(),
        member_stable_id: request.member_stable_id.clone(),
        field_name: request.field_name.clone(),
        field_type_name: request.field_type_name.clone(),
        is_static: request.is_static,
        address: request.target_address.clone(),
        success: false,
        failure_kind,
        error: Some(error.into()),
        previous_value: None,
        applied_value: None,
    }
}

fn resolve_attached_session(state: &AppState) -> Result<crate::domain::analysis_models::ProcessSession, String> {
    state
        .analysis
        .process_session()
        .ok_or_else(|| "No process attached".to_string())
}

fn resolve_metadata_descriptor(state: &AppState, class_stable_id: &str) -> Result<ClassDescriptor, String> {
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

fn encode_value_kind(kind: &RuntimeFieldValueKind) -> &'static str {
    match kind {
        RuntimeFieldValueKind::Boolean => "boolean",
        RuntimeFieldValueKind::Integer => "integer",
        RuntimeFieldValueKind::Float => "float",
        RuntimeFieldValueKind::String => "string",
        RuntimeFieldValueKind::Address => "address",
    }
}

fn decode_failure_kind(raw: &str) -> RuntimeFieldSetFailureKind {
    match raw {
        "none" => RuntimeFieldSetFailureKind::None,
        "field-not-found" => RuntimeFieldSetFailureKind::FieldNotFound,
        "instance-required" => RuntimeFieldSetFailureKind::InstanceRequired,
        "address-mismatch" => RuntimeFieldSetFailureKind::AddressMismatch,
        "unsupported-type" => RuntimeFieldSetFailureKind::UnsupportedType,
        "invalid-value" => RuntimeFieldSetFailureKind::InvalidValue,
        "write-failed" => RuntimeFieldSetFailureKind::WriteFailed,
        _ => RuntimeFieldSetFailureKind::Unknown,
    }
}

pub fn set_runtime_field_value(
    app: &AppHandle,
    state: &AppState,
    request: RuntimeFieldSetRequest,
) -> RuntimeFieldSetResult {
    let attached = match resolve_attached_session(state) {
        Ok(session) => session,
        Err(error) => {
            return build_failure_result(&request, RuntimeFieldSetFailureKind::NotAttached, error);
        }
    };
    let descriptor = match resolve_metadata_descriptor(state, &request.class_stable_id) {
        Ok(descriptor) => descriptor,
        Err(error) => {
            return build_failure_result(&request, RuntimeFieldSetFailureKind::ClassNotFound, error);
        }
    };

    let field_exists = if request.is_static {
        descriptor.static_fields.iter().any(|field| field.stable_id == request.member_stable_id)
    } else {
        descriptor.fields.iter().any(|field| field.stable_id == request.member_stable_id)
    };
    if !field_exists {
        return build_failure_result(
            &request,
            RuntimeFieldSetFailureKind::FieldNotFound,
            format!("Field details not found for {}", request.member_stable_id),
        );
    }

    if !request.is_static && request.instance_address.is_none() {
        return build_failure_result(
            &request,
            RuntimeFieldSetFailureKind::InstanceRequired,
            "Instance address is required for non-static field writes",
        );
    }

    let helper_exe = match find_bundled_executable(app, "UnityMonoBridge.exe") {
        Ok(path) => path,
        Err(error) => {
            return build_failure_result(
                &request,
                RuntimeFieldSetFailureKind::BridgeLaunchFailed,
                format!("Failed to resolve runtime bridge: {error}"),
            );
        }
    };

    let mut command = Command::new(&helper_exe);
    command
        .arg("--operation")
        .arg("set-field")
        .arg("--pid")
        .arg(attached.pid.to_string())
        .arg("--image")
        .arg(&descriptor.legacy_image_id)
        .arg("--namespace")
        .arg(&descriptor.namespace)
        .arg("--class")
        .arg(&descriptor.name)
        .arg("--field-name")
        .arg(&request.field_name)
        .arg("--field-type")
        .arg(&request.field_type_name)
        .arg("--field-static")
        .arg(if request.is_static { "true" } else { "false" })
        .arg("--value-kind")
        .arg(encode_value_kind(&request.value_kind));

    if let Some(instance_address) = &request.instance_address {
        command.arg("--instance").arg(instance_address);
    }
    if let Some(target_address) = &request.target_address {
        command.arg("--target-address").arg(target_address);
    }
    if let Some(serialized_value) = &request.serialized_value {
        command.arg("--field-value").arg(serialized_value);
    }

    let output = match command.output() {
        Ok(output) => output,
        Err(error) => {
            return build_failure_result(
                &request,
                RuntimeFieldSetFailureKind::BridgeLaunchFailed,
                format!("Failed to launch runtime bridge: {error}"),
            );
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return build_failure_result(
            &request,
            RuntimeFieldSetFailureKind::BridgeFailed,
            format!("Runtime bridge failed: {}", stderr.trim()),
        );
    }

    let response = match serde_json::from_slice::<HelperFieldSetResponse>(&output.stdout) {
        Ok(response) => response,
        Err(error) => {
            return build_failure_result(
                &request,
                RuntimeFieldSetFailureKind::BridgeParseFailed,
                format!("Failed to parse runtime bridge response: {error}"),
            );
        }
    };

    RuntimeFieldSetResult {
        class_stable_id: request.class_stable_id,
        member_stable_id: request.member_stable_id,
        field_name: response.field_name,
        field_type_name: response.field_type,
        is_static: response.is_static,
        address: response.address,
        success: response.success,
        failure_kind: if response.success {
            RuntimeFieldSetFailureKind::None
        } else {
            decode_failure_kind(&response.failure_kind)
        },
        error: response.error,
        previous_value: response.previous_value,
        applied_value: response.applied_value,
    }
}