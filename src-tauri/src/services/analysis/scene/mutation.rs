use super::mapping::{map_scene_mutation, HelperSceneMutationResponse};
use super::{current_scene_session_key, log_scene_duration};
use crate::domain::analysis_models::{
    RuntimeSceneMutationOperation, RuntimeSceneMutationResult,
    RuntimeSceneTransformUpdate,
};
use crate::domain::bridge_protocol::BridgeOperation;
use crate::services::analysis::bridge_transport::{
    execute_json_with, AppBridgeTransport, BridgeRequest,
};
use crate::services::analysis::runtime_session_service::{
    ensure_attached_session, ensure_scene_bridge_session_started,
    execute_runtime_operation,
};
use crate::state::AppState;
use std::time::Instant;
use tauri::AppHandle;

pub fn create_scene_child(
    app: &AppHandle,
    state: &AppState,
    parent_object_address: &str,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        app,
        state,
        "create_scene_child",
        format!("parent_object_address={parent_object_address}"),
        || load_scene_child_creation(app, state, parent_object_address, name),
    )
}

pub fn create_scene_root(
    app: &AppHandle,
    state: &AppState,
    scene_handle: i32,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        app,
        state,
        "create_scene_root",
        format!("scene_handle={scene_handle}"),
        || load_scene_root_creation(app, state, scene_handle, name),
    )
}

pub fn duplicate_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        app,
        state,
        "duplicate_scene_object",
        format!("object_address={object_address}"),
        || load_scene_object_duplicate(app, state, object_address),
    )
}

pub fn delete_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        app,
        state,
        "delete_scene_object",
        format!("object_address={object_address}"),
        || load_scene_object_delete(app, state, object_address),
    )
}

pub fn rename_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        app,
        state,
        "rename_scene_object",
        format!("object_address={object_address}"),
        || load_scene_object_rename(app, state, object_address, name),
    )
}

pub fn set_scene_object_tag(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    tag: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        app,
        state,
        "set_scene_object_tag",
        format!("object_address={object_address}"),
        || load_scene_object_set_tag(app, state, object_address, tag),
    )
}

pub fn set_scene_object_layer(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    layer: i32,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        app,
        state,
        "set_scene_object_layer",
        format!("object_address={object_address} layer={layer}"),
        || load_scene_object_set_layer(app, state, object_address, layer),
    )
}

pub fn set_scene_object_hide_flags(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    hide_flags: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        app,
        state,
        "set_scene_object_hide_flags",
        format!("object_address={object_address}"),
        || load_scene_object_set_hide_flags(app, state, object_address, hide_flags),
    )
}

pub fn reparent_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    parent_object_address: Option<&str>,
    parent_path: Option<&str>,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        app,
        state,
        "reparent_scene_object",
        format!("object_address={object_address}"),
        || load_scene_object_reparent(app, state, object_address, parent_object_address, parent_path),
    )
}

pub fn set_scene_object_active(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    active_self: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        app,
        state,
        "set_scene_object_active",
        format!("object_address={object_address} active_self={active_self}"),
        || load_scene_object_set_active(app, state, object_address, active_self),
    )
}

pub fn set_scene_object_transform(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    transform_update: &RuntimeSceneTransformUpdate,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        app,
        state,
        "set_scene_object_transform",
        format!("object_address={object_address}"),
        || load_scene_object_set_transform(app, state, object_address, transform_update),
    )
}

pub fn set_scene_behaviour_enabled(
    app: &AppHandle,
    state: &AppState,
    component_address: &str,
    enabled: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        app,
        state,
        "set_scene_behaviour_enabled",
        format!("component_address={component_address} enabled={enabled}"),
        || load_scene_component_set_behaviour_enabled(app, state, component_address, enabled),
    )
}

pub fn create_scene_component(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    component_type_name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        app,
        state,
        "create_scene_component",
        format!("object_address={object_address} component_type_name={component_type_name}"),
        || load_scene_component_create(app, state, object_address, component_type_name),
    )
}

pub fn delete_scene_component(
    app: &AppHandle,
    state: &AppState,
    component_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        app,
        state,
        "delete_scene_component",
        format!("component_address={component_address}"),
        || load_scene_component_delete(app, state, component_address),
    )
}

pub fn load_scene_by_build_index(
    app: &AppHandle,
    state: &AppState,
    build_index: i32,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        app,
        state,
        "load_scene_by_build_index",
        format!("build_index={build_index}"),
        || load_scene_by_build_index_request(app, state, build_index),
    )
}

fn perform_scene_mutation<F>(
    app: &AppHandle,
    state: &AppState,
    label: &str,
    details: String,
    loader: F,
) -> Result<RuntimeSceneMutationResult, String>
where
    F: FnOnce() -> Result<RuntimeSceneMutationResult, String>,
{
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, loader)?;
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    invalidate_scene_children_after_mutation(state, &snapshot);
    log_scene_duration(label, started_at, &details);
    Ok(snapshot)
}

fn execute_scene_mutation_request(
    app: &AppHandle,
    state: &AppState,
    operation: BridgeOperation,
    operation_name: &str,
    mut args: Vec<String>,
) -> Result<RuntimeSceneMutationResult, String> {
    let attached = ensure_attached_session(state)?;
    let mut request_args = vec![
        "--operation".into(),
        operation_name.into(),
        "--pid".into(),
        attached.pid.to_string(),
    ];
    request_args.append(&mut args);

    let helper: HelperSceneMutationResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation,
            executable_name: "UnityMonoBridge.exe",
            args: request_args,
        },
    )?;

    Ok(map_scene_mutation(helper))
}

fn load_scene_child_creation(
    app: &AppHandle,
    state: &AppState,
    parent_object_address: &str,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    execute_scene_mutation_request(
        app,
        state,
        BridgeOperation::SceneObjectCreateChild,
        "scene-create-child",
        vec![
            "--object-address".into(),
            parent_object_address.to_string(),
            "--name".into(),
            name.to_string(),
        ],
    )
}

fn load_scene_root_creation(
    app: &AppHandle,
    state: &AppState,
    scene_handle: i32,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    execute_scene_mutation_request(
        app,
        state,
        BridgeOperation::SceneObjectCreateRoot,
        "scene-create-root",
        vec![
            "--scene-handle".into(),
            scene_handle.to_string(),
            "--name".into(),
            name.to_string(),
        ],
    )
}

fn load_scene_object_duplicate(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    execute_scene_mutation_request(
        app,
        state,
        BridgeOperation::SceneObjectDuplicate,
        "scene-duplicate",
        vec!["--object-address".into(), object_address.to_string()],
    )
}

fn load_scene_object_delete(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    execute_scene_mutation_request(
        app,
        state,
        BridgeOperation::SceneObjectDelete,
        "scene-delete",
        vec!["--object-address".into(), object_address.to_string()],
    )
}

fn load_scene_object_rename(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    execute_scene_mutation_request(
        app,
        state,
        BridgeOperation::SceneObjectRename,
        "scene-rename",
        vec![
            "--object-address".into(),
            object_address.to_string(),
            "--name".into(),
            name.to_string(),
        ],
    )
}

fn load_scene_object_set_tag(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    tag: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    execute_scene_mutation_request(
        app,
        state,
        BridgeOperation::SceneObjectSetTag,
        "scene-set-tag",
        vec![
            "--object-address".into(),
            object_address.to_string(),
            "--tag".into(),
            tag.to_string(),
        ],
    )
}

fn load_scene_object_set_layer(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    layer: i32,
) -> Result<RuntimeSceneMutationResult, String> {
    execute_scene_mutation_request(
        app,
        state,
        BridgeOperation::SceneObjectSetLayer,
        "scene-set-layer",
        vec![
            "--object-address".into(),
            object_address.to_string(),
            "--layer".into(),
            layer.to_string(),
        ],
    )
}

fn load_scene_object_set_hide_flags(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    hide_flags: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    execute_scene_mutation_request(
        app,
        state,
        BridgeOperation::SceneObjectSetHideFlags,
        "scene-set-hide-flags",
        vec![
            "--object-address".into(),
            object_address.to_string(),
            "--hide-flags".into(),
            hide_flags.to_string(),
        ],
    )
}

fn load_scene_object_reparent(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    parent_object_address: Option<&str>,
    parent_path: Option<&str>,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut args = vec!["--object-address".into(), object_address.to_string()];
    if let Some(parent) = parent_object_address {
        args.push("--parent-object-address".into());
        args.push(parent.to_string());
    }
    if let Some(path) = parent_path {
        args.push("--path".into());
        args.push(path.to_string());
    }

    execute_scene_mutation_request(
        app,
        state,
        BridgeOperation::SceneObjectReparent,
        "scene-reparent",
        args,
    )
}

fn load_scene_object_set_active(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    active_self: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    execute_scene_mutation_request(
        app,
        state,
        BridgeOperation::SceneObjectSetActive,
        "scene-set-active",
        vec![
            "--object-address".into(),
            object_address.to_string(),
            "--active-self".into(),
            active_self.to_string(),
        ],
    )
}

fn load_scene_object_set_transform(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    transform_update: &RuntimeSceneTransformUpdate,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut args = vec!["--object-address".into(), object_address.to_string()];
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

    execute_scene_mutation_request(
        app,
        state,
        BridgeOperation::SceneObjectSetTransform,
        "scene-set-transform",
        args,
    )
}

fn load_scene_component_set_behaviour_enabled(
    app: &AppHandle,
    state: &AppState,
    component_address: &str,
    enabled: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    execute_scene_mutation_request(
        app,
        state,
        BridgeOperation::SceneComponentSetBehaviourEnabled,
        "scene-component-set-behaviour-enabled",
        vec![
            "--component-address".into(),
            component_address.to_string(),
            "--enabled".into(),
            enabled.to_string(),
        ],
    )
}

fn load_scene_component_create(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    component_type_name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    execute_scene_mutation_request(
        app,
        state,
        BridgeOperation::SceneComponentCreate,
        "scene-component-create",
        vec![
            "--object-address".into(),
            object_address.to_string(),
            "--component-type".into(),
            component_type_name.to_string(),
        ],
    )
}

fn load_scene_component_delete(
    app: &AppHandle,
    state: &AppState,
    component_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    execute_scene_mutation_request(
        app,
        state,
        BridgeOperation::SceneComponentDelete,
        "scene-component-delete",
        vec!["--component-address".into(), component_address.to_string()],
    )
}

fn load_scene_by_build_index_request(
    app: &AppHandle,
    state: &AppState,
    build_index: i32,
) -> Result<RuntimeSceneMutationResult, String> {
    execute_scene_mutation_request(
        app,
        state,
        BridgeOperation::SceneLoadByBuildIndex,
        "scene-load-by-build-index",
        vec!["--build-index".into(), build_index.to_string()],
    )
}

fn invalidate_scene_inspector_after_mutation(
    state: &AppState,
    result: &RuntimeSceneMutationResult,
) {
    let impacted = collect_impacted_object_addresses(result);
    let session_key = current_scene_session_key(state);
    state
        .scene_module
        .inspector
        .invalidate_related(&impacted, session_key.as_deref());
}

fn invalidate_scene_children_after_mutation(
    state: &AppState,
    result: &RuntimeSceneMutationResult,
) {
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
    let session_key = current_scene_session_key(state);
    state
        .scene_module
        .children
        .invalidate_related(&impacted, session_key.as_deref());
}

fn collect_impacted_object_addresses(
    result: &RuntimeSceneMutationResult,
) -> Vec<String> {
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
    if matches!(
        result.operation,
        RuntimeSceneMutationOperation::CreateRoot
            | RuntimeSceneMutationOperation::LoadScene
    ) {
        stateful_scene_root_scope(result, &mut impacted);
    }
    impacted.sort();
    impacted.dedup();
    impacted
}

fn stateful_scene_root_scope(
    result: &RuntimeSceneMutationResult,
    impacted: &mut Vec<String>,
) {
    if let Some(parent) = result.parent_object_address.as_ref() {
        impacted.push(parent.clone());
    }
    if let Some(target) = result.target_object_address.as_ref() {
        impacted.push(target.clone());
    }
}