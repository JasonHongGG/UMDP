use crate::domain::analysis_models::{AnalysisSnapshot, RuntimeInstanceFieldSnapshot, RuntimeOverlaySnapshot};
use crate::services::analysis::{metadata_query_service, runtime_overlay_service};
use crate::state::AppState;
use std::fmt::Display;
use tauri::{AppHandle, Manager, State};

fn join_error_message(error: impl Display) -> String {
    format!("Background task failed: {error}")
}

#[tauri::command]
pub async fn load_all_metadata(app: AppHandle, _state: State<'_, AppState>) -> Result<AnalysisSnapshot, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app_handle.state::<AppState>();
        let session = state.analysis.process_session();
        state.workspace.set_snapshot_loading(session.clone());

        match metadata_query_service::load_all_metadata(&app_handle, &state) {
            Ok(snapshot) => {
                state.workspace.set_ready(session);
                Ok(snapshot)
            }
            Err(error) => {
                state.workspace.set_bridge_error(error.clone());
                Err(error)
            }
        }
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
        runtime_overlay_service::get_runtime_static_fields(&app_handle, &state, &class_stable_id)
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
        runtime_overlay_service::get_runtime_instance_fields(&app_handle, &state, &class_stable_id, &instance_address)
    })
    .await
    .map_err(join_error_message)?
}
