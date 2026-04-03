use crate::domain::analysis_models::{
    MethodDescriptor, RuntimeInvokeFailureKind, RuntimeMethodInvokeRequest,
    RuntimeMethodInvokeResult,
};
use crate::domain::operation::OperationError;
use crate::kernel::runtime::invoke as native_invoke;
use crate::services::analysis::runtime_session_service::{
    ensure_attached_session, ensure_metadata_snapshot, ensure_runtime_session_ready,
    execute_runtime_operation,
};
use crate::state::AppState;
use tauri::AppHandle;

fn build_failure_result(
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

pub fn invoke_runtime_method(
    _app: &AppHandle,
    state: &AppState,
    request: RuntimeMethodInvokeRequest,
) -> RuntimeMethodInvokeResult {
    let attached = match ensure_attached_session(state) {
        Ok(session) => session,
        Err(error) => {
            return build_failure_result(
                &request,
                RuntimeInvokeFailureKind::NotAttached,
                error.to_string(),
                None,
                None,
            )
        }
    };
    let metadata = match ensure_metadata_snapshot(state) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            return build_failure_result(
                &request,
                RuntimeInvokeFailureKind::MetadataUnavailable,
                error.to_string(),
                None,
                None,
            )
        }
    };
    let descriptor = match metadata.classes.get(&request.class_stable_id).cloned() {
        Some(descriptor) => descriptor,
        None => {
            return build_failure_result(
                &request,
                RuntimeInvokeFailureKind::ClassNotFound,
                format!("Class details not found for {}", request.class_stable_id),
                None,
                None,
            )
        }
    };
    let method = descriptor
        .methods
        .iter()
        .find(|candidate| candidate.stable_id == request.method_stable_id)
        .cloned();
    let method = match method {
        Some(method) => method,
        None => {
            return build_failure_result(
                &request,
                RuntimeInvokeFailureKind::MethodNotFound,
                format!("Method details not found for {}", request.method_stable_id),
                None,
                None,
            )
        }
    };

    if !method.is_static && request.instance_address.as_deref().is_none() {
        return build_failure_result(
            &request,
            RuntimeInvokeFailureKind::InstanceRequired,
            "Instance address is required for non-static method",
            None,
            Some(&method),
        );
    }

    if method.parameters.len() != request.arguments.len() {
        return build_failure_result(
            &request,
            RuntimeInvokeFailureKind::ArgumentMismatch,
            "Argument count does not match method signature",
            None,
            Some(&method),
        );
    }

    let runtime_session = match ensure_runtime_session_ready(state) {
        Ok(runtime_session) => runtime_session,
        Err(error) => {
            return build_failure_result(
                &request,
                RuntimeInvokeFailureKind::Unknown,
                error.to_string(),
                None,
                Some(&method),
            )
        }
    };
    let runtime_api = match runtime_session.runtime_api() {
        Some(runtime_api) => runtime_api,
        None => {
            let error = OperationError::runtime_api_unavailable();
            return build_failure_result(
                &request,
                RuntimeInvokeFailureKind::Unknown,
                error.to_string(),
                None,
                Some(&method),
            );
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
        Err(error) => build_failure_result(
            &request,
            RuntimeInvokeFailureKind::Unknown,
            error.to_string(),
            None,
            Some(&method),
        ),
    }
}
