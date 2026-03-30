use crate::domain::analysis_models::{
    RuntimeQuaternionSnapshot, RuntimeSceneBuildSettingsEntry, RuntimeSceneCatalogSnapshot,
    RuntimeSceneChildrenSnapshot, RuntimeSceneChildrenPageSnapshot,
    RuntimeSceneComponentSummary, RuntimeSceneDescriptor, RuntimeSceneHierarchyPathEntry,
    RuntimeSceneKind, RuntimeSceneNodeSummary,
    RuntimeSceneComponentsPageSnapshot, RuntimeSceneObjectInspectorHeaderSnapshot,
    RuntimeSceneObjectChildrenTaskState,
    RuntimeSceneObjectInspectorTaskState,
    RuntimeSceneMutationOperation, RuntimeSceneMutationResult, RuntimeSceneSelectionHint,
    RuntimeSceneObjectInspectorSnapshot, RuntimeSceneTransformSnapshot,
    RuntimeSceneTransformUpdate,
    RuntimeVector3Snapshot, SceneWorkspaceState,
};
use crate::domain::bridge_protocol::BridgeOperation;
use crate::services::analysis::bridge_transport::{
    execute_json_with, AppBridgeTransport, BridgeRequest,
};
use crate::services::analysis::runtime_session_service::{
    ensure_attached_session, ensure_scene_bridge_session_started, execute_runtime_operation,
};
use crate::state::AppState;
use serde::Deserialize;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

fn log_scene_duration(label: &str, started_at: Instant, details: &str) {
    eprintln!(
        "[perf][scene-service] {label} completed in {}ms {details}",
        started_at.elapsed().as_millis()
    );
}

const TREE_CHILDREN_PAGE_SIZE: usize = 24;
const INSPECTOR_CHILDREN_PAGE_SIZE: usize = 64;
const INSPECTOR_COMPONENTS_PAGE_SIZE: usize = 64;
const SCENE_WORKSPACE_STATE_UPDATED_EVENT: &str = "scene-workspace-state-updated";
const SCENE_CHILDREN_TASK_UPDATED_EVENT: &str = "scene-children-task-updated";
const SCENE_INSPECTOR_TASK_UPDATED_EVENT: &str = "scene-inspector-task-updated";

fn emit_scene_workspace_state(app: &AppHandle, workspace: &SceneWorkspaceState) {
    if let Err(error) = app.emit(SCENE_WORKSPACE_STATE_UPDATED_EVENT, workspace.clone()) {
        eprintln!("[scene-service] failed to emit workspace state event: {error}");
    }
}

fn emit_scene_children_task_state(app: &AppHandle, task_state: &RuntimeSceneObjectChildrenTaskState) {
    if let Err(error) = app.emit(SCENE_CHILDREN_TASK_UPDATED_EVENT, task_state.clone()) {
        eprintln!("[scene-service] failed to emit children task event: {error}");
    }
}

fn emit_scene_inspector_task_state(app: &AppHandle, task_state: &RuntimeSceneObjectInspectorTaskState) {
    if let Err(error) = app.emit(SCENE_INSPECTOR_TASK_UPDATED_EVENT, task_state.clone()) {
        eprintln!("[scene-service] failed to emit inspector task event: {error}");
    }
}

#[derive(Debug, Deserialize)]
struct HelperSceneNodeSummary {
    object_address: String,
    transform_address: Option<String>,
    parent_object_address: Option<String>,
    name: String,
    active_self: bool,
    is_static: Option<bool>,
    child_count: usize,
    has_children: bool,
    component_count: Option<usize>,
    layer: Option<i32>,
    tag: Option<String>,
    hide_flags: Option<String>,
    path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum HelperSceneKind {
    Loaded,
    DontDestroyOnLoad,
    HideAndDontSave,
}

#[derive(Debug, Deserialize)]
struct HelperSceneBuildSettingsEntry {
    build_index: i32,
    path: String,
    name: String,
    is_loaded: bool,
}

#[derive(Debug, Deserialize)]
struct HelperSceneDescriptor {
    scene_handle: i32,
    name: String,
    is_loaded: bool,
    kind: HelperSceneKind,
    build_index: Option<i32>,
    path: Option<String>,
    roots: Vec<HelperSceneNodeSummary>,
}

#[derive(Debug, Deserialize)]
struct HelperSceneCatalogResponse {
    generated_at: String,
    scenes: Vec<HelperSceneDescriptor>,
    build_settings_scenes: Vec<HelperSceneBuildSettingsEntry>,
}

#[derive(Debug, Deserialize)]
struct HelperSceneChildrenResponse {
    parent_object_address: String,
    children: Vec<HelperSceneNodeSummary>,
}

#[derive(Debug, Deserialize)]
struct HelperSceneComponentSummary {
    component_address: String,
    type_name: String,
    is_behaviour: bool,
    behaviour_enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct HelperSceneHierarchyPathEntry {
    object_address: String,
    name: String,
}

#[derive(Debug, Deserialize)]
struct HelperVector3Snapshot {
    x: f32,
    y: f32,
    z: f32,
}

#[derive(Debug, Deserialize)]
struct HelperQuaternionSnapshot {
    x: f32,
    y: f32,
    z: f32,
    w: f32,
}

#[derive(Debug, Deserialize)]
struct HelperSceneTransformSnapshot {
    transform_address: String,
    world_position: Option<HelperVector3Snapshot>,
    local_position: Option<HelperVector3Snapshot>,
    local_rotation: Option<HelperQuaternionSnapshot>,
    local_euler_angles: Option<HelperVector3Snapshot>,
    local_scale: Option<HelperVector3Snapshot>,
    parent_transform_address: Option<String>,
    parent_object_address: Option<String>,
    child_count: usize,
}

#[derive(Debug, Deserialize)]
struct HelperSceneInspectorResponse {
    generated_at: String,
    scene_handle: Option<i32>,
    scene_name: Option<String>,
    scene_kind: Option<HelperSceneKind>,
    object: HelperSceneNodeSummary,
    parent: Option<HelperSceneNodeSummary>,
    hierarchy_path: Vec<HelperSceneHierarchyPathEntry>,
    children: Vec<HelperSceneNodeSummary>,
    components: Vec<HelperSceneComponentSummary>,
    transform: Option<HelperSceneTransformSnapshot>,
}

#[derive(Debug, Deserialize)]
struct HelperSceneInspectorHeaderResponse {
    generated_at: String,
    scene_handle: Option<i32>,
    scene_name: Option<String>,
    scene_kind: Option<HelperSceneKind>,
    object: HelperSceneNodeSummary,
    parent: Option<HelperSceneNodeSummary>,
    hierarchy_path: Vec<HelperSceneHierarchyPathEntry>,
    transform: Option<HelperSceneTransformSnapshot>,
}

#[derive(Debug, Deserialize)]
struct HelperSceneChildrenPageResponse {
    generated_at: String,
    parent_object_address: String,
    offset: usize,
    total_count: usize,
    next_offset: Option<usize>,
    children: Vec<HelperSceneNodeSummary>,
}

#[derive(Debug, Deserialize)]
struct HelperSceneComponentsPageResponse {
    generated_at: String,
    object_address: String,
    offset: usize,
    total_count: usize,
    next_offset: Option<usize>,
    components: Vec<HelperSceneComponentSummary>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum HelperSceneMutationOperation {
    CreateRoot,
    CreateChild,
    Duplicate,
    Delete,
    Rename,
    SetTag,
    SetLayer,
    SetHideFlags,
    Reparent,
    SetActive,
    SetTransform,
    SetBehaviourEnabled,
    AddComponent,
    RemoveComponent,
    LoadScene,
}

#[derive(Debug, Deserialize)]
struct HelperSceneSelectionHint {
    scene_handle: Option<i32>,
    object_address: String,
    ancestor_object_addresses: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct HelperSceneMutationResponse {
    operation: HelperSceneMutationOperation,
    scene_handle: Option<i32>,
    target_object_address: Option<String>,
    parent_object_address: Option<String>,
    object: Option<HelperSceneNodeSummary>,
    deleted_object_address: Option<String>,
    preferred_selection_address: Option<String>,
    preferred_selection_hint: Option<HelperSceneSelectionHint>,
    active_self: Option<bool>,
    tag: Option<String>,
    layer: Option<i32>,
    hide_flags: Option<String>,
    behaviour_enabled: Option<bool>,
    hierarchy_path: Vec<HelperSceneHierarchyPathEntry>,
    transform: Option<HelperSceneTransformSnapshot>,
}

pub fn start_scene_refresh(app: &AppHandle, state: &AppState) -> Result<SceneWorkspaceState, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;
    let workspace = state.scene.set_refreshing();
    emit_scene_workspace_state(app, &workspace);

    let snapshot = match execute_runtime_operation(state, || load_scene_catalog(app, state)) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            let workspace = state.scene.set_error(error.clone());
            emit_scene_workspace_state(app, &workspace);
            return Err(error);
        }
    };

    let scene_count = snapshot.scenes.len();
    let root_count = snapshot.scenes.iter().map(|scene| scene.roots.len()).sum::<usize>();
    let workspace = state.scene.set_snapshot(snapshot);
    emit_scene_workspace_state(app, &workspace);
    state.scene_children.reset();
    state.scene_inspector.reset();
    log_scene_duration(
        "start_scene_refresh",
        started_at,
        &format!("scene_count={scene_count} root_count={root_count}"),
    );
    Ok(workspace)
}

pub fn start_scene_object_children_analysis(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneObjectChildrenTaskState, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let task_start = state.scene_children.start_task(object_address.to_string());
    emit_scene_children_task_state(app, &task_start.state);
    if task_start.should_spawn {
        let app_handle = app.clone();
        let object_address = object_address.to_string();
        let task_id = task_start.state.task_id;
        let mutation_epoch = task_start.state.mutation_epoch;
        tauri::async_runtime::spawn_blocking(move || {
            let state = app_handle.state::<AppState>();
            run_scene_object_children_task(&app_handle, &state, &object_address, task_id, mutation_epoch);
        });
    }

    log_scene_duration(
        "start_scene_object_children_analysis",
        started_at,
        &format!(
            "object_address={object_address} task_id={} spawn={}",
            task_start.state.task_id,
            task_start.should_spawn
        ),
    );
    Ok(task_start.state)
}

pub fn get_scene_object_children_state(
    state: &AppState,
    object_address: &str,
) -> Option<RuntimeSceneObjectChildrenTaskState> {
    state.scene_children.current(object_address)
}

pub fn cancel_scene_object_children_analysis(
    state: &AppState,
    object_address: &str,
    task_id: Option<u64>,
) -> Option<RuntimeSceneObjectChildrenTaskState> {
    state.scene_children.cancel(object_address, task_id)
}

pub fn start_scene_object_inspector_analysis(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneObjectInspectorTaskState, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let task_start = state.scene_inspector.start_task(object_address.to_string());
    emit_scene_inspector_task_state(app, &task_start.state);
    if !task_start.use_cached {
        let app_handle = app.clone();
        let object_address = object_address.to_string();
        let task_id = task_start.state.task_id;
        let mutation_epoch = task_start.state.mutation_epoch;
        tauri::async_runtime::spawn_blocking(move || {
            let state = app_handle.state::<AppState>();
            run_scene_object_inspector_task(&app_handle, &state, &object_address, task_id, mutation_epoch);
        });
    }

    log_scene_duration(
        "start_scene_object_inspector_analysis",
        started_at,
        &format!(
            "object_address={object_address} task_id={} cached={}",
            task_start.state.task_id,
            task_start.use_cached
        ),
    );
    Ok(task_start.state)
}

pub fn get_scene_object_inspector_state(state: &AppState) -> Option<RuntimeSceneObjectInspectorTaskState> {
    state.scene_inspector.current()
}

pub fn cancel_scene_object_inspector_analysis(
    state: &AppState,
    task_id: Option<u64>,
) -> Option<RuntimeSceneObjectInspectorTaskState> {
    state.scene_inspector.cancel(task_id)
}

pub fn get_scene_object_children(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneChildrenSnapshot, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || load_scene_children(app, state, object_address))?;
    log_scene_duration(
        "get_scene_object_children",
        started_at,
        &format!("object_address={object_address} child_count={}", snapshot.children.len()),
    );
    Ok(snapshot)
}

pub fn get_scene_object_inspector(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneObjectInspectorSnapshot, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || load_scene_inspector(app, state, object_address))?;
    log_scene_duration(
        "get_scene_object_inspector",
        started_at,
        &format!(
            "object_address={object_address} children={} components={}",
            snapshot.children.len(),
            snapshot.components.len()
        ),
    );
    Ok(snapshot)
}

pub fn create_scene_child(
    app: &AppHandle,
    state: &AppState,
    parent_object_address: &str,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || load_scene_child_creation(app, state, parent_object_address, name))?;
    invalidate_scene_children_after_mutation(state, &snapshot);
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    log_scene_duration(
        "create_scene_child",
        started_at,
        &format!(
            "parent_object_address={parent_object_address} target_object_address={}",
            snapshot.target_object_address.as_deref().unwrap_or("null")
        ),
    );
    Ok(snapshot)
}

pub fn create_scene_root(
    app: &AppHandle,
    state: &AppState,
    scene_handle: i32,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || load_scene_root_creation(app, state, scene_handle, name))?;
    invalidate_scene_children_after_mutation(state, &snapshot);
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    log_scene_duration(
        "create_scene_root",
        started_at,
        &format!(
            "scene_handle={scene_handle} name={name} target_object_address={} ",
            snapshot.target_object_address.as_deref().unwrap_or("null")
        ),
    );
    Ok(snapshot)
}

pub fn duplicate_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || load_scene_object_duplicate(app, state, object_address))?;
    invalidate_scene_children_after_mutation(state, &snapshot);
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    log_scene_duration(
        "duplicate_scene_object",
        started_at,
        &format!(
            "object_address={object_address} target_object_address={}",
            snapshot.target_object_address.as_deref().unwrap_or("null")
        ),
    );
    Ok(snapshot)
}

pub fn delete_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || load_scene_object_delete(app, state, object_address))?;
    invalidate_scene_children_after_mutation(state, &snapshot);
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    log_scene_duration(
        "delete_scene_object",
        started_at,
        &format!(
            "object_address={object_address} deleted_object_address={}",
            snapshot.deleted_object_address.as_deref().unwrap_or("null")
        ),
    );
    Ok(snapshot)
}

pub fn rename_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || load_scene_object_rename(app, state, object_address, name))?;
    invalidate_scene_children_after_mutation(state, &snapshot);
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    log_scene_duration(
        "rename_scene_object",
        started_at,
        &format!("object_address={object_address} name={name}"),
    );
    Ok(snapshot)
}

pub fn set_scene_object_tag(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    tag: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || load_scene_object_set_tag(app, state, object_address, tag))?;
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    log_scene_duration(
        "set_scene_object_tag",
        started_at,
        &format!("object_address={object_address} tag={tag}"),
    );
    Ok(snapshot)
}

pub fn set_scene_object_layer(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    layer: i32,
) -> Result<RuntimeSceneMutationResult, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || load_scene_object_set_layer(app, state, object_address, layer))?;
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    log_scene_duration(
        "set_scene_object_layer",
        started_at,
        &format!("object_address={object_address} layer={layer}"),
    );
    Ok(snapshot)
}

pub fn set_scene_object_hide_flags(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    hide_flags: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || load_scene_object_set_hide_flags(app, state, object_address, hide_flags))?;
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    log_scene_duration(
        "set_scene_object_hide_flags",
        started_at,
        &format!("object_address={object_address} hide_flags={hide_flags}"),
    );
    Ok(snapshot)
}

pub fn reparent_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    parent_object_address: Option<&str>,
    parent_path: Option<&str>,
) -> Result<RuntimeSceneMutationResult, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || {
        load_scene_object_reparent(app, state, object_address, parent_object_address, parent_path)
    })?;
    invalidate_scene_children_after_mutation(state, &snapshot);
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    log_scene_duration(
        "reparent_scene_object",
        started_at,
        &format!("object_address={object_address} parent_object_address={}", parent_object_address.unwrap_or("null")),
    );
    Ok(snapshot)
}

pub fn set_scene_object_active(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    active_self: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || load_scene_object_set_active(app, state, object_address, active_self))?;
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    log_scene_duration(
        "set_scene_object_active",
        started_at,
        &format!(
            "object_address={object_address} active_self={active_self} target_object_address={}",
            snapshot.target_object_address.as_deref().unwrap_or("null")
        ),
    );
    Ok(snapshot)
}

pub fn set_scene_object_transform(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    transform_update: &RuntimeSceneTransformUpdate,
) -> Result<RuntimeSceneMutationResult, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || {
        load_scene_object_set_transform(app, state, object_address, transform_update)
    })?;
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    log_scene_duration(
        "set_scene_object_transform",
        started_at,
        &format!(
            "object_address={object_address} target_object_address={}",
            snapshot.target_object_address.as_deref().unwrap_or("null")
        ),
    );
    Ok(snapshot)
}

pub fn set_scene_behaviour_enabled(
    app: &AppHandle,
    state: &AppState,
    component_address: &str,
    enabled: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || {
        load_scene_component_set_behaviour_enabled(app, state, component_address, enabled)
    })?;
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    log_scene_duration(
        "set_scene_behaviour_enabled",
        started_at,
        &format!("component_address={component_address} enabled={enabled}"),
    );
    Ok(snapshot)
}

pub fn create_scene_component(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    component_type_name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || {
        load_scene_component_create(app, state, object_address, component_type_name)
    })?;
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    log_scene_duration(
        "create_scene_component",
        started_at,
        &format!(
            "object_address={object_address} component_type_name={} target_object_address={}",
            component_type_name,
            snapshot.target_object_address.as_deref().unwrap_or("null")
        ),
    );
    Ok(snapshot)
}

pub fn delete_scene_component(
    app: &AppHandle,
    state: &AppState,
    component_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || {
        load_scene_component_delete(app, state, component_address)
    })?;
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    log_scene_duration(
        "delete_scene_component",
        started_at,
        &format!(
            "component_address={component_address} target_object_address={}",
            snapshot.target_object_address.as_deref().unwrap_or("null")
        ),
    );
    Ok(snapshot)
}

pub fn load_scene_by_build_index(
    app: &AppHandle,
    state: &AppState,
    build_index: i32,
) -> Result<RuntimeSceneMutationResult, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || load_scene_by_build_index_request(app, state, build_index))?;
    invalidate_scene_children_after_mutation(state, &snapshot);
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    log_scene_duration(
        "load_scene_by_build_index",
        started_at,
        &format!("build_index={build_index}"),
    );
    Ok(snapshot)
}

fn load_scene_catalog(app: &AppHandle, state: &AppState) -> Result<RuntimeSceneCatalogSnapshot, String> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneCatalogResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneCatalogLoad,
            executable_name: "UnityMonoBridge.exe",
            args: vec!["--operation".into(), "scene-catalog".into(), "--pid".into(), attached.pid.to_string()],
        },
    )?;

    let snapshot = RuntimeSceneCatalogSnapshot {
        generated_at: helper.generated_at,
        scenes: helper.scenes.into_iter().map(map_scene_descriptor).collect(),
        build_settings_scenes: helper.build_settings_scenes.into_iter().map(map_scene_build_settings_entry).collect(),
    };
    log_scene_duration(
        "load_scene_catalog",
        started_at,
        &format!("pid={} scene_count={}", attached.pid, snapshot.scenes.len()),
    );
    Ok(snapshot)
}

fn load_scene_children(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneChildrenSnapshot, String> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneChildrenResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectChildrenLoad,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-children".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--object-address".into(),
                object_address.to_string(),
            ],
        },
    )?;

    let snapshot = RuntimeSceneChildrenSnapshot {
        parent_object_address: helper.parent_object_address,
        children: helper.children.into_iter().map(map_scene_node_summary).collect(),
    };
    log_scene_duration(
        "load_scene_children",
        started_at,
        &format!("pid={} object_address={} child_count={}", attached.pid, object_address, snapshot.children.len()),
    );
    Ok(snapshot)
}

fn load_scene_children_page(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    offset: usize,
    limit: usize,
) -> Result<RuntimeSceneChildrenPageSnapshot, String> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneChildrenPageResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectChildrenPageLoad,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-children-page".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--object-address".into(),
                object_address.to_string(),
                "--offset".into(),
                offset.to_string(),
                "--limit".into(),
                limit.to_string(),
            ],
        },
    )?;

    let snapshot = RuntimeSceneChildrenPageSnapshot {
        generated_at: helper.generated_at,
        parent_object_address: helper.parent_object_address,
        offset: helper.offset,
        total_count: helper.total_count,
        next_offset: helper.next_offset,
        children: helper.children.into_iter().map(map_scene_node_summary).collect(),
    };
    log_scene_duration(
        "load_scene_children_page",
        started_at,
        &format!(
            "pid={} object_address={} offset={} loaded={} total={}",
            attached.pid,
            object_address,
            snapshot.offset,
            snapshot.children.len(),
            snapshot.total_count
        ),
    );
    Ok(snapshot)
}

fn load_scene_inspector(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneObjectInspectorSnapshot, String> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneInspectorResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectInspect,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-inspect".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--object-address".into(),
                object_address.to_string(),
            ],
        },
    )?;

    let snapshot = RuntimeSceneObjectInspectorSnapshot {
        generated_at: helper.generated_at,
        scene_handle: helper.scene_handle,
        scene_name: helper.scene_name,
        scene_kind: helper.scene_kind.map(map_scene_kind),
        object: map_scene_node_summary(helper.object),
        parent: helper.parent.map(map_scene_node_summary),
        hierarchy_path: helper.hierarchy_path.into_iter().map(map_hierarchy_path_entry).collect(),
        children: helper.children.into_iter().map(map_scene_node_summary).collect(),
        components: helper.components.into_iter().map(map_scene_component).collect(),
        transform: helper.transform.map(map_transform_snapshot),
    };
    log_scene_duration(
        "load_scene_inspector",
        started_at,
        &format!(
            "pid={} object_address={} children={} components={}",
            attached.pid,
            object_address,
            snapshot.children.len(),
            snapshot.components.len()
        ),
    );
    Ok(snapshot)
}

fn load_scene_inspector_header(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneObjectInspectorHeaderSnapshot, String> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneInspectorHeaderResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectInspectHeader,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-inspect-header".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--object-address".into(),
                object_address.to_string(),
            ],
        },
    )?;

    let snapshot = RuntimeSceneObjectInspectorHeaderSnapshot {
        generated_at: helper.generated_at,
        scene_handle: helper.scene_handle,
        scene_name: helper.scene_name,
        scene_kind: helper.scene_kind.map(map_scene_kind),
        object: map_scene_node_summary(helper.object),
        parent: helper.parent.map(map_scene_node_summary),
        hierarchy_path: helper.hierarchy_path.into_iter().map(map_hierarchy_path_entry).collect(),
        transform: helper.transform.map(map_transform_snapshot),
    };
    log_scene_duration(
        "load_scene_inspector_header",
        started_at,
        &format!("pid={} object_address={object_address}", attached.pid),
    );
    Ok(snapshot)
}

fn load_scene_inspector_children_page(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    offset: usize,
    limit: usize,
) -> Result<RuntimeSceneChildrenPageSnapshot, String> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneChildrenPageResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectInspectChildrenPage,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-inspect-children-page".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--object-address".into(),
                object_address.to_string(),
                "--offset".into(),
                offset.to_string(),
                "--limit".into(),
                limit.to_string(),
            ],
        },
    )?;

    let snapshot = RuntimeSceneChildrenPageSnapshot {
        generated_at: helper.generated_at,
        parent_object_address: helper.parent_object_address,
        offset: helper.offset,
        total_count: helper.total_count,
        next_offset: helper.next_offset,
        children: helper.children.into_iter().map(map_scene_node_summary).collect(),
    };
    log_scene_duration(
        "load_scene_inspector_children_page",
        started_at,
        &format!(
            "pid={} object_address={} offset={} loaded={} total={}",
            attached.pid,
            object_address,
            snapshot.offset,
            snapshot.children.len(),
            snapshot.total_count
        ),
    );
    Ok(snapshot)
}

fn load_scene_inspector_components_page(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    offset: usize,
    limit: usize,
) -> Result<RuntimeSceneComponentsPageSnapshot, String> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneComponentsPageResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectInspectComponentsPage,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-inspect-components-page".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--object-address".into(),
                object_address.to_string(),
                "--offset".into(),
                offset.to_string(),
                "--limit".into(),
                limit.to_string(),
            ],
        },
    )?;

    let snapshot = RuntimeSceneComponentsPageSnapshot {
        generated_at: helper.generated_at,
        object_address: helper.object_address,
        offset: helper.offset,
        total_count: helper.total_count,
        next_offset: helper.next_offset,
        components: helper.components.into_iter().map(map_scene_component).collect(),
    };
    log_scene_duration(
        "load_scene_inspector_components_page",
        started_at,
        &format!(
            "pid={} object_address={} offset={} loaded={} total={}",
            attached.pid,
            object_address,
            snapshot.offset,
            snapshot.components.len(),
            snapshot.total_count
        ),
    );
    Ok(snapshot)
}

fn load_scene_child_creation(
    app: &AppHandle,
    state: &AppState,
    parent_object_address: &str,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneMutationResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectCreateChild,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-create-child".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--object-address".into(),
                parent_object_address.to_string(),
                "--name".into(),
                name.to_string(),
            ],
        },
    )?;

    Ok(map_scene_mutation(helper))
}

fn load_scene_root_creation(
    app: &AppHandle,
    state: &AppState,
    scene_handle: i32,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneMutationResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectCreateRoot,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-create-root".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--scene-handle".into(),
                scene_handle.to_string(),
                "--name".into(),
                name.to_string(),
            ],
        },
    )?;

    Ok(map_scene_mutation(helper))
}

fn load_scene_object_duplicate(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneMutationResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectDuplicate,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-duplicate".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--object-address".into(),
                object_address.to_string(),
            ],
        },
    )?;

    Ok(map_scene_mutation(helper))
}

fn load_scene_object_delete(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneMutationResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectDelete,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-delete".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--object-address".into(),
                object_address.to_string(),
            ],
        },
    )?;

    Ok(map_scene_mutation(helper))
}

fn load_scene_object_rename(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneMutationResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectRename,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-rename".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--object-address".into(),
                object_address.to_string(),
                "--name".into(),
                name.to_string(),
            ],
        },
    )?;

    Ok(map_scene_mutation(helper))
}

fn load_scene_object_set_tag(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    tag: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneMutationResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectSetTag,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-set-tag".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--object-address".into(),
                object_address.to_string(),
                "--tag".into(),
                tag.to_string(),
            ],
        },
    )?;

    Ok(map_scene_mutation(helper))
}

fn load_scene_object_set_layer(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    layer: i32,
) -> Result<RuntimeSceneMutationResult, String> {
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneMutationResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectSetLayer,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-set-layer".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--object-address".into(),
                object_address.to_string(),
                "--layer".into(),
                layer.to_string(),
            ],
        },
    )?;

    Ok(map_scene_mutation(helper))
}

fn load_scene_object_set_hide_flags(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    hide_flags: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneMutationResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectSetHideFlags,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-set-hide-flags".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--object-address".into(),
                object_address.to_string(),
                "--hide-flags".into(),
                hide_flags.to_string(),
            ],
        },
    )?;

    Ok(map_scene_mutation(helper))
}

fn load_scene_object_reparent(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    parent_object_address: Option<&str>,
    parent_path: Option<&str>,
) -> Result<RuntimeSceneMutationResult, String> {
    let attached = ensure_attached_session(state)?;
    let mut args = vec![
        "--operation".into(),
        "scene-reparent".into(),
        "--pid".into(),
        attached.pid.to_string(),
        "--object-address".into(),
        object_address.to_string(),
    ];
    if let Some(parent) = parent_object_address {
        args.push("--parent-object-address".into());
        args.push(parent.to_string());
    }
    if let Some(path) = parent_path {
        args.push("--path".into());
        args.push(path.to_string());
    }

    let helper: HelperSceneMutationResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectReparent,
            executable_name: "UnityMonoBridge.exe",
            args,
        },
    )?;

    Ok(map_scene_mutation(helper))
}

fn load_scene_object_set_active(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    active_self: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneMutationResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectSetActive,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-set-active".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--object-address".into(),
                object_address.to_string(),
                "--active-self".into(),
                active_self.to_string(),
            ],
        },
    )?;

    Ok(map_scene_mutation(helper))
}

fn load_scene_object_set_transform(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    transform_update: &RuntimeSceneTransformUpdate,
) -> Result<RuntimeSceneMutationResult, String> {
    let attached = ensure_attached_session(state)?;
    let mut args = vec![
        "--operation".into(),
        "scene-set-transform".into(),
        "--pid".into(),
        attached.pid.to_string(),
        "--object-address".into(),
        object_address.to_string(),
    ];
    if let Some(world_position) = transform_update.world_position.as_ref() {
        args.push("--world-position-x".into());
        args.push(world_position.x.to_string());
        args.push("--world-position-y".into());
        args.push(world_position.y.to_string());
        args.push("--world-position-z".into());
        args.push(world_position.z.to_string());
    }
    if let Some(local_position) = transform_update.local_position.as_ref() {
        args.push("--position-x".into());
        args.push(local_position.x.to_string());
        args.push("--position-y".into());
        args.push(local_position.y.to_string());
        args.push("--position-z".into());
        args.push(local_position.z.to_string());
    }
    if let Some(local_rotation) = transform_update.local_rotation.as_ref() {
        args.push("--rotation-x".into());
        args.push(local_rotation.x.to_string());
        args.push("--rotation-y".into());
        args.push(local_rotation.y.to_string());
        args.push("--rotation-z".into());
        args.push(local_rotation.z.to_string());
        args.push("--rotation-w".into());
        args.push(local_rotation.w.to_string());
    }
    if let Some(local_euler_angles) = transform_update.local_euler_angles.as_ref() {
        args.push("--euler-x".into());
        args.push(local_euler_angles.x.to_string());
        args.push("--euler-y".into());
        args.push(local_euler_angles.y.to_string());
        args.push("--euler-z".into());
        args.push(local_euler_angles.z.to_string());
    }
    if let Some(local_scale) = transform_update.local_scale.as_ref() {
        args.push("--scale-x".into());
        args.push(local_scale.x.to_string());
        args.push("--scale-y".into());
        args.push(local_scale.y.to_string());
        args.push("--scale-z".into());
        args.push(local_scale.z.to_string());
    }
    let helper: HelperSceneMutationResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneObjectSetTransform,
            executable_name: "UnityMonoBridge.exe",
            args,
        },
    )?;

    Ok(map_scene_mutation(helper))
}

fn load_scene_component_set_behaviour_enabled(
    app: &AppHandle,
    state: &AppState,
    component_address: &str,
    enabled: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneMutationResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneComponentSetBehaviourEnabled,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-component-set-behaviour-enabled".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--component-address".into(),
                component_address.to_string(),
                "--enabled".into(),
                enabled.to_string(),
            ],
        },
    )?;

    Ok(map_scene_mutation(helper))
}

fn load_scene_component_create(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    component_type_name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneMutationResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneComponentCreate,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-component-create".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--object-address".into(),
                object_address.to_string(),
                "--component-type".into(),
                component_type_name.to_string(),
            ],
        },
    )?;

    Ok(map_scene_mutation(helper))
}

fn load_scene_component_delete(
    app: &AppHandle,
    state: &AppState,
    component_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneMutationResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneComponentDelete,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-component-delete".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--component-address".into(),
                component_address.to_string(),
            ],
        },
    )?;

    Ok(map_scene_mutation(helper))
}

fn load_scene_by_build_index_request(
    app: &AppHandle,
    state: &AppState,
    build_index: i32,
) -> Result<RuntimeSceneMutationResult, String> {
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneMutationResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneLoadByBuildIndex,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-load-by-build-index".into(),
                "--pid".into(),
                attached.pid.to_string(),
                "--build-index".into(),
                build_index.to_string(),
            ],
        },
    )?;

    Ok(map_scene_mutation(helper))
}

fn map_scene_descriptor(value: HelperSceneDescriptor) -> RuntimeSceneDescriptor {
    RuntimeSceneDescriptor {
        scene_handle: value.scene_handle,
        name: value.name,
        is_loaded: value.is_loaded,
        kind: map_scene_kind(value.kind),
        build_index: value.build_index,
        path: value.path,
        roots: value.roots.into_iter().map(map_scene_node_summary).collect(),
    }
}

fn map_scene_kind(value: HelperSceneKind) -> RuntimeSceneKind {
    match value {
        HelperSceneKind::Loaded => RuntimeSceneKind::Loaded,
        HelperSceneKind::DontDestroyOnLoad => RuntimeSceneKind::DontDestroyOnLoad,
        HelperSceneKind::HideAndDontSave => RuntimeSceneKind::HideAndDontSave,
    }
}

fn map_scene_build_settings_entry(value: HelperSceneBuildSettingsEntry) -> RuntimeSceneBuildSettingsEntry {
    RuntimeSceneBuildSettingsEntry {
        build_index: value.build_index,
        path: value.path,
        name: value.name,
        is_loaded: value.is_loaded,
    }
}

fn map_scene_node_summary(value: HelperSceneNodeSummary) -> RuntimeSceneNodeSummary {
    RuntimeSceneNodeSummary {
        object_address: value.object_address,
        transform_address: value.transform_address,
        parent_object_address: value.parent_object_address,
        name: value.name,
        active_self: value.active_self,
        is_static: value.is_static,
        child_count: value.child_count,
        has_children: value.has_children,
        component_count: value.component_count,
        layer: value.layer,
        tag: value.tag,
        hide_flags: value.hide_flags,
        path: value.path,
    }
}

fn map_scene_component(value: HelperSceneComponentSummary) -> RuntimeSceneComponentSummary {
    RuntimeSceneComponentSummary {
        component_address: value.component_address,
        type_name: value.type_name,
        is_behaviour: value.is_behaviour,
        behaviour_enabled: value.behaviour_enabled,
    }
}

fn map_hierarchy_path_entry(value: HelperSceneHierarchyPathEntry) -> RuntimeSceneHierarchyPathEntry {
    RuntimeSceneHierarchyPathEntry {
        object_address: value.object_address,
        name: value.name,
    }
}

fn map_vector3(value: HelperVector3Snapshot) -> RuntimeVector3Snapshot {
    RuntimeVector3Snapshot {
        x: value.x,
        y: value.y,
        z: value.z,
    }
}

fn map_quaternion(value: HelperQuaternionSnapshot) -> RuntimeQuaternionSnapshot {
    RuntimeQuaternionSnapshot {
        x: value.x,
        y: value.y,
        z: value.z,
        w: value.w,
    }
}

fn map_transform_snapshot(value: HelperSceneTransformSnapshot) -> RuntimeSceneTransformSnapshot {
    RuntimeSceneTransformSnapshot {
        transform_address: value.transform_address,
        world_position: value.world_position.map(map_vector3),
        local_position: value.local_position.map(map_vector3),
        local_rotation: value.local_rotation.map(map_quaternion),
        local_euler_angles: value.local_euler_angles.map(map_vector3),
        local_scale: value.local_scale.map(map_vector3),
        parent_transform_address: value.parent_transform_address,
        parent_object_address: value.parent_object_address,
        child_count: value.child_count,
    }
}

fn map_selection_hint(value: HelperSceneSelectionHint) -> RuntimeSceneSelectionHint {
    RuntimeSceneSelectionHint {
        scene_handle: value.scene_handle,
        object_address: value.object_address,
        ancestor_object_addresses: value.ancestor_object_addresses,
    }
}

fn map_scene_mutation(value: HelperSceneMutationResponse) -> RuntimeSceneMutationResult {
    RuntimeSceneMutationResult {
        operation: match value.operation {
            HelperSceneMutationOperation::CreateRoot => RuntimeSceneMutationOperation::CreateRoot,
            HelperSceneMutationOperation::CreateChild => RuntimeSceneMutationOperation::CreateChild,
            HelperSceneMutationOperation::Duplicate => RuntimeSceneMutationOperation::Duplicate,
            HelperSceneMutationOperation::Delete => RuntimeSceneMutationOperation::Delete,
            HelperSceneMutationOperation::Rename => RuntimeSceneMutationOperation::Rename,
            HelperSceneMutationOperation::SetTag => RuntimeSceneMutationOperation::SetTag,
            HelperSceneMutationOperation::SetLayer => RuntimeSceneMutationOperation::SetLayer,
            HelperSceneMutationOperation::SetHideFlags => RuntimeSceneMutationOperation::SetHideFlags,
            HelperSceneMutationOperation::Reparent => RuntimeSceneMutationOperation::Reparent,
            HelperSceneMutationOperation::SetActive => RuntimeSceneMutationOperation::SetActive,
            HelperSceneMutationOperation::SetTransform => RuntimeSceneMutationOperation::SetTransform,
            HelperSceneMutationOperation::SetBehaviourEnabled => RuntimeSceneMutationOperation::SetBehaviourEnabled,
            HelperSceneMutationOperation::AddComponent => RuntimeSceneMutationOperation::AddComponent,
            HelperSceneMutationOperation::RemoveComponent => RuntimeSceneMutationOperation::RemoveComponent,
            HelperSceneMutationOperation::LoadScene => RuntimeSceneMutationOperation::LoadScene,
        },
        scene_handle: value.scene_handle,
        target_object_address: value.target_object_address,
        parent_object_address: value.parent_object_address,
        object: value.object.map(map_scene_node_summary),
        deleted_object_address: value.deleted_object_address,
        preferred_selection_address: value.preferred_selection_address,
        preferred_selection_hint: value.preferred_selection_hint.map(map_selection_hint),
        active_self: value.active_self,
        tag: value.tag,
        layer: value.layer,
        hide_flags: value.hide_flags,
        behaviour_enabled: value.behaviour_enabled,
        hierarchy_path: value.hierarchy_path.into_iter().map(map_hierarchy_path_entry).collect(),
        transform: value.transform.map(map_transform_snapshot),
    }
}

fn invalidate_scene_inspector_after_mutation(state: &AppState, result: &RuntimeSceneMutationResult) {
    let impacted = collect_impacted_object_addresses(result);
    state.scene_inspector.invalidate_related(&impacted);
}

fn invalidate_scene_children_after_mutation(state: &AppState, result: &RuntimeSceneMutationResult) {
    if matches!(
        result.operation,
        RuntimeSceneMutationOperation::SetActive
            | RuntimeSceneMutationOperation::SetTransform
            | RuntimeSceneMutationOperation::SetTag
            | RuntimeSceneMutationOperation::SetLayer
            | RuntimeSceneMutationOperation::SetHideFlags
            | RuntimeSceneMutationOperation::SetBehaviourEnabled
            | RuntimeSceneMutationOperation::AddComponent
            | RuntimeSceneMutationOperation::RemoveComponent
    ) {
        return;
    }

    let impacted = collect_impacted_object_addresses(result);
    state.scene_children.invalidate_related(&impacted);
}

fn collect_impacted_object_addresses(result: &RuntimeSceneMutationResult) -> Vec<String> {
    let mut impacted = Vec::new();
    if let Some(target) = result.target_object_address.as_ref() {
        impacted.push(target.clone());
    }
    if let Some(parent) = result.parent_object_address.as_ref() {
        impacted.push(parent.clone());
    }
    if let Some(deleted) = result.deleted_object_address.as_ref() {
        impacted.push(deleted.clone());
    }
    if let Some(object) = result.object.as_ref() {
        impacted.push(object.object_address.clone());
        if let Some(parent) = object.parent_object_address.as_ref() {
            impacted.push(parent.clone());
        }
    }
    if let Some(selection_hint) = result.preferred_selection_hint.as_ref() {
        impacted.push(selection_hint.object_address.clone());
        impacted.extend(selection_hint.ancestor_object_addresses.iter().cloned());
    }
    impacted.extend(
        result
            .hierarchy_path
            .iter()
            .map(|entry| entry.object_address.clone()),
    );
    if matches!(result.operation, RuntimeSceneMutationOperation::CreateRoot | RuntimeSceneMutationOperation::LoadScene) {
        stateful_scene_root_scope(result, &mut impacted);
    }
    impacted.sort();
    impacted.dedup();
    impacted
}

fn stateful_scene_root_scope(result: &RuntimeSceneMutationResult, impacted: &mut Vec<String>) {
    if let Some(parent) = result.parent_object_address.as_ref() {
        impacted.push(parent.clone());
    }
    if let Some(target) = result.target_object_address.as_ref() {
        impacted.push(target.clone());
    }
}

fn run_scene_object_children_task(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    task_id: u64,
    mutation_epoch: u64,
) {
    let mut child_offset = 0usize;
    loop {
        let page = match execute_runtime_operation(state, || {
            load_scene_children_page(app, state, object_address, child_offset, TREE_CHILDREN_PAGE_SIZE)
        }) {
            Ok(snapshot) => snapshot,
            Err(error) => {
                if let Some(task_state) = state.scene_children.fail(object_address, task_id, mutation_epoch, error) {
                    emit_scene_children_task_state(app, &task_state);
                }
                return;
            }
        };

        let next_offset = page.next_offset;
        let Some(task_state) = state
            .scene_children
            .apply_children(object_address, task_id, mutation_epoch, page.children, page.total_count, next_offset)
        else {
            return;
        };
        emit_scene_children_task_state(app, &task_state);

        match next_offset {
            Some(next) => child_offset = next,
            None => break,
        }
    }

    if let Some(task_state) = state.scene_children.complete(object_address, task_id, mutation_epoch) {
        emit_scene_children_task_state(app, &task_state);
    }
}

fn run_scene_object_inspector_task(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    task_id: u64,
    mutation_epoch: u64,
) {
    let header = match execute_runtime_operation(state, || load_scene_inspector_header(app, state, object_address)) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            if let Some(task_state) = state.scene_inspector.fail(task_id, mutation_epoch, error) {
                emit_scene_inspector_task_state(app, &task_state);
            }
            return;
        }
    };
    let Some(task_state) = state.scene_inspector.apply_header(task_id, mutation_epoch, header) else {
        return;
    };
    emit_scene_inspector_task_state(app, &task_state);

    let mut child_offset = 0usize;
    loop {
        let page = match execute_runtime_operation(state, || {
            load_scene_inspector_children_page(app, state, object_address, child_offset, INSPECTOR_CHILDREN_PAGE_SIZE)
        }) {
            Ok(snapshot) => snapshot,
            Err(error) => {
                if let Some(task_state) = state.scene_inspector.fail(task_id, mutation_epoch, error) {
                    emit_scene_inspector_task_state(app, &task_state);
                }
                return;
            }
        };

        let next_offset = page.next_offset;
        let Some(task_state) = state
            .scene_inspector
            .apply_children(task_id, mutation_epoch, page.children, page.total_count, next_offset)
        else {
            return;
        };
        emit_scene_inspector_task_state(app, &task_state);

        match next_offset {
            Some(next) => child_offset = next,
            None => break,
        }
    }

    let mut component_offset = 0usize;
    loop {
        let page = match execute_runtime_operation(state, || {
            load_scene_inspector_components_page(app, state, object_address, component_offset, INSPECTOR_COMPONENTS_PAGE_SIZE)
        }) {
            Ok(snapshot) => snapshot,
            Err(error) => {
                if let Some(task_state) = state.scene_inspector.fail(task_id, mutation_epoch, error) {
                    emit_scene_inspector_task_state(app, &task_state);
                }
                return;
            }
        };

        let next_offset = page.next_offset;
        let Some(task_state) = state
            .scene_inspector
            .apply_components(task_id, mutation_epoch, page.components, page.total_count, next_offset)
        else {
            return;
        };
        emit_scene_inspector_task_state(app, &task_state);

        match next_offset {
            Some(next) => component_offset = next,
            None => break,
        }
    }

    if let Some(task_state) = state.scene_inspector.complete(task_id, mutation_epoch) {
        emit_scene_inspector_task_state(app, &task_state);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::analysis::bridge_gateway::current_timestamp;

    #[test]
    fn mapping_preserves_scene_node_shape() {
        let mapped = map_scene_node_summary(HelperSceneNodeSummary {
            object_address: "0x10".into(),
            transform_address: Some("0x20".into()),
            parent_object_address: Some("0x01".into()),
            name: "Player".into(),
            active_self: true,
            is_static: Some(false),
            child_count: 2,
            has_children: true,
            component_count: Some(3),
            layer: Some(0),
            tag: Some("Player".into()),
            hide_flags: Some("None".into()),
            path: Some("GameplayRoot/Player".into()),
        });

        assert_eq!(mapped.object_address, "0x10");
        assert_eq!(mapped.transform_address.as_deref(), Some("0x20"));
        assert!(mapped.has_children);
        assert_eq!(mapped.component_count, Some(3));
    }

    #[test]
    fn scene_workspace_timestamp_stays_string_based() {
        let timestamp = current_timestamp();
        assert!(timestamp.parse::<u64>().is_ok());
    }
}