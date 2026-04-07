use crate::domain::analysis_models::{
    ProcessWindowCandidate, RuntimeSceneChildrenSnapshot, RuntimeSceneMousePickerSnapshot,
    RuntimeSceneMutationResult, RuntimeSceneObjectChildrenTaskState,
    RuntimeSceneObjectComponentsTaskState, RuntimeSceneObjectHeaderTaskState,
    RuntimeSceneTransformUpdate, SceneWorkspaceState,
};
use crate::domain::operation::OperationResult;
use crate::kernel::workspace as workspace_kernel;
use crate::kernel::scene::{mutation, picker, refresh, tasks};
use crate::state::AppState;
use tauri::AppHandle;

pub fn start_scene_refresh(
    app: &AppHandle,
    state: &AppState,
) -> OperationResult<SceneWorkspaceState> {
    refresh::start_scene_refresh(app, state)
}

pub fn get_scene_workspace_state(state: &AppState) -> SceneWorkspaceState {
    let session_key = workspace_kernel::current_lifecycle(state).runtime_session.session_key;
    state.scene().current_workspace(session_key.as_deref())
}

pub fn list_scene_picker_windows(state: &AppState) -> OperationResult<Vec<ProcessWindowCandidate>> {
    picker::list_scene_picker_windows(state)
}

pub fn get_scene_mouse_picker_state(state: &AppState) -> RuntimeSceneMousePickerSnapshot {
    picker::get_scene_mouse_picker_state(state)
}

pub fn set_scene_mouse_picker_target(
    app: &AppHandle,
    state: &AppState,
    window_handle: Option<&str>,
) -> OperationResult<RuntimeSceneMousePickerSnapshot> {
    picker::set_scene_mouse_picker_target(app, state, window_handle)
}

pub fn start_scene_mouse_picker(
    app: &AppHandle,
    state: &AppState,
) -> OperationResult<RuntimeSceneMousePickerSnapshot> {
    picker::start_scene_mouse_picker(app, state)
}

pub fn stop_scene_mouse_picker(
    app: &AppHandle,
    state: &AppState,
) -> RuntimeSceneMousePickerSnapshot {
    picker::stop_scene_mouse_picker(app, state)
}

pub fn start_scene_object_children_analysis(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> OperationResult<RuntimeSceneObjectChildrenTaskState> {
    tasks::start_scene_object_children_analysis(app, state, object_address)
}

pub fn get_scene_object_children_state(
    state: &AppState,
    object_address: &str,
) -> Option<RuntimeSceneObjectChildrenTaskState> {
    tasks::get_scene_object_children_state(state, object_address)
}

pub fn cancel_scene_object_children_analysis(
    state: &AppState,
    object_address: &str,
    task_id: Option<u64>,
) -> Option<RuntimeSceneObjectChildrenTaskState> {
    tasks::cancel_scene_object_children_analysis(state, object_address, task_id)
}

pub fn start_scene_object_header_analysis(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> OperationResult<RuntimeSceneObjectHeaderTaskState> {
    tasks::start_scene_object_header_analysis(app, state, object_address)
}

pub fn get_scene_object_header_state(
    state: &AppState,
    object_address: &str,
) -> Option<RuntimeSceneObjectHeaderTaskState> {
    tasks::get_scene_object_header_state(state, object_address)
}

pub fn cancel_scene_object_header_analysis(
    state: &AppState,
    object_address: &str,
    task_id: Option<u64>,
) -> Option<RuntimeSceneObjectHeaderTaskState> {
    tasks::cancel_scene_object_header_analysis(state, object_address, task_id)
}

pub fn start_scene_object_components_analysis(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> OperationResult<RuntimeSceneObjectComponentsTaskState> {
    tasks::start_scene_object_components_analysis(app, state, object_address)
}

pub fn get_scene_object_components_state(
    state: &AppState,
    object_address: &str,
) -> Option<RuntimeSceneObjectComponentsTaskState> {
    tasks::get_scene_object_components_state(state, object_address)
}

pub fn cancel_scene_object_components_analysis(
    state: &AppState,
    object_address: &str,
    task_id: Option<u64>,
) -> Option<RuntimeSceneObjectComponentsTaskState> {
    tasks::cancel_scene_object_components_analysis(state, object_address, task_id)
}

pub fn get_scene_object_children(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> OperationResult<RuntimeSceneChildrenSnapshot> {
    refresh::get_scene_object_children(app, state, object_address)
}

pub fn create_scene_child(
    app: &AppHandle,
    state: &AppState,
    parent_object_address: &str,
    name: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    mutation::create_scene_child(app, state, parent_object_address, name)
}

pub fn create_scene_root(
    app: &AppHandle,
    state: &AppState,
    scene_handle: i32,
    name: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    mutation::create_scene_root(app, state, scene_handle, name)
}

pub fn duplicate_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    mutation::duplicate_scene_object(app, state, object_address)
}

pub fn delete_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    mutation::delete_scene_object(app, state, object_address)
}

pub fn rename_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    name: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    mutation::rename_scene_object(app, state, object_address, name)
}

pub fn set_scene_object_tag(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    tag: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    mutation::set_scene_object_tag(app, state, object_address, tag)
}

pub fn set_scene_object_layer(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    layer: i32,
) -> OperationResult<RuntimeSceneMutationResult> {
    mutation::set_scene_object_layer(app, state, object_address, layer)
}

pub fn set_scene_object_hide_flags(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    hide_flags: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    mutation::set_scene_object_hide_flags(app, state, object_address, hide_flags)
}

pub fn reparent_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    parent_object_address: Option<&str>,
    parent_path: Option<&str>,
) -> OperationResult<RuntimeSceneMutationResult> {
    mutation::reparent_scene_object(
        app,
        state,
        object_address,
        parent_object_address,
        parent_path,
    )
}

pub fn set_scene_object_active(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    active_self: bool,
) -> OperationResult<RuntimeSceneMutationResult> {
    mutation::set_scene_object_active(app, state, object_address, active_self)
}

pub fn set_scene_object_transform(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    transform_update: &RuntimeSceneTransformUpdate,
) -> OperationResult<RuntimeSceneMutationResult> {
    mutation::set_scene_object_transform(app, state, object_address, transform_update)
}

pub fn set_scene_behaviour_enabled(
    app: &AppHandle,
    state: &AppState,
    component_address: &str,
    enabled: bool,
) -> OperationResult<RuntimeSceneMutationResult> {
    mutation::set_scene_behaviour_enabled(app, state, component_address, enabled)
}

pub fn create_scene_component(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    component_type_name: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    mutation::create_scene_component(app, state, object_address, component_type_name)
}

pub fn delete_scene_component(
    app: &AppHandle,
    state: &AppState,
    component_address: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    mutation::delete_scene_component(app, state, component_address)
}

pub fn load_scene_by_build_index(
    app: &AppHandle,
    state: &AppState,
    build_index: i32,
) -> OperationResult<RuntimeSceneMutationResult> {
    mutation::load_scene_by_build_index(app, state, build_index)
}
