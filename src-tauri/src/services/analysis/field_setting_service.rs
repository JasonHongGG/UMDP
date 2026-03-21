use crate::domain::analysis_models::{
    RuntimeFieldSetFailureKind, RuntimeFieldSetRequest, RuntimeFieldSetResult,
};
use crate::services::analysis::bridge_gateway::{BridgeGateway, ProcessBridgeGateway};
use crate::services::analysis::runtime_session_service::{
    classify_field_set_bridge_error, ensure_attached_session, execute_runtime_operation,
    resolve_class_descriptor,
};
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
    let attached = match ensure_attached_session(state) {
        Ok(session) => session,
        Err(error) => {
            return build_failure_result(&request, RuntimeFieldSetFailureKind::NotAttached, error);
        }
    };
    let descriptor = match resolve_class_descriptor(state, &request.class_stable_id) {
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

    let response = match execute_runtime_operation(state, || {
        let gateway = ProcessBridgeGateway::default();
        gateway.set_runtime_field_value(app, attached.pid, &descriptor, &request)
    }) {
        Ok(response) => response,
        Err(error) => {
            return build_failure_result(
                &request,
                classify_field_set_bridge_error(&error),
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