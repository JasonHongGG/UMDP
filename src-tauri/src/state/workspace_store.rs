use crate::domain::analysis_models::{AnalysisSnapshot, ProcessSession, RuntimeFlavor};
use crate::domain::workspace::{
    RuntimeCapability, RuntimeSceneObjectComponentsCapabilityState, RuntimeSessionState,
    RuntimeSessionStatus, WorkspaceLifecycleState, WorkspaceLifecycleStatus,
};
use crate::infrastructure::clock::current_timestamp;
use parking_lot::Mutex;

fn bump_resource_revision(lifecycle: &mut WorkspaceLifecycleState) {
    lifecycle.resource_revision += 1;
}

enum WorkspaceLifecycleTransition {
    BeginAttach,
    AttachCompleted { process_session: ProcessSession },
    AttachFailed { error_message: String },
    SnapshotLoadStarted,
    SnapshotLoadCompleted { runtime_connected: bool },
    SnapshotLoadFailed {
        error_message: String,
        runtime_session_dropped: bool,
    },
    RuntimeSessionProfileUpdated {
        runtime: RuntimeFlavor,
        capabilities: Vec<RuntimeCapability>,
        scene_object_components: RuntimeSceneObjectComponentsCapabilityState,
    },
    RuntimeHeartbeatRecorded,
    RuntimeFaulted { error_message: String },
}

#[derive(Default)]
pub struct WorkspaceState {
    lifecycle: Mutex<WorkspaceLifecycleState>,
    metadata_snapshot: Mutex<Option<AnalysisSnapshot>>,
    scene_mutation_channel: Mutex<()>,
}

impl WorkspaceState {
    pub fn current(&self) -> WorkspaceLifecycleState {
        self.lifecycle.lock().clone()
    }

    pub fn current_with_runtime_projection(&self) -> WorkspaceLifecycleState {
        let mut lifecycle = self.lifecycle.lock();
        let changed = sync_runtime_projection(&mut lifecycle);
        if changed {
            bump_resource_revision(&mut lifecycle);
        }
        lifecycle.clone()
    }

    pub fn process_session(&self) -> Option<ProcessSession> {
        self.lifecycle.lock().process_session.clone()
    }

    pub fn metadata_snapshot(&self) -> Option<AnalysisSnapshot> {
        self.metadata_snapshot.lock().clone()
    }

    pub fn set_metadata_snapshot(&self, snapshot: AnalysisSnapshot) {
        *self.metadata_snapshot.lock() = Some(snapshot);
    }

    pub fn clear_metadata(&self) {
        self.metadata_snapshot.lock().take();
    }

    pub fn begin_attach(&self) {
        self.apply_transition(WorkspaceLifecycleTransition::BeginAttach);
    }

    pub fn fail_attach(&self, error_message: impl Into<String>) {
        self.apply_transition(WorkspaceLifecycleTransition::AttachFailed {
            error_message: error_message.into(),
        });
    }

    pub fn complete_attach(&self, process_session: ProcessSession) {
        self.apply_transition(WorkspaceLifecycleTransition::AttachCompleted { process_session });
    }

    pub fn begin_snapshot_load(&self) {
        self.apply_transition(WorkspaceLifecycleTransition::SnapshotLoadStarted);
    }

    pub fn fail_snapshot_load(
        &self,
        error_message: impl Into<String>,
        runtime_session_dropped: bool,
    ) {
        self.apply_transition(WorkspaceLifecycleTransition::SnapshotLoadFailed {
            error_message: error_message.into(),
            runtime_session_dropped,
        });
    }

    pub fn complete_snapshot_load(&self, runtime_connected: bool) {
        self.apply_transition(WorkspaceLifecycleTransition::SnapshotLoadCompleted {
            runtime_connected,
        });
    }

    pub fn mark_runtime_error(&self, error_message: impl Into<String>) {
        self.apply_transition(WorkspaceLifecycleTransition::RuntimeFaulted {
            error_message: error_message.into(),
        });
    }

    pub fn refresh_runtime_session_profile(
        &self,
        runtime: RuntimeFlavor,
        capabilities: Vec<RuntimeCapability>,
        scene_object_components: RuntimeSceneObjectComponentsCapabilityState,
    ) -> WorkspaceLifecycleState {
        self.apply_transition(WorkspaceLifecycleTransition::RuntimeSessionProfileUpdated {
            runtime,
            capabilities,
            scene_object_components,
        })
    }

    pub fn record_runtime_heartbeat(&self) -> RuntimeSessionState {
        let lifecycle = self.apply_transition(WorkspaceLifecycleTransition::RuntimeHeartbeatRecorded);
        lifecycle.runtime_session.clone()
    }

    pub fn with_scene_mutation_lock<T>(&self, execute: impl FnOnce() -> T) -> T {
        let _guard = self.scene_mutation_channel.lock();
        execute()
    }

    fn apply_transition(
        &self,
        transition: WorkspaceLifecycleTransition,
    ) -> WorkspaceLifecycleState {
        let mut lifecycle = self.lifecycle.lock();
        let changed = apply_lifecycle_transition(&mut lifecycle, transition);
        if changed {
            bump_resource_revision(&mut lifecycle);
        }
        lifecycle.clone()
    }
}

fn apply_lifecycle_transition(
    lifecycle: &mut WorkspaceLifecycleState,
    transition: WorkspaceLifecycleTransition,
) -> bool {
    match transition {
        WorkspaceLifecycleTransition::BeginAttach => {
            replace_lifecycle_state(lifecycle, create_attaching_lifecycle());
            true
        }
        WorkspaceLifecycleTransition::AttachCompleted { process_session } => {
            replace_lifecycle_state(
                lifecycle,
                create_attached_without_snapshot_lifecycle(process_session),
            );
            true
        }
        WorkspaceLifecycleTransition::AttachFailed { error_message } => {
            replace_lifecycle_state(lifecycle, create_attach_error_lifecycle(error_message));
            true
        }
        WorkspaceLifecycleTransition::SnapshotLoadStarted => {
            let next = create_snapshot_loading_lifecycle(lifecycle);
            replace_lifecycle_state(lifecycle, next);
            true
        }
        WorkspaceLifecycleTransition::SnapshotLoadCompleted { runtime_connected } => {
            let next = create_ready_lifecycle(lifecycle, runtime_connected);
            replace_lifecycle_state(lifecycle, next);
            true
        }
        WorkspaceLifecycleTransition::SnapshotLoadFailed {
            error_message,
            runtime_session_dropped,
        } => {
            let next = create_snapshot_load_failed_lifecycle(
                lifecycle,
                error_message,
                runtime_session_dropped,
            );
            replace_lifecycle_state(lifecycle, next);
            true
        }
        WorkspaceLifecycleTransition::RuntimeSessionProfileUpdated {
            runtime,
            capabilities,
            scene_object_components,
        } => {
            let session_key = lifecycle.process_session.as_ref().map(runtime_session_key_for);
            let mut changed = false;

            if lifecycle.runtime != runtime {
                lifecycle.runtime = runtime.clone();
                changed = true;
            }
            if lifecycle.runtime_session.runtime != runtime {
                lifecycle.runtime_session.runtime = runtime;
                changed = true;
            }
            if lifecycle.runtime_session.capabilities != capabilities {
                lifecycle.runtime_session.capabilities = capabilities;
                changed = true;
            }
            if lifecycle.runtime_session.scene_object_components != scene_object_components {
                lifecycle.runtime_session.scene_object_components = scene_object_components;
                changed = true;
            }
            if lifecycle.runtime_session.session_key != session_key {
                lifecycle.runtime_session.session_key = session_key;
                changed = true;
            }

            changed
        }
        WorkspaceLifecycleTransition::RuntimeHeartbeatRecorded => {
            sync_runtime_projection(lifecycle);
            lifecycle.runtime_session.last_heartbeat_at = Some(current_timestamp());
            lifecycle.runtime_session.connected = true;
            lifecycle.runtime_session.status = if lifecycle.has_snapshot {
                RuntimeSessionStatus::Ready
            } else if lifecycle.process_session.is_some() {
                RuntimeSessionStatus::Starting
            } else {
                RuntimeSessionStatus::Idle
            };
            lifecycle.runtime_session.last_error = None;
            true
        }
        WorkspaceLifecycleTransition::RuntimeFaulted { error_message } => {
            let next = create_runtime_error_lifecycle(lifecycle, error_message);
            replace_lifecycle_state(lifecycle, next);
            true
        }
    }
}

fn replace_lifecycle_state(current: &mut WorkspaceLifecycleState, mut next: WorkspaceLifecycleState) {
    next.resource_revision = current.resource_revision;
    *current = next;
}

fn create_runtime_session_state(
    runtime: RuntimeFlavor,
    status: RuntimeSessionStatus,
    connected: bool,
    capabilities: Vec<RuntimeCapability>,
    scene_object_components: RuntimeSceneObjectComponentsCapabilityState,
    session_key: Option<String>,
    last_error: Option<String>,
    last_heartbeat_at: Option<String>,
) -> RuntimeSessionState {
    RuntimeSessionState {
        status,
        runtime,
        capabilities,
        scene_object_components,
        connected,
        session_key,
        last_error,
        last_heartbeat_at,
    }
}

fn lifecycle_runtime(lifecycle: &WorkspaceLifecycleState) -> RuntimeFlavor {
    lifecycle
        .process_session
        .as_ref()
        .map(|session| session.runtime.clone())
        .unwrap_or_else(|| lifecycle.runtime.clone())
}

fn current_runtime_capabilities(
    lifecycle: &WorkspaceLifecycleState,
    runtime: &RuntimeFlavor,
) -> Vec<RuntimeCapability> {
    if lifecycle.runtime_session.capabilities.is_empty() {
        base_runtime_capabilities_for(runtime)
    } else {
        lifecycle.runtime_session.capabilities.clone()
    }
}

fn create_attaching_lifecycle() -> WorkspaceLifecycleState {
    WorkspaceLifecycleState {
        status: WorkspaceLifecycleStatus::Attaching,
        process_session: None,
        runtime: RuntimeFlavor::Unknown,
        has_snapshot: false,
        error_message: None,
        runtime_session: create_runtime_session_state(
            RuntimeFlavor::Unknown,
            RuntimeSessionStatus::Starting,
            false,
            base_runtime_capabilities_for(&RuntimeFlavor::Unknown),
            RuntimeSceneObjectComponentsCapabilityState::default(),
            None,
            None,
            None,
        ),
        ..WorkspaceLifecycleState::default()
    }
}

fn create_attach_error_lifecycle(error_message: String) -> WorkspaceLifecycleState {
    WorkspaceLifecycleState {
        status: WorkspaceLifecycleStatus::Detached,
        process_session: None,
        runtime: RuntimeFlavor::Unknown,
        has_snapshot: false,
        error_message: Some(error_message.clone()),
        runtime_session: create_runtime_session_state(
            RuntimeFlavor::Unknown,
            RuntimeSessionStatus::Error,
            false,
            base_runtime_capabilities_for(&RuntimeFlavor::Unknown),
            RuntimeSceneObjectComponentsCapabilityState::default(),
            None,
            Some(error_message),
            None,
        ),
        ..WorkspaceLifecycleState::default()
    }
}

fn create_attached_without_snapshot_lifecycle(
    process_session: ProcessSession,
) -> WorkspaceLifecycleState {
    let runtime = process_session.runtime.clone();
    let session_key = Some(runtime_session_key_for(&process_session));
    WorkspaceLifecycleState {
        status: WorkspaceLifecycleStatus::AttachedWithoutSnapshot,
        process_session: Some(process_session),
        runtime: runtime.clone(),
        has_snapshot: false,
        error_message: None,
        runtime_session: create_runtime_session_state(
            runtime.clone(),
            RuntimeSessionStatus::Starting,
            false,
            base_runtime_capabilities_for(&runtime),
            RuntimeSceneObjectComponentsCapabilityState::default(),
            session_key,
            None,
            None,
        ),
        ..WorkspaceLifecycleState::default()
    }
}

fn create_snapshot_loading_lifecycle(
    current: &WorkspaceLifecycleState,
) -> WorkspaceLifecycleState {
    let runtime = lifecycle_runtime(current);
    WorkspaceLifecycleState {
        resource_revision: current.resource_revision,
        status: WorkspaceLifecycleStatus::SnapshotLoading,
        process_session: current.process_session.clone(),
        runtime: runtime.clone(),
        has_snapshot: false,
        error_message: None,
        runtime_session: create_runtime_session_state(
            runtime.clone(),
            RuntimeSessionStatus::Starting,
            false,
            current_runtime_capabilities(current, &runtime),
            current.runtime_session.scene_object_components.clone(),
            current.process_session.as_ref().map(runtime_session_key_for),
            None,
            None,
        ),
    }
}

fn create_ready_lifecycle(
    current: &WorkspaceLifecycleState,
    runtime_connected: bool,
) -> WorkspaceLifecycleState {
    let runtime = lifecycle_runtime(current);
    WorkspaceLifecycleState {
        resource_revision: current.resource_revision,
        status: WorkspaceLifecycleStatus::Ready,
        process_session: current.process_session.clone(),
        runtime: runtime.clone(),
        has_snapshot: true,
        error_message: None,
        runtime_session: create_runtime_session_state(
            runtime.clone(),
            if runtime_connected {
                RuntimeSessionStatus::Ready
            } else {
                RuntimeSessionStatus::Starting
            },
            runtime_connected,
            current_runtime_capabilities(current, &runtime),
            current.runtime_session.scene_object_components.clone(),
            current.process_session.as_ref().map(runtime_session_key_for),
            None,
            runtime_connected.then(current_timestamp),
        ),
    }
}

fn create_snapshot_load_failed_lifecycle(
    current: &WorkspaceLifecycleState,
    error_message: String,
    runtime_session_dropped: bool,
) -> WorkspaceLifecycleState {
    if runtime_session_dropped || current.process_session.is_none() {
        return create_runtime_error_lifecycle(current, error_message);
    }

    let runtime = lifecycle_runtime(current);
    WorkspaceLifecycleState {
        resource_revision: current.resource_revision,
        status: WorkspaceLifecycleStatus::AttachedWithoutSnapshot,
        process_session: current.process_session.clone(),
        runtime: runtime.clone(),
        has_snapshot: false,
        error_message: Some(error_message.clone()),
        runtime_session: create_runtime_session_state(
            runtime.clone(),
            current.runtime_session.status.clone(),
            current.runtime_session.connected,
            current_runtime_capabilities(current, &runtime),
            current.runtime_session.scene_object_components.clone(),
            current.process_session.as_ref().map(runtime_session_key_for),
            Some(error_message),
            current.runtime_session.last_heartbeat_at.clone(),
        ),
    }
}

fn create_runtime_error_lifecycle(
    current: &WorkspaceLifecycleState,
    error_message: String,
) -> WorkspaceLifecycleState {
    let runtime = lifecycle_runtime(current);
    WorkspaceLifecycleState {
        resource_revision: current.resource_revision,
        status: WorkspaceLifecycleStatus::RuntimeError,
        process_session: current.process_session.clone(),
        runtime: runtime.clone(),
        has_snapshot: current.has_snapshot,
        error_message: Some(error_message.clone()),
        runtime_session: create_runtime_session_state(
            runtime.clone(),
            RuntimeSessionStatus::Error,
            false,
            current_runtime_capabilities(current, &runtime),
            current.runtime_session.scene_object_components.clone(),
            current.process_session.as_ref().map(runtime_session_key_for),
            Some(error_message),
            current.runtime_session.last_heartbeat_at.clone(),
        ),
    }
}

fn sync_runtime_projection(lifecycle: &mut WorkspaceLifecycleState) -> bool {
    let runtime = lifecycle
        .process_session
        .as_ref()
        .map(|session| session.runtime.clone())
        .unwrap_or_else(|| lifecycle.runtime.clone());
    let session_key = lifecycle
        .process_session
        .as_ref()
        .map(runtime_session_key_for);

    let mut changed = false;
    if lifecycle.runtime != runtime {
        lifecycle.runtime = runtime.clone();
        changed = true;
    }
    if lifecycle.runtime_session.runtime != runtime {
        lifecycle.runtime_session.runtime = runtime;
        changed = true;
    }
    if lifecycle.runtime_session.session_key != session_key {
        lifecycle.runtime_session.session_key = session_key;
        changed = true;
    }

    changed
}

fn runtime_session_key_for(process_session: &ProcessSession) -> String {
    format!(
        "{}:{}:{:?}",
        process_session.pid, process_session.process_name, process_session.runtime
    )
}

fn base_runtime_capabilities_for(runtime: &RuntimeFlavor) -> Vec<RuntimeCapability> {
    match runtime {
        RuntimeFlavor::Mono | RuntimeFlavor::Il2cpp => vec![
            RuntimeCapability::Metadata,
            RuntimeCapability::PreviewQuery,
            RuntimeCapability::Execution,
            RuntimeCapability::FieldRead,
            RuntimeCapability::FieldWrite,
            RuntimeCapability::MethodInvoke,
            RuntimeCapability::SceneCatalogRead,
            RuntimeCapability::SceneObjectHeaderRead,
            RuntimeCapability::SceneObjectChildrenRead,
        ],
        RuntimeFlavor::Unknown => vec![RuntimeCapability::Metadata],
    }
}
