use crate::domain::analysis_models::{
    ClassDescriptor, RuntimeFieldSetFailureKind, RuntimeFieldSetRequest, RuntimeFieldSetResult,
};
use crate::services::analysis::bridge_gateway::set_runtime_field_value as set_bridge_field_value;
use crate::state::AppState;
use tauri::AppHandle;

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

    let response = match set_bridge_field_value(app, attached.pid, &descriptor, &request) {
        Ok(response) => response,
        Err(error) => {
            let failure_kind = if error.contains("parse") {
                RuntimeFieldSetFailureKind::BridgeParseFailed
            } else if error.contains("resolve") || error.contains("launch") {
                RuntimeFieldSetFailureKind::BridgeLaunchFailed
            } else {
                RuntimeFieldSetFailureKind::BridgeFailed
            };
            return build_failure_result(
                &request,
                failure_kind,
                error,
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