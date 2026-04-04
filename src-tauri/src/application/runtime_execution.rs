use crate::domain::analysis_models::{
    MethodDescriptor, RuntimeFieldSetFailureKind, RuntimeFieldSetRequest,
    RuntimeFieldSetResult, RuntimeInvokeFailureKind, RuntimeMethodInvokeRequest,
    RuntimeMethodInvokeResult,
};
use crate::domain::operation::{OperationError, OperationErrorCode};
use crate::kernel::metadata::access::resolve_class_descriptor;
use crate::kernel::runtime::access::{ensure_runtime_session_ready, execute_runtime_operation};
use crate::kernel::runtime::field_set as native_field_set;
use crate::kernel::runtime::invoke as native_invoke;
use crate::kernel::workspace::access::ensure_attached_session;
use crate::state::AppState;
use tauri::AppHandle;

pub fn invoke_runtime_method(
    _app: &AppHandle,
    state: &AppState,
    request: RuntimeMethodInvokeRequest,
) -> RuntimeMethodInvokeResult {
    let attached = match ensure_attached_session(state) {
        Ok(session) => session,
        Err(error) => return build_invoke_failure_from_error(&request, &error, None, None),
    };
    let descriptor = match resolve_class_descriptor(state, &request.class_stable_id) {
        Ok(descriptor) => descriptor,
        Err(error) => return build_invoke_failure_from_error(&request, &error, None, None),
    };
    let method = match descriptor
        .methods
        .iter()
        .find(|candidate| candidate.stable_id == request.method_stable_id)
        .cloned()
    {
        Some(method) => method,
        None => {
            let error = OperationError::method_not_found(&request.method_stable_id);
            return build_invoke_failure_from_error(&request, &error, None, None);
        }
    };

    if !method.is_static && request.instance_address.as_deref().is_none() {
        return build_invoke_failure_from_error(
            &request,
            &OperationError::instance_required(
                "Instance address is required for non-static method",
            ),
            None,
            Some(&method),
        );
    }

    if method.parameters.len() != request.arguments.len() {
        return build_invoke_failure_from_error(
            &request,
            &OperationError::argument_mismatch("Argument count does not match method signature"),
            None,
            Some(&method),
        );
    }

    let runtime_session = match ensure_runtime_session_ready(state) {
        Ok(runtime_session) => runtime_session,
        Err(error) => {
            return build_invoke_failure_from_error(&request, &error, None, Some(&method));
        }
    };
    let runtime_api = match runtime_session.require_runtime_api() {
        Ok(runtime_api) => runtime_api,
        Err(error) => {
            return build_invoke_failure_from_error(&request, &error, None, Some(&method));
        }
    };

    match execute_runtime_operation(state, || {
        native_invoke::invoke_runtime_method(
            runtime_api,
            attached.pid,
            &descriptor,
            &method,
            &request,
        )
    }) {
        Ok(result) => result,
        Err(error) => build_invoke_failure_from_error(&request, &error, None, Some(&method)),
    }
}

pub fn set_runtime_field_value(
    _app: &AppHandle,
    state: &AppState,
    request: RuntimeFieldSetRequest,
) -> RuntimeFieldSetResult {
    let attached = match ensure_attached_session(state) {
        Ok(session) => session,
        Err(error) => return build_field_set_failure_from_error(&request, &error),
    };
    let descriptor = match resolve_class_descriptor(state, &request.class_stable_id) {
        Ok(descriptor) => descriptor,
        Err(error) => return build_field_set_failure_from_error(&request, &error),
    };

    let field_exists = if request.is_static {
        descriptor
            .static_fields
            .iter()
            .any(|field| field.stable_id == request.member_stable_id)
    } else {
        descriptor
            .fields
            .iter()
            .any(|field| field.stable_id == request.member_stable_id)
    };
    if !field_exists {
        return build_field_set_failure_from_error(
            &request,
            &OperationError::field_not_found(&request.member_stable_id),
        );
    }

    if !request.is_static && request.instance_address.is_none() {
        return build_field_set_failure_from_error(
            &request,
            &OperationError::instance_required(
                "Instance address is required for non-static field writes",
            ),
        );
    }

    match execute_runtime_operation(state, || {
        let runtime_session = ensure_runtime_session_ready(state)?;
        let runtime_api = runtime_session.require_runtime_api()?;
        native_field_set::set_runtime_field_value(runtime_api, attached.pid, &descriptor, &request)
            .map_err(OperationError::from)
    }) {
        Ok(response) => response,
        Err(error) => build_field_set_failure_from_error(&request, &error),
    }
}

fn build_invoke_failure_result(
    request: &RuntimeMethodInvokeRequest,
    failure_kind: RuntimeInvokeFailureKind,
    error: impl Into<String>,
    exception: Option<String>,
    method: Option<&MethodDescriptor>,
) -> RuntimeMethodInvokeResult {
    RuntimeMethodInvokeResult {
        class_stable_id: request.class_stable_id.clone(),
        method_stable_id: request.method_stable_id.clone(),
        method_name: method.map(|entry| entry.name.clone()).unwrap_or_default(),
        method_signature: method
            .map(|entry| entry.signature.clone())
            .unwrap_or_default(),
        return_type: method
            .map(|entry| entry.return_type.clone())
            .unwrap_or_default(),
        success: false,
        failure_kind,
        error: Some(error.into()),
        exception,
        result: None,
    }
}

fn build_invoke_failure_from_error(
    request: &RuntimeMethodInvokeRequest,
    error: &OperationError,
    exception: Option<String>,
    method: Option<&MethodDescriptor>,
) -> RuntimeMethodInvokeResult {
    build_invoke_failure_result(
        request,
        map_invoke_failure_kind(error.code),
        error.to_string(),
        exception,
        method,
    )
}

fn map_invoke_failure_kind(code: OperationErrorCode) -> RuntimeInvokeFailureKind {
    match code {
        OperationErrorCode::NotAttached => RuntimeInvokeFailureKind::NotAttached,
        OperationErrorCode::MetadataUnavailable | OperationErrorCode::MetadataSourceUnavailable => {
            RuntimeInvokeFailureKind::MetadataUnavailable
        }
        OperationErrorCode::ClassNotFound => RuntimeInvokeFailureKind::ClassNotFound,
        OperationErrorCode::MethodNotFound => RuntimeInvokeFailureKind::MethodNotFound,
        OperationErrorCode::InstanceRequired => RuntimeInvokeFailureKind::InstanceRequired,
        OperationErrorCode::ArgumentMismatch => RuntimeInvokeFailureKind::ArgumentMismatch,
        _ => RuntimeInvokeFailureKind::Unknown,
    }
}

fn build_field_set_failure_result(
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

fn build_field_set_failure_from_error(
    request: &RuntimeFieldSetRequest,
    error: &OperationError,
) -> RuntimeFieldSetResult {
    build_field_set_failure_result(
        request,
        map_field_set_failure_kind(error.code),
        error.to_string(),
    )
}

fn map_field_set_failure_kind(code: OperationErrorCode) -> RuntimeFieldSetFailureKind {
    match code {
        OperationErrorCode::NotAttached => RuntimeFieldSetFailureKind::NotAttached,
        OperationErrorCode::MetadataUnavailable | OperationErrorCode::MetadataSourceUnavailable => {
            RuntimeFieldSetFailureKind::MetadataUnavailable
        }
        OperationErrorCode::ClassNotFound => RuntimeFieldSetFailureKind::ClassNotFound,
        OperationErrorCode::FieldNotFound => RuntimeFieldSetFailureKind::FieldNotFound,
        OperationErrorCode::InstanceRequired => RuntimeFieldSetFailureKind::InstanceRequired,
        _ => RuntimeFieldSetFailureKind::Unknown,
    }
}
