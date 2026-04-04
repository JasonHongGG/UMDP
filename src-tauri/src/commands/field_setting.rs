use crate::application::runtime_execution;
use crate::domain::analysis_models::{RuntimeFieldSetRequest, RuntimeFieldSetResult};
use crate::domain::operation::{
    background_task_failure, command_success, AsyncCommandResult,
};
use crate::state::AppState;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn set_runtime_field_value(
    app: AppHandle,
    _state: State<'_, AppState>,
    request: RuntimeFieldSetRequest,
) -> AsyncCommandResult<RuntimeFieldSetResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
        let state = app_handle.state::<AppState>();
        command_success(runtime_execution::set_runtime_field_value(&app_handle, &state, request))
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("runtime.set-field-value", error),
    })
}
