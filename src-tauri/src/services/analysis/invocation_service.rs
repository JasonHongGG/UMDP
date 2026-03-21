use crate::domain::analysis_models::{
    MethodDescriptor, RuntimeInvokeFailureKind, RuntimeMethodInvokeRequest,
    RuntimeMethodInvokeResult, RuntimeMethodInvokeValue,
};
use crate::services::analysis::bridge_gateway::{BridgeGateway, ProcessBridgeGateway};
use crate::services::analysis::runtime_session_service::{
    classify_invoke_bridge_error, ensure_attached_session, ensure_metadata_snapshot,
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
        method_signature: method.map(|entry| entry.signature.clone()).unwrap_or_default(),
        return_type: method.map(|entry| entry.return_type.clone()).unwrap_or_default(),
        success: false,
        failure_kind,
        error: Some(error.into()),
        exception,
        result: None,
    }
}

pub fn invoke_runtime_method(
    app: &AppHandle,
    state: &AppState,
    request: RuntimeMethodInvokeRequest,
) -> RuntimeMethodInvokeResult {
    let attached = match ensure_attached_session(state) {
        Ok(session) => session,
        Err(error) => {
            return build_failure_result(
                &request,
                RuntimeInvokeFailureKind::NotAttached,
                error,
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
                error,
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

    let response = match execute_runtime_operation(state, || {
        let gateway = ProcessBridgeGateway::default();
        gateway.invoke_runtime_method(
            app,
            attached.pid,
            &descriptor,
            &method,
            request.instance_address.as_deref(),
            &request.arguments,
        )
    }) {
        Ok(response) => response,
        Err(error) => {
            return build_failure_result(
                &request,
                classify_invoke_bridge_error(&error),
                error,
                None,
                Some(&method),
            );
        }
    };

    RuntimeMethodInvokeResult {
        class_stable_id: request.class_stable_id,
        method_stable_id: request.method_stable_id,
        method_name: response.method_name,
        method_signature: response.method_signature,
        return_type: response.return_type,
        success: response.success,
        failure_kind: if response.success {
            RuntimeInvokeFailureKind::None
        } else if response.exception.is_some() {
            RuntimeInvokeFailureKind::RuntimeException
        } else {
            RuntimeInvokeFailureKind::Unknown
        },
        error: response.error,
        exception: response.exception,
        result: response.result.map(|value| RuntimeMethodInvokeValue {
            kind: value.kind,
            value: value.value,
            object_address: value.object_address,
        }),
    }
}