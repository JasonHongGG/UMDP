use crate::domain::analysis_models::{
    RuntimeSceneChildrenSnapshot, RuntimeSceneMutationResult,
    RuntimeSceneObjectChildrenTaskState, RuntimeSceneObjectInspectorSnapshot,
    RuntimeSceneObjectInspectorTaskState, RuntimeSceneTransformUpdate,
    SceneWorkspaceState,
};
use crate::services::analysis::scene_service;
use crate::state::AppState;
use tauri::AppHandle;

pub fn start_scene_refresh(app: &AppHandle, state: &AppState) -> Result<SceneWorkspaceState, String> {
    scene_service::start_scene_refresh(app, state)
}

pub fn get_scene_workspace_state(state: &AppState) -> SceneWorkspaceState {
    state.scene.current()
}

pub fn start_scene_object_children_analysis(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneObjectChildrenTaskState, String> {
    scene_service::start_scene_object_children_analysis(app, state, object_address)
}

pub fn get_scene_object_children_state(
    state: &AppState,
    object_address: &str,
) -> Option<RuntimeSceneObjectChildrenTaskState> {
    scene_service::get_scene_object_children_state(state, object_address)
}

pub fn cancel_scene_object_children_analysis(
    state: &AppState,
    object_address: &str,
    task_id: Option<u64>,
) -> Option<RuntimeSceneObjectChildrenTaskState> {
    scene_service::cancel_scene_object_children_analysis(state, object_address, task_id)
}

pub fn start_scene_object_inspector_analysis(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneObjectInspectorTaskState, String> {
    scene_service::start_scene_object_inspector_analysis(app, state, object_address)
}

pub fn get_scene_object_inspector_state(state: &AppState) -> Option<RuntimeSceneObjectInspectorTaskState> {
    scene_service::get_scene_object_inspector_state(state)
}

pub fn cancel_scene_object_inspector_analysis(
    state: &AppState,
    task_id: Option<u64>,
) -> Option<RuntimeSceneObjectInspectorTaskState> {
    scene_service::cancel_scene_object_inspector_analysis(state, task_id)
}

pub fn get_scene_object_children(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneChildrenSnapshot, String> {
    scene_service::get_scene_object_children(app, state, object_address)
}

pub fn get_scene_object_inspector(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneObjectInspectorSnapshot, String> {
    scene_service::get_scene_object_inspector(app, state, object_address)
}

pub fn create_scene_child(
    app: &AppHandle,
    state: &AppState,
    parent_object_address: &str,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    scene_service::create_scene_child(app, state, parent_object_address, name)
}

pub fn create_scene_root(
    app: &AppHandle,
    state: &AppState,
    scene_handle: i32,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    scene_service::create_scene_root(app, state, scene_handle, name)
}

pub fn duplicate_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    scene_service::duplicate_scene_object(app, state, object_address)
}

pub fn delete_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    scene_service::delete_scene_object(app, state, object_address)
}

pub fn rename_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    scene_service::rename_scene_object(app, state, object_address, name)
}

pub fn set_scene_object_tag(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    tag: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    scene_service::set_scene_object_tag(app, state, object_address, tag)
}

pub fn set_scene_object_layer(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    layer: i32,
) -> Result<RuntimeSceneMutationResult, String> {
    scene_service::set_scene_object_layer(app, state, object_address, layer)
}

pub fn set_scene_object_hide_flags(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    hide_flags: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    scene_service::set_scene_object_hide_flags(app, state, object_address, hide_flags)
}

pub fn reparent_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    parent_object_address: Option<&str>,
    parent_path: Option<&str>,
) -> Result<RuntimeSceneMutationResult, String> {
    scene_service::reparent_scene_object(app, state, object_address, parent_object_address, parent_path)
}

pub fn set_scene_object_active(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    active_self: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    scene_service::set_scene_object_active(app, state, object_address, active_self)
}

pub fn set_scene_object_transform(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    transform_update: &RuntimeSceneTransformUpdate,
) -> Result<RuntimeSceneMutationResult, String> {
    scene_service::set_scene_object_transform(app, state, object_address, transform_update)
}

pub fn set_scene_behaviour_enabled(
    app: &AppHandle,
    state: &AppState,
    component_address: &str,
    enabled: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    scene_service::set_scene_behaviour_enabled(app, state, component_address, enabled)
}

pub fn create_scene_component(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    component_type_name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    scene_service::create_scene_component(app, state, object_address, component_type_name)
}

pub fn delete_scene_component(
    app: &AppHandle,
    state: &AppState,
    component_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    scene_service::delete_scene_component(app, state, component_address)
}

pub fn load_scene_by_build_index(
    app: &AppHandle,
    state: &AppState,
    build_index: i32,
) -> Result<RuntimeSceneMutationResult, String> {
    scene_service::load_scene_by_build_index(app, state, build_index)
}