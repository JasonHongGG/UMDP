use crate::domain::analysis_models::{
    RuntimeFieldSetRequest, RuntimeFieldSetResult, RuntimeMethodInvokeRequest,
    RuntimeMethodInvokeResult,
};
use crate::services::analysis::{field_setting_service, invocation_service};
use crate::state::AppState;
use tauri::AppHandle;

pub fn invoke_runtime_method(
    app: &AppHandle,
    state: &AppState,
    request: RuntimeMethodInvokeRequest,
) -> RuntimeMethodInvokeResult {
    invocation_service::invoke_runtime_method(app, state, request)
}

pub fn set_runtime_field_value(
    app: &AppHandle,
    state: &AppState,
    request: RuntimeFieldSetRequest,
) -> RuntimeFieldSetResult {
    field_setting_service::set_runtime_field_value(app, state, request)
}