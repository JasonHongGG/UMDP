use crate::models::{ClassInfo, ClassSummary, DumpAllResponse, ImageInfo, RuntimeClassOverlayResponse};
use crate::services::{metadata_service, runtime_bridge_service};
use crate::state::AppState;
use std::fmt::Display;
use tauri::{AppHandle, Manager, State};

fn join_error_message(error: impl Display) -> String {
    format!("Background task failed: {error}")
}

#[tauri::command]
pub async fn load_all_metadata(app: AppHandle, _state: State<'_, AppState>) -> Result<DumpAllResponse, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app_handle.state::<AppState>();
        metadata_service::load_all_metadata(&app_handle, &state)
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub fn get_image_catalog(state: State<'_, AppState>) -> Result<Vec<ImageInfo>, String> {
    metadata_service::get_image_catalog(&state)
}

#[tauri::command]
pub fn get_image_classes(state: State<'_, AppState>, image_id: String) -> Result<Vec<ClassSummary>, String> {
    metadata_service::get_image_classes(&state, &image_id)
}

#[tauri::command]
pub fn get_class_details(state: State<'_, AppState>, image_id: String, class_id: String) -> Result<ClassInfo, String> {
    metadata_service::get_class_details(&state, &image_id, &class_id)
}

#[tauri::command]
pub async fn get_runtime_static_fields(
    app: AppHandle,
    _state: State<'_, AppState>,
    image_id: String,
    class_namespace: String,
    class_name: String,
) -> Result<RuntimeClassOverlayResponse, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app_handle.state::<AppState>();
        runtime_bridge_service::get_runtime_static_fields(&app_handle, &state, &image_id, &class_namespace, &class_name)
    })
    .await
    .map_err(join_error_message)?
}
