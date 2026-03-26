use crate::domain::analysis_models::{
    RuntimeSceneChildrenSnapshot, RuntimeSceneObjectInspectorSnapshot, SceneWorkspaceState,
};
use crate::services::analysis::scene_service;
use crate::state::AppState;
use std::fmt::Display;
use tauri::{AppHandle, Manager, State};

fn join_error_message(error: impl Display) -> String {
    format!("Background task failed: {error}")
}

#[tauri::command]
pub async fn start_scene_refresh(
    app: AppHandle,
    _state: State<'_, AppState>,
) -> Result<SceneWorkspaceState, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app_handle.state::<AppState>();
        scene_service::start_scene_refresh(&app_handle, &state)
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub fn get_scene_workspace_state(state: State<'_, AppState>) -> SceneWorkspaceState {
    state.scene.current()
}

#[tauri::command]
pub async fn get_scene_object_children(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
) -> Result<RuntimeSceneChildrenSnapshot, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app_handle.state::<AppState>();
        scene_service::get_scene_object_children(&app_handle, &state, &object_address)
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn get_scene_object_inspector(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
) -> Result<RuntimeSceneObjectInspectorSnapshot, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app_handle.state::<AppState>();
        scene_service::get_scene_object_inspector(&app_handle, &state, &object_address)
    })
    .await
    .map_err(join_error_message)?
}