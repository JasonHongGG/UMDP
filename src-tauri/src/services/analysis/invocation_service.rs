use crate::domain::analysis_models::{
    MethodDescriptor, RuntimeInvokeArgumentKind, RuntimeInvokeFailureKind,
    RuntimeMethodInvokeArgument, RuntimeMethodInvokeRequest, RuntimeMethodInvokeResult,
    RuntimeMethodInvokeValue,
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
) -> RuntimeMethodInvokeResult {
    let attached = match state.analysis.process_session() {
        Some(session) => session,
        None => {
            return build_failure_result(
                &request,
                RuntimeInvokeFailureKind::NotAttached,
                "No process attached",
                None,
                None,
            )
        }
    };
    let metadata = match state.analysis.metadata_snapshot() {
        Some(snapshot) => snapshot,
        None => {
            return build_failure_result(
                &request,
                RuntimeInvokeFailureKind::MetadataUnavailable,
                "Metadata not loaded. Please attach to a process first.",
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

    let helper_exe = match find_bundled_executable(app, "UnityMonoBridge.exe") {
        Ok(path) => path,
        Err(error) => {
            return build_failure_result(
                &request,
                RuntimeInvokeFailureKind::BridgeLaunchFailed,
                format!("Failed to resolve runtime bridge: {error}"),
                None,
                Some(&method),
            )
        }
    };
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
        .map_err(|error| format!("Failed to launch runtime bridge: {error}"));
    let output = match output {
        Ok(output) => output,
        Err(error) => {
            return build_failure_result(
                &request,
                RuntimeInvokeFailureKind::BridgeLaunchFailed,
                error,
                None,
                Some(&method),
            )
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return build_failure_result(
            &request,
            RuntimeInvokeFailureKind::BridgeFailed,
            format!("Runtime bridge failed: {}", stderr.trim()),
            None,
            Some(&method),
        );
    }

    let response = serde_json::from_slice::<HelperInvokeResponse>(&output.stdout)
        .map_err(|error| format!("Failed to parse runtime bridge response: {error}"));
    let response = match response {
        Ok(response) => response,
        Err(error) => {
            return build_failure_result(
                &request,
                RuntimeInvokeFailureKind::BridgeParseFailed,
                error,
                None,
                Some(&method),
            )
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