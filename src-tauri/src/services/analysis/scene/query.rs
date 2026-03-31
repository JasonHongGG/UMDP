use super::events::emit_scene_workspace_state;
use super::mapping::{
    map_hierarchy_path_entry, map_scene_build_settings_entry,
    map_scene_component, map_scene_descriptor, map_scene_kind,
    map_scene_node_summary, map_transform_snapshot,
    HelperSceneCatalogResponse, HelperSceneChildrenPageResponse,
    HelperSceneChildrenResponse, HelperSceneComponentsPageResponse,
    HelperSceneInspectorHeaderResponse, HelperSceneInspectorResponse,
};
use super::{current_scene_session_key, log_scene_duration};
use crate::domain::analysis_models::{
    RuntimeSceneCatalogSnapshot, RuntimeSceneChildrenPageSnapshot,
    RuntimeSceneChildrenSnapshot, RuntimeSceneComponentsPageSnapshot,
    RuntimeSceneObjectInspectorHeaderSnapshot,
    RuntimeSceneObjectInspectorSnapshot, SceneWorkspaceState,
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

pub fn start_scene_refresh(
    app: &AppHandle,
    state: &AppState,
) -> Result<SceneWorkspaceState, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;
    let session_key = current_scene_session_key(state);
    let workspace = state.scene_module.workspace.set_refreshing(session_key.clone());
    emit_scene_workspace_state(app, &workspace);

    let snapshot = match execute_runtime_operation(state, || load_scene_catalog(app, state)) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            let workspace = state
                .scene_module
                .workspace
                .set_error(session_key.as_deref(), error.clone());
            emit_scene_workspace_state(app, &workspace);
            return Err(error);
        }
    };

    let scene_count = snapshot.scenes.len();
    let root_count = snapshot
        .scenes
        .iter()
        .map(|scene| scene.roots.len())
        .sum::<usize>();
    let workspace = state
        .scene_module
        .workspace
        .set_snapshot(session_key.as_deref(), snapshot);
    emit_scene_workspace_state(app, &workspace);
    if current_scene_session_key(state) == session_key {
        state.scene_module.children.reset();
        state.scene_module.inspector.reset();
    }
    log_scene_duration(
        "start_scene_refresh",
        started_at,
        &format!("scene_count={scene_count} root_count={root_count}"),
    );
    Ok(workspace)
}

pub fn get_scene_object_children(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneChildrenSnapshot, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;

    let snapshot = execute_runtime_operation(state, || {
        load_scene_children(app, state, object_address)
    })?;
    log_scene_duration(
        "get_scene_object_children",
        started_at,
        &format!(
            "object_address={object_address} child_count={}",
            snapshot.children.len()
        ),
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

    let snapshot = execute_runtime_operation(state, || {
        load_scene_inspector(app, state, object_address)
    })?;
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

pub(super) fn load_scene_catalog(
    app: &AppHandle,
    state: &AppState,
) -> Result<RuntimeSceneCatalogSnapshot, String> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let helper: HelperSceneCatalogResponse = execute_json_with(
        &AppBridgeTransport::new(state),
        app,
        BridgeRequest {
            operation: BridgeOperation::SceneCatalogLoad,
            executable_name: "UnityMonoBridge.exe",
            args: vec![
                "--operation".into(),
                "scene-catalog".into(),
                "--pid".into(),
                attached.pid.to_string(),
            ],
        },
    )?;

    let snapshot = RuntimeSceneCatalogSnapshot {
        generated_at: helper.generated_at,
        scenes: helper.scenes.into_iter().map(map_scene_descriptor).collect(),
        build_settings_scenes: helper
            .build_settings_scenes
            .into_iter()
            .map(map_scene_build_settings_entry)
            .collect(),
    };
    log_scene_duration(
        "load_scene_catalog",
        started_at,
        &format!("pid={} scene_count={}", attached.pid, snapshot.scenes.len()),
    );
    Ok(snapshot)
}

pub(super) fn load_scene_children(
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
        &format!(
            "pid={} object_address={} child_count={}",
            attached.pid,
            object_address,
            snapshot.children.len()
        ),
    );
    Ok(snapshot)
}

pub(super) fn load_scene_children_page(
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

pub(super) fn load_scene_inspector(
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
        hierarchy_path: helper
            .hierarchy_path
            .into_iter()
            .map(map_hierarchy_path_entry)
            .collect(),
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

pub(super) fn load_scene_inspector_header(
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
        hierarchy_path: helper
            .hierarchy_path
            .into_iter()
            .map(map_hierarchy_path_entry)
            .collect(),
        transform: helper.transform.map(map_transform_snapshot),
    };
    log_scene_duration(
        "load_scene_inspector_header",
        started_at,
        &format!("pid={} object_address={object_address}", attached.pid),
    );
    Ok(snapshot)
}

pub(super) fn load_scene_inspector_children_page(
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

pub(super) fn load_scene_inspector_components_page(
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