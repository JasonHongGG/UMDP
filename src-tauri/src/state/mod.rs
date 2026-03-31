pub mod analysis_store;
pub mod bridge_client;
pub mod scene_store;
pub mod workspace_store;

pub use analysis_store::AnalysisState;
pub use bridge_client::BridgeClientState;
pub use scene_store::{
    SceneChildrenState, SceneInspectorState, SceneState,
};
pub use workspace_store::WorkspaceState;
#[derive(Default)]
pub struct WorkspaceSessionState {
    pub analysis: AnalysisState,
    pub lifecycle: WorkspaceState,
}

#[derive(Default)]
pub struct RuntimeInfrastructureState {
    pub bridge: BridgeClientState,
}

#[derive(Default)]
pub struct SceneModuleState {
    pub workspace: SceneState,
    pub children: SceneChildrenState,
    pub inspector: SceneInspectorState,
}

#[derive(Default)]
pub struct AppState {
    pub workspace_session: WorkspaceSessionState,
    pub runtime_infra: RuntimeInfrastructureState,
    pub scene_module: SceneModuleState,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::bridge_client::should_retry_runtime_request;
    use crate::domain::analysis_models::{
        ProcessSession, RuntimeFlavor, RuntimeSceneChildrenTaskStatus,
        RuntimeSceneInspectorTaskStatus,
        RuntimeSceneComponentSummary, RuntimeSceneKind, SceneRefreshStatus,
        RuntimeSceneNodeSummary, RuntimeSceneObjectInspectorHeaderSnapshot,
    };
    use crate::domain::workspace::{RuntimeSessionStatus, WorkspaceLifecycleStatus};

    fn sample_session() -> ProcessSession {
        ProcessSession {
            pid: 777,
            process_name: "Unity.exe".to_string(),
            exe_path: "C:/Game/Unity.exe".to_string(),
            data_dir: Some("C:/Game/Unity_Data".to_string()),
            managed_dir: Some("C:/Game/Unity_Data/Managed".to_string()),
            runtime: RuntimeFlavor::Mono,
        }
    }

    fn sample_node(object_address: &str) -> RuntimeSceneNodeSummary {
        RuntimeSceneNodeSummary {
            object_address: object_address.to_string(),
            transform_address: None,
            parent_object_address: None,
            name: "Player".to_string(),
            active_self: true,
            is_static: Some(false),
            child_count: 0,
            has_children: false,
            component_count: Some(1),
            layer: Some(0),
            tag: Some("Player".to_string()),
            hide_flags: Some("None".to_string()),
            path: Some("SampleScene/Player".to_string()),
        }
    }

    fn sample_header(object_address: &str) -> RuntimeSceneObjectInspectorHeaderSnapshot {
        RuntimeSceneObjectInspectorHeaderSnapshot {
            generated_at: "1".to_string(),
            scene_handle: Some(1),
            scene_name: Some("SampleScene".to_string()),
            scene_kind: Some(RuntimeSceneKind::Loaded),
            object: sample_node(object_address),
            parent: None,
            hierarchy_path: vec![],
            transform: None,
        }
    }

    #[test]
    fn workspace_marks_recovering_after_bridge_error_when_attached() {
        let workspace = WorkspaceState::default();
        workspace.set_attached_without_snapshot(sample_session());
        workspace.set_bridge_error("bridge dropped");

        let current = workspace.current();
        assert_eq!(current.resource_revision, 2);
        assert_eq!(current.status, WorkspaceLifecycleStatus::Recovering);
        assert_eq!(current.runtime_session.status, RuntimeSessionStatus::Recovering);
        assert!(!current.runtime_session.bridge_connected);
        assert_eq!(current.runtime_session.last_error.as_deref(), Some("bridge dropped"));
    }

    #[test]
    fn workspace_marks_bridge_connected_and_heartbeats() {
        let workspace = WorkspaceState::default();
        workspace.set_attached_without_snapshot(sample_session());

        let connected = workspace.mark_runtime_bridge_connected();
        assert!(connected.bridge_connected);
        assert!(connected.last_heartbeat_at.is_some());
        assert_eq!(connected.session_key.as_deref(), Some("777:Unity.exe:Mono"));
        assert_eq!(workspace.current().resource_revision, 2);
    }

    #[test]
    fn runtime_request_retry_only_triggers_for_transport_failures() {
        assert!(should_retry_runtime_request("Failed to read bridge response payload"));
        assert!(should_retry_runtime_request("Persistent bridge session closed unexpectedly"));
        assert!(!should_retry_runtime_request("runtime exception"));
        assert!(!should_retry_runtime_request("method invocation failed"));
    }

    #[test]
    fn scene_inspector_caches_completed_results() {
        let inspector = SceneInspectorState::default();
        let started = inspector.start_task("0x10".to_string(), Some("session-1".to_string()));
        assert!(!started.use_cached);
        assert_eq!(started.state.resource_revision, 1);

        inspector.apply_header(
            started.state.task_id,
            started.state.mutation_epoch,
            Some("session-1"),
            sample_header("0x10"),
        );
        inspector.apply_children(
            started.state.task_id,
            started.state.mutation_epoch,
            Some("session-1"),
            vec![sample_node("0x11")],
            1,
            None,
        );
        inspector.apply_components(
            started.state.task_id,
            started.state.mutation_epoch,
            Some("session-1"),
            vec![RuntimeSceneComponentSummary {
                component_address: "0x20".to_string(),
                type_name: "UnityEngine.Transform".to_string(),
                is_behaviour: false,
                behaviour_enabled: None,
            }],
            1,
            None,
        );
        inspector.complete(started.state.task_id, started.state.mutation_epoch, Some("session-1"));

        let cached = inspector.start_task("0x10".to_string(), Some("session-1".to_string()));
        assert!(cached.use_cached);
        assert!(cached.state.resource_revision > started.state.resource_revision);
        assert_eq!(cached.state.status, RuntimeSceneInspectorTaskStatus::Ready);
        assert_eq!(cached.state.children_loaded_count, 1);
        assert_eq!(cached.state.components_loaded_count, 1);
        assert_eq!(cached.state.session_key.as_deref(), Some("session-1"));
    }

    #[test]
    fn scene_inspector_invalidation_marks_current_task_stale() {
        let inspector = SceneInspectorState::default();
        let started = inspector.start_task("0x10".to_string(), Some("session-1".to_string()));

        inspector.invalidate_related(&["0x10".to_string()], Some("session-1"));

        let current = inspector.current(Some("session-1")).expect("expected current inspector task");
        assert_eq!(current.task_id, started.state.task_id);
        assert!(current.is_stale);
        assert_eq!(current.status, RuntimeSceneInspectorTaskStatus::Cancelled);
    }

    #[test]
    fn scene_children_cache_completed_results() {
        let children_state = SceneChildrenState::default();
        let started = children_state.start_task("0x10".to_string(), Some("session-1".to_string()));
        assert!(started.should_spawn);
        assert_eq!(started.state.resource_revision, 1);

        children_state.apply_children(
            "0x10",
            started.state.task_id,
            started.state.mutation_epoch,
            Some("session-1"),
            vec![sample_node("0x11")],
            1,
            None,
        );
        children_state.complete("0x10", started.state.task_id, started.state.mutation_epoch, Some("session-1"));

        let cached = children_state.start_task("0x10".to_string(), Some("session-1".to_string()));
        assert!(!cached.should_spawn);
        assert!(cached.state.resource_revision > started.state.resource_revision);
        assert_eq!(cached.state.status, RuntimeSceneChildrenTaskStatus::Ready);
        assert_eq!(cached.state.loaded_count, 1);
        assert_eq!(cached.state.total_count, 1);
        assert_eq!(cached.state.session_key.as_deref(), Some("session-1"));
    }

    #[test]
    fn scene_children_invalidation_marks_running_tasks_stale() {
        let children_state = SceneChildrenState::default();
        let started = children_state.start_task("0x10".to_string(), Some("session-1".to_string()));

        children_state.invalidate_related(&["0x10".to_string()], Some("session-1"));

        let current = children_state
            .current("0x10", Some("session-1"))
            .expect("expected current children task");
        assert_eq!(current.task_id, started.state.task_id);
        assert!(current.is_stale);
        assert_eq!(current.status, RuntimeSceneChildrenTaskStatus::Cancelled);
    }

    #[test]
    fn scene_children_rejects_stale_session_updates() {
        let children_state = SceneChildrenState::default();
        let started = children_state.start_task("0x10".to_string(), Some("session-1".to_string()));

        let restarted = children_state.start_task("0x10".to_string(), Some("session-2".to_string()));
        assert_ne!(restarted.state.session_key.as_deref(), started.state.session_key.as_deref());

        let stale = children_state.apply_children(
            "0x10",
            started.state.task_id,
            started.state.mutation_epoch,
            Some("session-1"),
            vec![sample_node("0x11")],
            1,
            None,
        );

        assert!(stale.is_none());
        let current = children_state
            .current("0x10", Some("session-2"))
            .expect("expected current children task for replacement session");
        assert_eq!(current.task_id, restarted.state.task_id);
        assert_eq!(current.session_key.as_deref(), Some("session-2"));
    }

    #[test]
    fn scene_workspace_current_for_hides_previous_session_snapshot() {
        let workspace = SceneState::default();
        workspace.set_refreshing(Some("session-1".to_string()));

        let current = workspace.current_for(Some("session-2"));
        assert_eq!(current.resource_revision, 0);
        assert_eq!(current.session_key.as_deref(), Some("session-2"));
        assert_eq!(current.refresh_status, SceneRefreshStatus::Idle);
        assert!(current.snapshot.is_none());
    }

    #[test]
    fn scene_workspace_resource_revision_increments_per_update() {
        let workspace = SceneState::default();
        let refreshing = workspace.set_refreshing(Some("session-1".to_string()));
        assert_eq!(refreshing.resource_revision, 1);

        let snapshot = workspace.set_snapshot(
            Some("session-1"),
            crate::domain::analysis_models::RuntimeSceneCatalogSnapshot {
                generated_at: "2026-03-30T00:00:00.000Z".to_string(),
                scenes: vec![],
                build_settings_scenes: vec![],
            },
        );
        assert_eq!(snapshot.resource_revision, 2);

        let errored = workspace.set_error(Some("session-1"), "refresh failed");
        assert_eq!(errored.resource_revision, 3);
    }
}
