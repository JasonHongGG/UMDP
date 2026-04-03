use crate::domain::analysis_models::{ProcessSession, RuntimeFlavor};
use crate::domain::workspace::{
    RuntimeCapability, RuntimeSessionState, RuntimeSessionStatus, WorkspaceLifecycleState,
    WorkspaceLifecycleStatus,
};
use crate::infrastructure::clock::current_timestamp;
use parking_lot::Mutex;

fn bump_resource_revision(lifecycle: &mut WorkspaceLifecycleState) {
    lifecycle.resource_revision += 1;
}

#[derive(Default)]
pub struct WorkspaceState {
    lifecycle: Mutex<WorkspaceLifecycleState>,
}

impl WorkspaceState {
    pub fn current(&self) -> WorkspaceLifecycleState {
        self.lifecycle.lock().clone()
    }

    pub fn sync_runtime_context(&self) -> WorkspaceLifecycleState {
        let mut lifecycle = self.lifecycle.lock();
        let changed = sync_runtime_context(&mut lifecycle);
        if changed {
            bump_resource_revision(&mut lifecycle);
        }
        lifecycle.clone()
    }

    pub fn set_attaching(&self) {
        let mut lifecycle = self.lifecycle.lock();
        lifecycle.status = WorkspaceLifecycleStatus::Attaching;
        lifecycle.error_message = None;
        lifecycle.runtime_session.status = RuntimeSessionStatus::Starting;
        lifecycle.runtime_session.connected = false;
        lifecycle.runtime_session.last_error = None;
        lifecycle.runtime_session.last_heartbeat_at = None;
        bump_resource_revision(&mut lifecycle);
    }

    pub fn set_attach_error(&self, error_message: impl Into<String>) {
        let mut lifecycle = self.lifecycle.lock();
        let error_message = error_message.into();
        lifecycle.status = WorkspaceLifecycleStatus::Detached;
        lifecycle.process_session = None;
        lifecycle.runtime = RuntimeFlavor::Unknown;
        lifecycle.has_snapshot = false;
        lifecycle.error_message = Some(error_message.clone());
        lifecycle.runtime_session = RuntimeSessionState {
            status: RuntimeSessionStatus::Error,
            runtime: RuntimeFlavor::Unknown,
            capabilities: runtime_capabilities_for(&RuntimeFlavor::Unknown),
            connected: false,
            session_key: None,
            last_error: Some(error_message),
            last_heartbeat_at: None,
        };
        bump_resource_revision(&mut lifecycle);
    }

    pub fn set_attached_without_snapshot(&self, process_session: ProcessSession) {
        let mut lifecycle = self.lifecycle.lock();
        lifecycle.status = WorkspaceLifecycleStatus::AttachedWithoutSnapshot;
        lifecycle.runtime = process_session.runtime.clone();
        lifecycle.process_session = Some(process_session);
        lifecycle.has_snapshot = false;
        lifecycle.error_message = None;
        lifecycle.runtime_session = RuntimeSessionState {
            status: RuntimeSessionStatus::Starting,
            runtime: lifecycle.runtime.clone(),
            capabilities: runtime_capabilities_for(&lifecycle.runtime),
            connected: false,
            session_key: lifecycle.process_session.as_ref().map(runtime_session_key_for),
            last_error: None,
            last_heartbeat_at: None,
        };
        bump_resource_revision(&mut lifecycle);
    }

    pub fn set_snapshot_loading(&self, process_session: Option<ProcessSession>) {
        let mut lifecycle = self.lifecycle.lock();
        lifecycle.status = WorkspaceLifecycleStatus::SnapshotLoading;
        if let Some(process_session) = process_session {
            lifecycle.runtime = process_session.runtime.clone();
            lifecycle.process_session = Some(process_session);
        }
        lifecycle.has_snapshot = false;
        lifecycle.error_message = None;
        lifecycle.runtime_session.status = RuntimeSessionStatus::Starting;
        lifecycle.runtime_session.runtime = lifecycle.runtime.clone();
        lifecycle.runtime_session.capabilities = runtime_capabilities_for(&lifecycle.runtime);
        lifecycle.runtime_session.connected = false;
        lifecycle.runtime_session.session_key = lifecycle.process_session.as_ref().map(runtime_session_key_for);
        lifecycle.runtime_session.last_error = None;
        lifecycle.runtime_session.last_heartbeat_at = None;
        bump_resource_revision(&mut lifecycle);
    }

    pub fn set_snapshot_error(&self, error_message: impl Into<String>) {
        let mut lifecycle = self.lifecycle.lock();
        let error_message = error_message.into();
        lifecycle.status = if lifecycle.process_session.is_some() {
            WorkspaceLifecycleStatus::AttachedWithoutSnapshot
        } else {
            WorkspaceLifecycleStatus::RuntimeError
        };
        lifecycle.has_snapshot = false;
        lifecycle.error_message = Some(error_message.clone());
        lifecycle.runtime_session.last_error = Some(error_message);
        if lifecycle.process_session.is_none() {
            lifecycle.runtime_session.status = RuntimeSessionStatus::Error;
            lifecycle.runtime_session.connected = false;
            lifecycle.runtime_session.last_heartbeat_at = None;
        }
        bump_resource_revision(&mut lifecycle);
    }

    pub fn set_ready(&self, process_session: Option<ProcessSession>, runtime_connected: bool) {
        let mut lifecycle = self.lifecycle.lock();
        lifecycle.status = WorkspaceLifecycleStatus::Ready;
        if let Some(process_session) = process_session {
            lifecycle.runtime = process_session.runtime.clone();
            lifecycle.process_session = Some(process_session);
        }
        lifecycle.has_snapshot = true;
        lifecycle.error_message = None;
        sync_runtime_context(&mut lifecycle);
        lifecycle.runtime_session.status = if runtime_connected {
            RuntimeSessionStatus::Ready
        } else {
            RuntimeSessionStatus::Starting
        };
        lifecycle.runtime_session.connected = runtime_connected;
        lifecycle.runtime_session.last_error = None;
        lifecycle.runtime_session.last_heartbeat_at = runtime_connected.then(current_timestamp);
        bump_resource_revision(&mut lifecycle);
    }

    pub fn set_runtime_error(&self, error_message: impl Into<String>) {
        let mut lifecycle = self.lifecycle.lock();
        let error_message = error_message.into();
        lifecycle.status = if lifecycle.process_session.is_some() {
            WorkspaceLifecycleStatus::Recovering
        } else {
            WorkspaceLifecycleStatus::RuntimeError
        };
        lifecycle.error_message = Some(error_message.clone());
        lifecycle.runtime_session.status = if lifecycle.process_session.is_some() {
            RuntimeSessionStatus::Recovering
        } else {
            RuntimeSessionStatus::Error
        };
        lifecycle.runtime_session.connected = false;
        lifecycle.runtime_session.last_error = Some(error_message);
        bump_resource_revision(&mut lifecycle);
    }

    pub fn record_runtime_heartbeat(&self) -> RuntimeSessionState {
        let mut lifecycle = self.lifecycle.lock();
        sync_runtime_context(&mut lifecycle);
        lifecycle.runtime_session.last_heartbeat_at = Some(current_timestamp());
        lifecycle.runtime_session.connected = true;
        if lifecycle.has_snapshot {
            lifecycle.runtime_session.status = RuntimeSessionStatus::Ready;
        } else if lifecycle.process_session.is_some() {
            lifecycle.runtime_session.status = RuntimeSessionStatus::Starting;
        }
        lifecycle.runtime_session.last_error = None;
        bump_resource_revision(&mut lifecycle);
        lifecycle.runtime_session.clone()
    }
}

fn sync_runtime_context(lifecycle: &mut WorkspaceLifecycleState) -> bool {
    let runtime = lifecycle
        .process_session
        .as_ref()
        .map(|session| session.runtime.clone())
        .unwrap_or_else(|| lifecycle.runtime.clone());
    let capabilities = runtime_capabilities_for(&runtime);
    let session_key = lifecycle.process_session.as_ref().map(runtime_session_key_for);

    let mut changed = false;
    if lifecycle.runtime_session.runtime != runtime {
        lifecycle.runtime_session.runtime = runtime;
        changed = true;
    }
    if lifecycle.runtime_session.capabilities != capabilities {
        lifecycle.runtime_session.capabilities = capabilities;
        changed = true;
    }
    if lifecycle.runtime_session.session_key != session_key {
        lifecycle.runtime_session.session_key = session_key;
        changed = true;
    }

    changed
}

fn runtime_session_key_for(process_session: &ProcessSession) -> String {
    format!("{}:{}:{:?}", process_session.pid, process_session.process_name, process_session.runtime)
}

fn runtime_capabilities_for(runtime: &RuntimeFlavor) -> Vec<RuntimeCapability> {
    match runtime {
        RuntimeFlavor::Mono | RuntimeFlavor::Il2cpp => vec![
            RuntimeCapability::Metadata,
            RuntimeCapability::PreviewQuery,
            RuntimeCapability::Execution,
            RuntimeCapability::FieldRead,
            RuntimeCapability::FieldWrite,
            RuntimeCapability::MethodInvoke,
            RuntimeCapability::SceneRead,
        ],
        RuntimeFlavor::Unknown => vec![RuntimeCapability::Metadata],
    }
}