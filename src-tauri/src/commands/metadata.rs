use crate::application::{metadata as metadata_application, workspace as workspace_application};
use crate::domain::analysis_models::{
    AnalysisSnapshot, RuntimeInstanceFieldSnapshot, RuntimeOverlaySnapshot,
};
use crate::domain::operation::{
    background_task_failure, command_result, AsyncCommandResult,
};
use crate::infrastructure::logging::{self, DiagnosticsField};
use crate::state::AppState;
use std::time::Instant;
use tauri::{AppHandle, Manager, State};

fn field(name: &'static str, value: impl ToString) -> DiagnosticsField {
    (name, value.to_string())
}

#[tauri::command]
pub async fn load_all_metadata(
    app: AppHandle,
    _state: State<'_, AppState>,
) -> AsyncCommandResult<AnalysisSnapshot> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = workspace_application::load_all_metadata(&app_handle, &state);
        logging::log_timed_result(
            "tauri",
            "metadata_commands",
            "load_all_metadata",
            started_at,
            &result,
            Vec::new(),
            |snapshot| {
                vec![
                    field("classCount", snapshot.classes.len()),
                    field("imageCount", snapshot.images.len()),
                ]
            },
        );
        command_result(result, "metadata.load-all")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("metadata.load-all", error),
    })
}

#[tauri::command]
pub async fn get_runtime_static_fields(
    app: AppHandle,
    _state: State<'_, AppState>,
    class_stable_id: String,
) -> AsyncCommandResult<RuntimeOverlaySnapshot> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
        let state = app_handle.state::<AppState>();
        command_result(
            metadata_application::get_runtime_static_fields(&app_handle, &state, &class_stable_id),
            "runtime.get-static-fields",
        )
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("runtime.get-static-fields", error),
    })
}

#[tauri::command]
pub async fn get_runtime_instance_fields(
    app: AppHandle,
    _state: State<'_, AppState>,
    class_stable_id: String,
    instance_address: String,
) -> AsyncCommandResult<RuntimeInstanceFieldSnapshot> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
        let state = app_handle.state::<AppState>();
        command_result(
            metadata_application::get_runtime_instance_fields(
                &app_handle,
                &state,
                &class_stable_id,
                &instance_address,
            ),
            "runtime.get-instance-fields",
        )
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("runtime.get-instance-fields", error),
    })
}
