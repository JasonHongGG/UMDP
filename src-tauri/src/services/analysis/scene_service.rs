use crate::domain::analysis_models::{
    RuntimeQuaternionSnapshot, RuntimeSceneCatalogSnapshot, RuntimeSceneChildrenSnapshot,
    RuntimeSceneComponentSummary, RuntimeSceneDescriptor, RuntimeSceneNodeSummary,
    RuntimeSceneObjectInspectorSnapshot, RuntimeSceneTransformSnapshot, RuntimeVector3Snapshot,
    SceneWorkspaceState,
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
use tauri::AppHandle;

fn log_scene_duration(label: &str, started_at: Instant, details: &str) {
    eprintln!(
        "[perf][scene-service] {label} completed in {}ms {details}",
        started_at.elapsed().as_millis()
    );
}

#[derive(Debug, Deserialize)]
struct HelperSceneNodeSummary {
    object_address: String,
    transform_address: Option<String>,
    name: String,
    active_self: bool,
    child_count: usize,
    has_children: bool,
    component_count: usize,
    layer: Option<i32>,
    tag: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HelperSceneDescriptor {
    scene_handle: i32,
    name: String,
    is_loaded: bool,
    roots: Vec<HelperSceneNodeSummary>,
}

#[derive(Debug, Deserialize)]
struct HelperSceneCatalogResponse {
    generated_at: String,
    scenes: Vec<HelperSceneDescriptor>,
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
    local_position: Option<HelperVector3Snapshot>,
    local_rotation: Option<HelperQuaternionSnapshot>,
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
    object: HelperSceneNodeSummary,
    parent: Option<HelperSceneNodeSummary>,
    children: Vec<HelperSceneNodeSummary>,
    components: Vec<HelperSceneComponentSummary>,
    transform: Option<HelperSceneTransformSnapshot>,
}

pub fn start_scene_refresh(app: &AppHandle, state: &AppState) -> Result<SceneWorkspaceState, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;
    state.scene.set_refreshing();

    let snapshot = match execute_runtime_operation(state, || load_scene_catalog(app, state)) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            state.scene.set_error(error.clone());
            return Err(error);
        }
    };

    let workspace = state.scene.set_snapshot(snapshot.clone());
    log_scene_duration(
        "start_scene_refresh",
        started_at,
        &format!("scene_count={}", snapshot.scenes.len()),
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
        object: map_scene_node_summary(helper.object),
        parent: helper.parent.map(map_scene_node_summary),
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

fn map_scene_descriptor(value: HelperSceneDescriptor) -> RuntimeSceneDescriptor {
    RuntimeSceneDescriptor {
        scene_handle: value.scene_handle,
        name: value.name,
        is_loaded: value.is_loaded,
        roots: value.roots.into_iter().map(map_scene_node_summary).collect(),
    }
}

fn map_scene_node_summary(value: HelperSceneNodeSummary) -> RuntimeSceneNodeSummary {
    RuntimeSceneNodeSummary {
        object_address: value.object_address,
        transform_address: value.transform_address,
        name: value.name,
        active_self: value.active_self,
        child_count: value.child_count,
        has_children: value.has_children,
        component_count: value.component_count,
        layer: value.layer,
        tag: value.tag,
    }
}

fn map_scene_component(value: HelperSceneComponentSummary) -> RuntimeSceneComponentSummary {
    RuntimeSceneComponentSummary {
        component_address: value.component_address,
        type_name: value.type_name,
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
        local_position: value.local_position.map(map_vector3),
        local_rotation: value.local_rotation.map(map_quaternion),
        local_scale: value.local_scale.map(map_vector3),
        parent_transform_address: value.parent_transform_address,
        parent_object_address: value.parent_object_address,
        child_count: value.child_count,
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
            name: "Player".into(),
            active_self: true,
            child_count: 2,
            has_children: true,
            component_count: 3,
            layer: Some(0),
            tag: Some("Player".into()),
        });

        assert_eq!(mapped.object_address, "0x10");
        assert_eq!(mapped.transform_address.as_deref(), Some("0x20"));
        assert!(mapped.has_children);
        assert_eq!(mapped.component_count, 3);
    }

    #[test]
    fn scene_workspace_timestamp_stays_string_based() {
        let timestamp = current_timestamp();
        assert!(timestamp.parse::<u64>().is_ok());
    }
}