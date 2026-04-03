use crate::domain::analysis_models::{
    RuntimeFieldSetFailureKind, RuntimeFieldSetRequest, RuntimeFieldSetResult,
};
use crate::domain::operation::OperationError;
use crate::kernel::runtime::field_set as native_field_set;
use crate::services::analysis::runtime_session_service::{
    ensure_attached_session, ensure_runtime_session_ready, execute_runtime_operation,
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

pub fn set_runtime_field_value(
    _app: &AppHandle,
    state: &AppState,
    request: RuntimeFieldSetRequest,
) -> RuntimeFieldSetResult {
    let attached = match ensure_attached_session(state) {
        Ok(session) => session,
        Err(error) => {
            return build_failure_result(&request, RuntimeFieldSetFailureKind::NotAttached, error.to_string());
        }
    };
    let descriptor = match resolve_class_descriptor(state, &request.class_stable_id) {
        Ok(descriptor) => descriptor,
        Err(error) => {
            return build_failure_result(&request, RuntimeFieldSetFailureKind::ClassNotFound, error.to_string());
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

    match execute_runtime_operation(state, || {
        let runtime_session = ensure_runtime_session_ready(state)?;
        let runtime_api = runtime_session
            .runtime_api()
            .ok_or_else(OperationError::runtime_api_unavailable)?;
        native_field_set::set_runtime_field_value(runtime_api, attached.pid, &descriptor, &request)
    }) {
        Ok(response) => response,
        Err(error) => {
            return build_failure_result(
                &request,
                RuntimeFieldSetFailureKind::Unknown,
                error.to_string(),
            );
        }
    }
}
