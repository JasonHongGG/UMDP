use crate::application::runtime_execution;
use crate::domain::analysis_models::{RuntimeMethodInvokeRequest, RuntimeMethodInvokeResult};
use crate::state::AppState;
use std::fmt::Display;
use tauri::{AppHandle, Manager, State};

fn join_error_message(error: impl Display) -> String {
    format!("Background task failed: {error}")
}

#[tauri::command]
pub async fn invoke_runtime_method(
    app: AppHandle,
    _state: State<'_, AppState>,
    request: RuntimeMethodInvokeRequest,
) -> Result<RuntimeMethodInvokeResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app_handle.state::<AppState>();
        runtime_execution::invoke_runtime_method(&app_handle, &state, request)
    })
    .await
    .map_err(join_error_message)
}
