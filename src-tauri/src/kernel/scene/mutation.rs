use super::common::{current_scene_session_key, log_scene_duration};
use super::events::{
    emit_scene_children_task_state, emit_scene_object_components_task_state,
    emit_scene_object_header_task_state, emit_scene_workspace_state,
};
use crate::domain::analysis_models::{
    RuntimeSceneAffectedResource, RuntimeSceneMutationOperation, RuntimeSceneMutationResult,
    RuntimeSceneObjectChildrenTaskState, RuntimeSceneObjectComponentsTaskState,
    RuntimeSceneObjectHeaderTaskState, RuntimeSceneResourceKind, RuntimeSceneTransformUpdate,
};
use crate::domain::operation::OperationResult;
use crate::kernel::runtime::access::{ensure_runtime_session_ready, execute_runtime_operation};
use crate::kernel::runtime::session::RuntimeSession;
use crate::kernel::scene::query as native_scene;
use crate::kernel::workspace::access::ensure_attached_session;
use crate::state::AppState;
use std::sync::Arc;
use std::time::Instant;
use tauri::AppHandle;

struct SceneMutationInvalidation {
    children_tasks: Vec<RuntimeSceneObjectChildrenTaskState>,
    header_tasks: Vec<RuntimeSceneObjectHeaderTaskState>,
    components_tasks: Vec<RuntimeSceneObjectComponentsTaskState>,
}

pub fn create_scene_child(
    app: &AppHandle,
    state: &AppState,
    parent_object_address: &str,
    name: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    perform_scene_mutation(
        app,
        state,
        "create_scene_child",
        format!("parent_object_address={parent_object_address}"),
        |runtime_session| {
            native_scene::create_scene_child(runtime_session.as_ref(), parent_object_address, name)
        },
    )
}

pub fn create_scene_root(
    app: &AppHandle,
    state: &AppState,
    scene_handle: i32,
    name: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    perform_scene_mutation(
        app,
        state,
        "create_scene_root",
        format!("scene_handle={scene_handle}"),
        |runtime_session| native_scene::create_scene_root(runtime_session.as_ref(), scene_handle, name),
    )
}

pub fn duplicate_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    perform_scene_mutation(
        app,
        state,
        "duplicate_scene_object",
        format!("object_address={object_address}"),
        |runtime_session| native_scene::duplicate_scene_object(runtime_session.as_ref(), object_address),
    )
}

pub fn delete_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    perform_scene_mutation(
        app,
        state,
        "delete_scene_object",
        format!("object_address={object_address}"),
        |runtime_session| native_scene::delete_scene_object(runtime_session.as_ref(), object_address),
    )
}

pub fn rename_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    name: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    perform_scene_mutation(
        app,
        state,
        "rename_scene_object",
        format!("object_address={object_address}"),
        |runtime_session| native_scene::rename_scene_object(runtime_session.as_ref(), object_address, name),
    )
}

pub fn set_scene_object_tag(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    tag: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    perform_scene_mutation(
        app,
        state,
        "set_scene_object_tag",
        format!("object_address={object_address}"),
        |runtime_session| native_scene::set_scene_object_tag(runtime_session.as_ref(), object_address, tag),
    )
}

pub fn set_scene_object_layer(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    layer: i32,
) -> OperationResult<RuntimeSceneMutationResult> {
    perform_scene_mutation(
        app,
        state,
        "set_scene_object_layer",
        format!("object_address={object_address} layer={layer}"),
        |runtime_session| native_scene::set_scene_object_layer(runtime_session.as_ref(), object_address, layer),
    )
}

pub fn set_scene_object_hide_flags(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    hide_flags: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    perform_scene_mutation(
        app,
        state,
        "set_scene_object_hide_flags",
        format!("object_address={object_address}"),
        |runtime_session| {
            native_scene::set_scene_object_hide_flags(runtime_session.as_ref(), object_address, hide_flags)
        },
    )
}

pub fn reparent_scene_object(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    parent_object_address: Option<&str>,
    _parent_path: Option<&str>,
) -> OperationResult<RuntimeSceneMutationResult> {
    perform_scene_mutation(
        app,
        state,
        "reparent_scene_object",
        format!("object_address={object_address}"),
        |runtime_session| {
            native_scene::reparent_scene_object(runtime_session.as_ref(), object_address, parent_object_address)
        },
    )
}

pub fn set_scene_object_active(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    active_self: bool,
) -> OperationResult<RuntimeSceneMutationResult> {
    perform_scene_mutation(
        app,
        state,
        "set_scene_object_active",
        format!("object_address={object_address} active_self={active_self}"),
        |runtime_session| native_scene::set_scene_object_active(runtime_session.as_ref(), object_address, active_self),
    )
}

pub fn set_scene_object_transform(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    transform_update: &RuntimeSceneTransformUpdate,
) -> OperationResult<RuntimeSceneMutationResult> {
    perform_scene_mutation(
        app,
        state,
        "set_scene_object_transform",
        format!("object_address={object_address}"),
        |runtime_session| {
            native_scene::set_scene_object_transform(runtime_session.as_ref(), object_address, transform_update)
        },
    )
}

pub fn set_scene_behaviour_enabled(
    app: &AppHandle,
    state: &AppState,
    component_address: &str,
    enabled: bool,
) -> OperationResult<RuntimeSceneMutationResult> {
    perform_scene_mutation(
        app,
        state,
        "set_scene_behaviour_enabled",
        format!("component_address={component_address} enabled={enabled}"),
        |runtime_session| {
            native_scene::set_scene_behaviour_enabled(runtime_session.as_ref(), component_address, enabled)
        },
    )
}

pub fn create_scene_component(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    component_type_name: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    perform_scene_mutation(
        app,
        state,
        "create_scene_component",
        format!("object_address={object_address} component_type_name={component_type_name}"),
        |runtime_session| {
            native_scene::create_scene_component(runtime_session.as_ref(), object_address, component_type_name)
        },
    )
}

pub fn delete_scene_component(
    app: &AppHandle,
    state: &AppState,
    component_address: &str,
) -> OperationResult<RuntimeSceneMutationResult> {
    perform_scene_mutation(
        app,
        state,
        "delete_scene_component",
        format!("component_address={component_address}"),
        |runtime_session| native_scene::delete_scene_component(runtime_session.as_ref(), component_address),
    )
}

pub fn load_scene_by_build_index(
    app: &AppHandle,
    state: &AppState,
    build_index: i32,
) -> OperationResult<RuntimeSceneMutationResult> {
    perform_scene_mutation(
        app,
        state,
        "load_scene_by_build_index",
        format!("build_index={build_index}"),
        |runtime_session| native_scene::load_scene_by_build_index(runtime_session.as_ref(), build_index),
    )
}

fn perform_scene_mutation<F>(
    app: &AppHandle,
    state: &AppState,
    label: &str,
    details: String,
    loader: F,
) -> OperationResult<RuntimeSceneMutationResult>
where
    F: FnOnce(&Arc<RuntimeSession>) -> Result<RuntimeSceneMutationResult, String>,
{
    let started_at = Instant::now();
    ensure_attached_session(state).map(|_| ())?;

    let runtime_session = ensure_runtime_session_ready(state)?;
    let mutation_result: OperationResult<_> = state.workspace().lifecycle().with_scene_mutation_lock(|| {
        let mut snapshot = execute_runtime_operation(state, || loader(&runtime_session))?;
        let session_key = current_scene_session_key(state);
        let impacted_addresses = collect_impacted_object_addresses(&snapshot);
        let invalidation = invalidate_scene_after_mutation(
            state,
            &snapshot,
            &impacted_addresses,
            session_key.as_deref(),
        );
        let session_key = current_scene_session_key(state);
        let workspace = state
            .scene()
            .workspace()
            .bump_mutation_epoch(session_key.as_deref());
        snapshot.affected_resources = build_affected_resources(&snapshot, &impacted_addresses);
        Ok((snapshot, workspace, invalidation))
    });
    let (snapshot, workspace, invalidation) = mutation_result?;
    emit_scene_workspace_state(app, &workspace);
    for task_state in invalidation.children_tasks {
        emit_scene_children_task_state(app, &task_state);
    }
    for task_state in invalidation.header_tasks {
        emit_scene_object_header_task_state(app, &task_state);
    }
    for task_state in invalidation.components_tasks {
        emit_scene_object_components_task_state(app, &task_state);
    }
    log_scene_duration(label, started_at, &details);
    Ok(snapshot)
}

fn invalidate_scene_after_mutation(
    state: &AppState,
    result: &RuntimeSceneMutationResult,
    impacted_addresses: &[String],
    session_key: Option<&str>,
) -> SceneMutationInvalidation {
    let header_tasks = state
        .scene()
        .header()
        .invalidate_related(impacted_addresses, session_key);
    let components_tasks = state
        .scene()
        .components()
        .invalidate_related(impacted_addresses, session_key);
    let children_tasks = invalidate_scene_children_after_mutation(
        state,
        result,
        impacted_addresses,
        session_key,
    );

    SceneMutationInvalidation {
        children_tasks,
        header_tasks,
        components_tasks,
    }
}

fn invalidate_scene_children_after_mutation(
    state: &AppState,
    result: &RuntimeSceneMutationResult,
    impacted_addresses: &[String],
    session_key: Option<&str>,
) -> Vec<RuntimeSceneObjectChildrenTaskState> {
    if mutation_impacts_children(result) {
        return state
            .scene()
            .children()
            .invalidate_related(impacted_addresses, session_key);
    }

    Vec::new()
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
    if matches!(
        result.operation,
        RuntimeSceneMutationOperation::CreateRoot | RuntimeSceneMutationOperation::LoadScene
    ) {
        stateful_scene_root_scope(result, &mut impacted);
    }
    impacted.sort();
    impacted.dedup();
    impacted
}

fn mutation_impacts_children(result: &RuntimeSceneMutationResult) -> bool {
    !matches!(
        result.operation,
        RuntimeSceneMutationOperation::SetActive
            | RuntimeSceneMutationOperation::SetTransform
            | RuntimeSceneMutationOperation::SetTag
            | RuntimeSceneMutationOperation::SetLayer
            | RuntimeSceneMutationOperation::SetHideFlags
            | RuntimeSceneMutationOperation::SetBehaviourEnabled
            | RuntimeSceneMutationOperation::AddComponent
            | RuntimeSceneMutationOperation::RemoveComponent
    )
}

fn build_affected_resources(
    result: &RuntimeSceneMutationResult,
    impacted_addresses: &[String],
) -> Vec<RuntimeSceneAffectedResource> {
    let mut resources = Vec::new();
    push_affected_resource(&mut resources, RuntimeSceneResourceKind::Catalog, None);

    if impacted_addresses.is_empty() {
        push_affected_resource(
            &mut resources,
            RuntimeSceneResourceKind::SceneObjectHeader,
            None,
        );
        push_affected_resource(
            &mut resources,
            RuntimeSceneResourceKind::SceneObjectComponents,
            None,
        );
        if mutation_impacts_children(result) {
            push_affected_resource(&mut resources, RuntimeSceneResourceKind::Children, None);
        }
        return resources;
    }

    for object_address in impacted_addresses {
        push_affected_resource(
            &mut resources,
            RuntimeSceneResourceKind::SceneObjectHeader,
            Some(object_address.as_str()),
        );
        push_affected_resource(
            &mut resources,
            RuntimeSceneResourceKind::SceneObjectComponents,
            Some(object_address.as_str()),
        );
        if mutation_impacts_children(result) {
            push_affected_resource(
                &mut resources,
                RuntimeSceneResourceKind::Children,
                Some(object_address.as_str()),
            );
        }
    }

    resources
}

fn push_affected_resource(
    resources: &mut Vec<RuntimeSceneAffectedResource>,
    resource_kind: RuntimeSceneResourceKind,
    object_address: Option<&str>,
) {
    if resources.iter().any(|resource| {
        resource.resource_kind == resource_kind
            && resource.object_address.as_deref() == object_address
    }) {
        return;
    }

    resources.push(RuntimeSceneAffectedResource {
        resource_kind,
        object_address: object_address.map(str::to_owned),
    });
}

fn stateful_scene_root_scope(result: &RuntimeSceneMutationResult, impacted: &mut Vec<String>) {
    if let Some(parent) = result.parent_object_address.as_ref() {
        impacted.push(parent.clone());
    }
    if let Some(target) = result.target_object_address.as_ref() {
        impacted.push(target.clone());
    }
}