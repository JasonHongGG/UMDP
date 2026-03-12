use crate::models::{ClassInfo, ClassSummary, DumpAllResponse, ImageInfo, RuntimeClassOverlayResponse};
use crate::services::{metadata_service, runtime_bridge_service};
use crate::state::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn load_all_metadata(app: AppHandle, state: State<'_, AppState>) -> Result<DumpAllResponse, String> {
    metadata_service::load_all_metadata(&app, state)
}

#[tauri::command]
pub fn get_image_catalog(state: State<'_, AppState>) -> Result<Vec<ImageInfo>, String> {
    metadata_service::get_image_catalog(state)
}

#[tauri::command]
pub fn get_image_classes(state: State<'_, AppState>, image_id: String) -> Result<Vec<ClassSummary>, String> {
    metadata_service::get_image_classes(state, &image_id)
}

#[tauri::command]
pub fn get_class_details(state: State<'_, AppState>, image_id: String, class_id: String) -> Result<ClassInfo, String> {
    metadata_service::get_class_details(state, &image_id, &class_id)
}

#[tauri::command]
pub fn get_runtime_static_fields(
    app: AppHandle,
    state: State<'_, AppState>,
    image_id: String,
    class_namespace: String,
    class_name: String,
) -> Result<RuntimeClassOverlayResponse, String> {
    runtime_bridge_service::get_runtime_static_fields(&app, state, &image_id, &class_namespace, &class_name)
}
