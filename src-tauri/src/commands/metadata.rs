use crate::application::{metadata as metadata_application, workspace as workspace_application};
use crate::domain::analysis_models::{AnalysisSnapshot, RuntimeInstanceFieldSnapshot, RuntimeOverlaySnapshot};
use crate::infrastructure::logging::{self, DiagnosticsField};
use crate::state::AppState;
use std::fmt::Display;
use std::time::Instant;
use tauri::{AppHandle, Manager, State};

fn join_error_message(error: impl Display) -> String {
    format!("Background task failed: {error}")
}

fn field(name: &'static str, value: impl ToString) -> DiagnosticsField {
    (name, value.to_string())
}

#[tauri::command]
pub async fn load_all_metadata(app: AppHandle, _state: State<'_, AppState>) -> Result<AnalysisSnapshot, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
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
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn get_runtime_static_fields(
    app: AppHandle,
    _state: State<'_, AppState>,
    class_stable_id: String,
) -> Result<RuntimeOverlaySnapshot, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app_handle.state::<AppState>();
        metadata_application::get_runtime_static_fields(&app_handle, &state, &class_stable_id)
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn get_runtime_instance_fields(
    app: AppHandle,
    _state: State<'_, AppState>,
    class_stable_id: String,
    instance_address: String,
) -> Result<RuntimeInstanceFieldSnapshot, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app_handle.state::<AppState>();
        metadata_application::get_runtime_instance_fields(
            &app_handle,
            &state,
            &class_stable_id,
            &instance_address,
        )
    })
    .await
    .map_err(join_error_message)?
}
