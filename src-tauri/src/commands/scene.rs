use crate::domain::analysis_models::{
    RuntimeSceneChildrenSnapshot, RuntimeSceneMutationResult,
    RuntimeSceneObjectInspectorSnapshot, SceneWorkspaceState,
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

#[tauri::command]
pub async fn create_scene_child(
    app: AppHandle,
    _state: State<'_, AppState>,
    parent_object_address: String,
    name: String,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_service::create_scene_child(&app_handle, &state, &parent_object_address, &name);
        match &result {
            Ok(snapshot) => eprintln!(
                "[perf][tauri] create_scene_child command completed in {}ms parent_object_address={} target_object_address={}",
                started_at.elapsed().as_millis(),
                parent_object_address,
                snapshot.target_object_address.as_deref().unwrap_or("null")
            ),
            Err(error) => eprintln!(
                "[perf][tauri] create_scene_child command failed in {}ms parent_object_address={} error={}",
                started_at.elapsed().as_millis(),
                parent_object_address,
                error
            ),
        }
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn duplicate_scene_object(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_service::duplicate_scene_object(&app_handle, &state, &object_address);
        match &result {
            Ok(snapshot) => eprintln!(
                "[perf][tauri] duplicate_scene_object command completed in {}ms object_address={} target_object_address={}",
                started_at.elapsed().as_millis(),
                object_address,
                snapshot.target_object_address.as_deref().unwrap_or("null")
            ),
            Err(error) => eprintln!(
                "[perf][tauri] duplicate_scene_object command failed in {}ms object_address={} error={}",
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
pub async fn delete_scene_object(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_service::delete_scene_object(&app_handle, &state, &object_address);
        match &result {
            Ok(snapshot) => eprintln!(
                "[perf][tauri] delete_scene_object command completed in {}ms object_address={} deleted_object_address={}",
                started_at.elapsed().as_millis(),
                object_address,
                snapshot.deleted_object_address.as_deref().unwrap_or("null")
            ),
            Err(error) => eprintln!(
                "[perf][tauri] delete_scene_object command failed in {}ms object_address={} error={}",
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
pub async fn set_scene_object_active(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    active_self: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_service::set_scene_object_active(&app_handle, &state, &object_address, active_self);
        match &result {
            Ok(snapshot) => eprintln!(
                "[perf][tauri] set_scene_object_active command completed in {}ms object_address={} active_self={} target_object_address={}",
                started_at.elapsed().as_millis(),
                object_address,
                active_self,
                snapshot.target_object_address.as_deref().unwrap_or("null")
            ),
            Err(error) => eprintln!(
                "[perf][tauri] set_scene_object_active command failed in {}ms object_address={} error={}",
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