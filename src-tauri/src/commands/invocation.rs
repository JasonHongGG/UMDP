use crate::application::runtime_execution;
use crate::domain::analysis_models::{RuntimeMethodInvokeRequest, RuntimeMethodInvokeResult};
use crate::domain::operation::{
    background_task_failure, command_success, AsyncCommandResult,
};
use crate::state::AppState;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn invoke_runtime_method(
    app: AppHandle,
    _state: State<'_, AppState>,
    request: RuntimeMethodInvokeRequest,
) -> AsyncCommandResult<RuntimeMethodInvokeResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
        let state = app_handle.state::<AppState>();
        command_success(runtime_execution::invoke_runtime_method(&app_handle, &state, request))
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("runtime.invoke-method", error),
    })
}
