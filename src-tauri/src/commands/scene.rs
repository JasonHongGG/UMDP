use crate::domain::analysis_models::{
    RuntimeSceneChildrenSnapshot, RuntimeSceneObjectInspectorSnapshot, SceneWorkspaceState,
};
use crate::services::analysis::scene_service;
use crate::state::AppState;
use std::fmt::Display;
use std::time::Instant;
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
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_service::start_scene_refresh(&app_handle, &state);
        match &result {
            Ok(workspace) => eprintln!(
                "[perf][tauri] start_scene_refresh command completed in {}ms refresh_status={:?}",
                started_at.elapsed().as_millis(),
                workspace.refresh_status
            ),
            Err(error) => eprintln!(
                "[perf][tauri] start_scene_refresh command failed in {}ms error={}",
                started_at.elapsed().as_millis(),
                error
            ),
        }
        result
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
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_service::get_scene_object_children(&app_handle, &state, &object_address);
        match &result {
            Ok(snapshot) => eprintln!(
                "[perf][tauri] get_scene_object_children command completed in {}ms object_address={} child_count={}",
                started_at.elapsed().as_millis(),
                object_address,
                snapshot.children.len()
            ),
            Err(error) => eprintln!(
                "[perf][tauri] get_scene_object_children command failed in {}ms object_address={} error={}",
                started_at.elapsed().as_millis(),
                object_address,
                error
            ),
        }
        result
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
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_service::get_scene_object_inspector(&app_handle, &state, &object_address);
        match &result {
            Ok(snapshot) => eprintln!(
                "[perf][tauri] get_scene_object_inspector command completed in {}ms object_address={} children={} components={}",
                started_at.elapsed().as_millis(),
                object_address,
                snapshot.children.len(),
                snapshot.components.len()
            ),
            Err(error) => eprintln!(
                "[perf][tauri] get_scene_object_inspector command failed in {}ms object_address={} error={}",
                started_at.elapsed().as_millis(),
                object_address,
                error
            ),
        }
        result
    })
    .await
    .map_err(join_error_message)?
}