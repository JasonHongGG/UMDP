use super::{current_scene_session_key, log_scene_duration};
use crate::domain::analysis_models::{
    RuntimeSceneMutationOperation, RuntimeSceneMutationResult,
    RuntimeSceneTransformUpdate,
};
use crate::kernel::runtime::access::current_runtime_session;
use crate::kernel::runtime::session::RuntimeSession;
use crate::kernel::scene::query as native_scene;
use crate::services::analysis::runtime_session_service::{
    ensure_attached_session, execute_runtime_operation,
};
use crate::state::AppState;
use std::sync::Arc;
use std::time::Instant;
use tauri::AppHandle;

pub fn create_scene_child(
    _app: &AppHandle,
    state: &AppState,
    parent_object_address: &str,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        state,
        "create_scene_child",
        format!("parent_object_address={parent_object_address}"),
        |runtime_session| {
            native_scene::create_scene_child(runtime_session.as_ref(), parent_object_address, name)
        },
    )
}

pub fn create_scene_root(
    _app: &AppHandle,
    state: &AppState,
    scene_handle: i32,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        state,
        "create_scene_root",
        format!("scene_handle={scene_handle}"),
        |runtime_session| {
            native_scene::create_scene_root(runtime_session.as_ref(), scene_handle, name)
        },
    )
}

pub fn duplicate_scene_object(
    _app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        state,
        "duplicate_scene_object",
        format!("object_address={object_address}"),
        |runtime_session| {
            native_scene::duplicate_scene_object(runtime_session.as_ref(), object_address)
        },
    )
}

pub fn delete_scene_object(
    _app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        state,
        "delete_scene_object",
        format!("object_address={object_address}"),
        |runtime_session| {
            native_scene::delete_scene_object(runtime_session.as_ref(), object_address)
        },
    )
}

pub fn rename_scene_object(
    _app: &AppHandle,
    state: &AppState,
    object_address: &str,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        state,
        "rename_scene_object",
        format!("object_address={object_address}"),
        |runtime_session| {
            native_scene::rename_scene_object(runtime_session.as_ref(), object_address, name)
        },
    )
}

pub fn set_scene_object_tag(
    _app: &AppHandle,
    state: &AppState,
    object_address: &str,
    tag: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        state,
        "set_scene_object_tag",
        format!("object_address={object_address}"),
        |runtime_session| {
            native_scene::set_scene_object_tag(runtime_session.as_ref(), object_address, tag)
        },
    )
}

pub fn set_scene_object_layer(
    _app: &AppHandle,
    state: &AppState,
    object_address: &str,
    layer: i32,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        state,
        "set_scene_object_layer",
        format!("object_address={object_address} layer={layer}"),
        |runtime_session| {
            native_scene::set_scene_object_layer(runtime_session.as_ref(), object_address, layer)
        },
    )
}

pub fn set_scene_object_hide_flags(
    _app: &AppHandle,
    state: &AppState,
    object_address: &str,
    hide_flags: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        state,
        "set_scene_object_hide_flags",
        format!("object_address={object_address}"),
        |runtime_session| {
            native_scene::set_scene_object_hide_flags(runtime_session.as_ref(), object_address, hide_flags)
        },
    )
}

pub fn reparent_scene_object(
    _app: &AppHandle,
    state: &AppState,
    object_address: &str,
    parent_object_address: Option<&str>,
    _parent_path: Option<&str>,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        state,
        "reparent_scene_object",
        format!("object_address={object_address}"),
        |runtime_session| {
            native_scene::reparent_scene_object(
                runtime_session.as_ref(),
                object_address,
                parent_object_address,
            )
        },
    )
}

pub fn set_scene_object_active(
    _app: &AppHandle,
    state: &AppState,
    object_address: &str,
    active_self: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        state,
        "set_scene_object_active",
        format!("object_address={object_address} active_self={active_self}"),
        |runtime_session| {
            native_scene::set_scene_object_active(runtime_session.as_ref(), object_address, active_self)
        },
    )
}

pub fn set_scene_object_transform(
    _app: &AppHandle,
    state: &AppState,
    object_address: &str,
    transform_update: &RuntimeSceneTransformUpdate,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        state,
        "set_scene_object_transform",
        format!("object_address={object_address}"),
        |runtime_session| {
            native_scene::set_scene_object_transform(
                runtime_session.as_ref(),
                object_address,
                transform_update,
            )
        },
    )
}

pub fn set_scene_behaviour_enabled(
    _app: &AppHandle,
    state: &AppState,
    component_address: &str,
    enabled: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        state,
        "set_scene_behaviour_enabled",
        format!("component_address={component_address} enabled={enabled}"),
        |runtime_session| {
            native_scene::set_scene_behaviour_enabled(runtime_session.as_ref(), component_address, enabled)
        },
    )
}

pub fn create_scene_component(
    _app: &AppHandle,
    state: &AppState,
    object_address: &str,
    component_type_name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        state,
        "create_scene_component",
        format!("object_address={object_address} component_type_name={component_type_name}"),
        |runtime_session| {
            native_scene::create_scene_component(
                runtime_session.as_ref(),
                object_address,
                component_type_name,
            )
        },
    )
}

pub fn delete_scene_component(
    _app: &AppHandle,
    state: &AppState,
    component_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        state,
        "delete_scene_component",
        format!("component_address={component_address}"),
        |runtime_session| {
            native_scene::delete_scene_component(runtime_session.as_ref(), component_address)
        },
    )
}

pub fn load_scene_by_build_index(
    _app: &AppHandle,
    state: &AppState,
    build_index: i32,
) -> Result<RuntimeSceneMutationResult, String> {
    perform_scene_mutation(
        state,
        "load_scene_by_build_index",
        format!("build_index={build_index}"),
        |runtime_session| {
            native_scene::load_scene_by_build_index(runtime_session.as_ref(), build_index)
        },
    )
}

fn perform_scene_mutation<F>(
    state: &AppState,
    label: &str,
    details: String,
    loader: F,
) -> Result<RuntimeSceneMutationResult, String>
where
    F: FnOnce(&Arc<RuntimeSession>) -> Result<RuntimeSceneMutationResult, String>,
{
    let started_at = Instant::now();
    ensure_attached_session(state)?;

    let runtime_session = current_runtime_session(state)
        .ok_or_else(|| "Native runtime session is unavailable".to_string())?;
    if runtime_session.runtime_api().is_none() {
        return Err("Native runtime session is missing its runtime API".to_string());
    }

    let snapshot = execute_runtime_operation(state, || loader(&runtime_session))?;
    invalidate_scene_inspector_after_mutation(state, &snapshot);
    invalidate_scene_children_after_mutation(state, &snapshot);
    log_scene_duration(label, started_at, &details);
    Ok(snapshot)
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
