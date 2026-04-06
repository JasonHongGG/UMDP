pub mod runtime_kernel_store;
pub mod scene_store;
pub mod workspace_store;

pub use runtime_kernel_store::RuntimeKernelState;
pub use scene_store::{
    SceneChildrenState, SceneMousePickerState, SceneObjectComponentsState,
    SceneObjectHeaderState, SceneState,
};
pub use workspace_store::WorkspaceState;

#[derive(Default)]
pub struct WorkspaceSessionState {
    lifecycle: WorkspaceState,
}

impl WorkspaceSessionState {
    pub fn lifecycle(&self) -> &WorkspaceState {
        &self.lifecycle
    }
}

#[derive(Default)]
pub struct RuntimeKernelModuleState {
    runtime: RuntimeKernelState,
}

impl RuntimeKernelModuleState {
    pub fn session(&self) -> &RuntimeKernelState {
        &self.runtime
    }
}

#[derive(Default)]
pub struct SceneModuleState {
    workspace: SceneState,
    children: SceneChildrenState,
    header: SceneObjectHeaderState,
    components: SceneObjectComponentsState,
    picker: SceneMousePickerState,
}

impl SceneModuleState {
    pub fn workspace(&self) -> &SceneState {
        &self.workspace
    }

    pub fn children(&self) -> &SceneChildrenState {
        &self.children
    }

    pub fn header(&self) -> &SceneObjectHeaderState {
        &self.header
    }

    pub fn components(&self) -> &SceneObjectComponentsState {
        &self.components
    }

    pub fn picker(&self) -> &SceneMousePickerState {
        &self.picker
    }
}

#[derive(Default)]
pub struct AppState {
    workspace_session: WorkspaceSessionState,
    runtime_kernel: RuntimeKernelModuleState,
    scene_module: SceneModuleState,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn workspace(&self) -> &WorkspaceSessionState {
        &self.workspace_session
    }

    pub fn runtime_kernel(&self) -> &RuntimeKernelModuleState {
        &self.runtime_kernel
    }

    pub fn scene(&self) -> &SceneModuleState {
        &self.scene_module
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::analysis_models::{
        ProcessSession, ProcessWindowCandidate, RuntimeFlavor, RuntimeSceneChildrenTaskStatus,
        RuntimeSceneComponentSummary, RuntimeSceneKind,
        RuntimeSceneMousePickerStatus, RuntimeSceneMouseTargetHit, RuntimeSceneNodeSummary,
        RuntimeSceneObjectComponentsTaskStatus, RuntimeSceneObjectHeaderTaskStatus,
        RuntimeSceneObjectInspectorHeaderSnapshot, RuntimeScreenPoint, RuntimeScreenRect,
        SceneRefreshStatus,
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

    fn sample_window() -> ProcessWindowCandidate {
        ProcessWindowCandidate {
            pid: 777,
            window_handle: "0x100".to_string(),
            title: "Game".to_string(),
            class_name: "UnityWndClass".to_string(),
            window_rect: RuntimeScreenRect {
                left: 0,
                top: 0,
                right: 1280,
                bottom: 720,
                width: 1280,
                height: 720,
            },
            client_rect: RuntimeScreenRect {
                left: 8,
                top: 30,
                right: 1272,
                bottom: 710,
                width: 1264,
                height: 680,
            },
            is_visible: true,
            is_minimized: false,
            is_foreground: true,
        }
    }

    fn sample_hit(object_address: &str, object_name: &str, observed_at: &str) -> RuntimeSceneMouseTargetHit {
        RuntimeSceneMouseTargetHit {
            observed_at: observed_at.to_string(),
            object_address: object_address.to_string(),
            object_name: object_name.to_string(),
            transform_address: Some(format!("{object_address}-transform")),
            scene_handle: Some(1),
            scene_name: Some("SampleScene".to_string()),
            scene_kind: Some(RuntimeSceneKind::Loaded),
            hierarchy_path: vec![],
            distance: Some(3.5),
            screen_position: RuntimeScreenPoint { x: 512, y: 320 },
            client_position: RuntimeScreenPoint { x: 500, y: 290 },
        }
    }

    #[test]
    fn workspace_marks_runtime_error_after_runtime_drop_when_attached() {
        let workspace = WorkspaceState::default();
        workspace.set_attached_without_snapshot(sample_session());
        workspace.set_runtime_error("runtime session dropped");

        let current = workspace.current();
        assert_eq!(current.resource_revision, 2);
        assert_eq!(current.status, WorkspaceLifecycleStatus::RuntimeError);
        assert_eq!(current.runtime_session.status, RuntimeSessionStatus::Error);
        assert!(!current.runtime_session.connected);
        assert_eq!(
            current.runtime_session.last_error.as_deref(),
            Some("runtime session dropped")
        );
    }

    #[test]
    fn workspace_touch_promotes_runtime_session_and_heartbeats() {
        let workspace = WorkspaceState::default();
        workspace.set_attached_without_snapshot(sample_session());
        workspace.set_ready(Some(sample_session()), false);

        let connected = workspace.record_runtime_heartbeat();
        assert!(connected.connected);
        assert!(connected.last_heartbeat_at.is_some());
        assert_eq!(connected.session_key.as_deref(), Some("777:Unity.exe:Mono"));
        assert_eq!(workspace.current().resource_revision, 3);
    }

    #[test]
    fn scene_object_header_caches_completed_results() {
        let header_state = SceneObjectHeaderState::default();
        let started = header_state.start_task("0x10".to_string(), Some("session-1".to_string()));
        assert!(!started.use_cached);
        assert_eq!(started.state.resource_revision, 1);

        header_state.apply_header(
            "0x10",
            started.state.task_id,
            started.state.mutation_epoch,
            Some("session-1"),
            sample_header("0x10"),
        );
        let cached = header_state.start_task("0x10".to_string(), Some("session-1".to_string()));
        assert!(cached.use_cached);
        assert!(cached.state.resource_revision > started.state.resource_revision);
        assert_eq!(cached.state.status, RuntimeSceneObjectHeaderTaskStatus::Ready);
        assert!(cached.state.header.is_some());
        assert_eq!(cached.state.session_key.as_deref(), Some("session-1"));
    }

    #[test]
    fn scene_object_header_invalidation_marks_current_task_stale() {
        let header_state = SceneObjectHeaderState::default();
        let started = header_state.start_task("0x10".to_string(), Some("session-1".to_string()));

        header_state.invalidate_related(&["0x10".to_string()], Some("session-1"));

        let current = header_state
            .current("0x10", Some("session-1"))
            .expect("expected current header task");
        assert_eq!(current.task_id, started.state.task_id);
        assert!(current.is_stale);
        assert_eq!(current.status, RuntimeSceneObjectHeaderTaskStatus::Cancelled);
    }

    #[test]
    fn scene_object_components_cache_completed_results() {
        let components_state = SceneObjectComponentsState::default();
        let started = components_state.start_task("0x10".to_string(), Some("session-1".to_string()));
        assert!(started.should_spawn);
        assert_eq!(started.state.resource_revision, 1);

        components_state.apply_components(
            "0x10",
            started.state.task_id,
            started.state.mutation_epoch,
            Some("session-1"),
            0,
            vec![RuntimeSceneComponentSummary {
                component_address: "0x20".to_string(),
                type_name: "UnityEngine.Transform".to_string(),
                is_behaviour: false,
                behaviour_enabled: None,
            }],
            1,
            None,
        );
        components_state.complete(
            "0x10",
            started.state.task_id,
            started.state.mutation_epoch,
            Some("session-1"),
        );

        let cached = components_state.start_task("0x10".to_string(), Some("session-1".to_string()));
        assert!(!cached.should_spawn);
        assert!(cached.state.resource_revision > started.state.resource_revision);
        assert_eq!(cached.state.status, RuntimeSceneObjectComponentsTaskStatus::Ready);
        assert_eq!(cached.state.loaded_count, 1);
        assert_eq!(cached.state.total_count, 1);
        assert_eq!(cached.state.session_key.as_deref(), Some("session-1"));
    }

    #[test]
    fn scene_object_components_invalidation_marks_current_task_stale() {
        let components_state = SceneObjectComponentsState::default();
        let started = components_state.start_task("0x10".to_string(), Some("session-1".to_string()));

        components_state.invalidate_related(&["0x10".to_string()], Some("session-1"));

        let current = components_state
            .current("0x10", Some("session-1"))
            .expect("expected current components task");
        assert_eq!(current.task_id, started.state.task_id);
        assert!(current.is_stale);
        assert_eq!(current.status, RuntimeSceneObjectComponentsTaskStatus::Cancelled);
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
            0,
            vec![sample_node("0x11")],
            1,
            None,
        );
        children_state.complete(
            "0x10",
            started.state.task_id,
            started.state.mutation_epoch,
            Some("session-1"),
        );

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

        let restarted =
            children_state.start_task("0x10".to_string(), Some("session-2".to_string()));
        assert_ne!(
            restarted.state.session_key.as_deref(),
            started.state.session_key.as_deref()
        );

        let stale = children_state.apply_children(
            "0x10",
            started.state.task_id,
            started.state.mutation_epoch,
            Some("session-1"),
            0,
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

    #[test]
    fn scene_mouse_picker_observation_refreshes_recent_hits_without_stopping_worker() {
        let picker = SceneMousePickerState::default();
        picker.set_target_window(Some("session-1".to_string()), Some(sample_window()));

        let started = picker
            .start(Some("session-1".to_string()))
            .expect("expected picker to start");
        let worker_id = started.worker_id.expect("expected worker id");

        picker.apply_observation(
            worker_id,
            Some("session-1"),
            sample_window(),
            RuntimeScreenPoint { x: 512, y: 320 },
            Some(RuntimeScreenPoint { x: 500, y: 290 }),
            Some(sample_hit("0x10", "Player", "hover-ts")),
            "Click once to open Player in the Scene inspector.".to_string(),
        );

        let observed = picker
            .apply_observation(
                worker_id,
                Some("session-1"),
                sample_window(),
                RuntimeScreenPoint { x: 512, y: 320 },
                Some(RuntimeScreenPoint { x: 500, y: 290 }),
                Some(sample_hit("0x10", "Player", "hover-ts")),
                "Observing Player. Recent refreshes automatically. Press Escape to stop.".to_string(),
            )
            .expect("expected observed picker snapshot");

        assert!(observed.is_running);
        assert_eq!(observed.status, RuntimeSceneMousePickerStatus::Observing);
        assert_eq!(observed.hover_hit.as_ref().map(|hit| hit.object_address.as_str()), Some("0x10"));
        assert_eq!(observed.recent_hits.len(), 1);
        assert_eq!(observed.recent_hits[0].object_address, "0x10");
        assert!(picker.finish_worker(worker_id, Some("session-1")).is_some());
    }

    #[test]
    fn scene_mouse_picker_recent_hits_deduplicate_and_cap_at_five() {
        let picker = SceneMousePickerState::default();
        picker.set_target_window(Some("session-1".to_string()), Some(sample_window()));

        let started = picker
            .start(Some("session-1".to_string()))
            .expect("expected picker to start");
        let worker_id = started.worker_id.expect("expected worker id");
        for index in 0..6 {
            let object_address = format!("0x{index}");
            let object_name = format!("Object{index}");
            picker.apply_observation(
                worker_id,
                Some("session-1"),
                sample_window(),
                RuntimeScreenPoint { x: 600 + index, y: 360 },
                Some(RuntimeScreenPoint { x: 580 + index, y: 330 }),
                Some(sample_hit(&object_address, &object_name, "hover-ts")),
                format!("Observing {object_name}. Recent refreshes automatically. Press Escape to stop."),
            );
        }

        let deduplicated = picker
            .apply_observation(
                worker_id,
                Some("session-1"),
                sample_window(),
                RuntimeScreenPoint { x: 700, y: 420 },
                Some(RuntimeScreenPoint { x: 680, y: 390 }),
                Some({
                    let mut hit = sample_hit("0x2", "Object2", "hover-refresh");
                    hit.transform_address = Some("0x2-alt-transform".to_string());
                    hit
                }),
                "Observing Object2. Recent refreshes automatically. Press Escape to stop.".to_string(),
            )
            .expect("expected refreshed recent picker snapshot");

        assert_eq!(deduplicated.recent_hits.len(), 5);
        assert_eq!(deduplicated.recent_hits[0].object_address, "0x2");
        assert_eq!(deduplicated.recent_hits.iter().filter(|hit| hit.object_address == "0x2").count(), 1);
    }

    #[test]
    fn scene_mouse_picker_rejects_stale_worker_updates_after_stop() {
        let picker = SceneMousePickerState::default();
        picker.set_target_window(Some("session-1".to_string()), Some(sample_window()));

        let started = picker
            .start(Some("session-1".to_string()))
            .expect("expected picker to start");
        let worker_id = started.worker_id.expect("expected worker id");

        picker.stop(Some("session-1"));

        let stale = picker.apply_observation(
            worker_id,
            Some("session-1"),
            sample_window(),
            RuntimeScreenPoint { x: 600, y: 360 },
            Some(RuntimeScreenPoint { x: 580, y: 330 }),
            Some(sample_hit("0x99", "Stale", "hover-ts")),
            "Observing Stale. Recent refreshes automatically. Press Escape to stop.".to_string(),
        );

        assert!(stale.is_none());
    }
}
