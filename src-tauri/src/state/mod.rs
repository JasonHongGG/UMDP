use crate::domain::analysis_models::{AnalysisSnapshot, ProcessSession, RuntimeFlavor};
use crate::domain::workspace::{
    RuntimeCapability, RuntimeSessionState, RuntimeSessionStatus, WorkspaceLifecycleState,
    WorkspaceLifecycleStatus,
};
use parking_lot::Mutex;

#[derive(Default)]
pub struct AnalysisState {
    process_session: Mutex<Option<ProcessSession>>,
    metadata_snapshot: Mutex<Option<AnalysisSnapshot>>,
}

impl AnalysisState {
    pub fn process_session(&self) -> Option<ProcessSession> {
        self.process_session.lock().clone()
    }

    pub fn set_process_session(&self, process: ProcessSession) {
        *self.process_session.lock() = Some(process);
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
}

#[derive(Default)]
pub struct WorkspaceState {
    lifecycle: Mutex<WorkspaceLifecycleState>,
}

impl WorkspaceState {
    pub fn current(&self) -> WorkspaceLifecycleState {
        self.lifecycle.lock().clone()
    }

    pub fn set_selecting_process(&self) {
        let mut lifecycle = self.lifecycle.lock();
        lifecycle.status = WorkspaceLifecycleStatus::SelectingProcess;
        lifecycle.error_message = None;
        lifecycle.runtime_session.status = RuntimeSessionStatus::Idle;
    }

    pub fn set_attaching(&self) {
        let mut lifecycle = self.lifecycle.lock();
        lifecycle.status = WorkspaceLifecycleStatus::Attaching;
        lifecycle.error_message = None;
        lifecycle.runtime_session.status = RuntimeSessionStatus::Starting;
        lifecycle.runtime_session.bridge_connected = false;
        lifecycle.runtime_session.last_error = None;
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
            bridge_connected: false,
            session_key: lifecycle.process_session.as_ref().map(runtime_session_key_for),
            last_error: None,
            last_heartbeat_at: None,
        };
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
        lifecycle.runtime_session.session_key = lifecycle.process_session.as_ref().map(runtime_session_key_for);
    }

    pub fn set_ready(&self, process_session: Option<ProcessSession>) {
        let mut lifecycle = self.lifecycle.lock();
        lifecycle.status = WorkspaceLifecycleStatus::Ready;
        if let Some(process_session) = process_session {
            lifecycle.runtime = process_session.runtime.clone();
            lifecycle.process_session = Some(process_session);
        }
        lifecycle.has_snapshot = true;
        lifecycle.error_message = None;
        lifecycle.runtime_session.status = RuntimeSessionStatus::Ready;
        lifecycle.runtime_session.runtime = lifecycle.runtime.clone();
        lifecycle.runtime_session.capabilities = runtime_capabilities_for(&lifecycle.runtime);
        lifecycle.runtime_session.bridge_connected = true;
        lifecycle.runtime_session.session_key = lifecycle.process_session.as_ref().map(runtime_session_key_for);
        lifecycle.runtime_session.last_error = None;
    }

    pub fn set_bridge_error(&self, error_message: impl Into<String>) {
        let mut lifecycle = self.lifecycle.lock();
        let error_message = error_message.into();
        lifecycle.status = if lifecycle.process_session.is_some() {
            WorkspaceLifecycleStatus::Recovering
        } else {
            WorkspaceLifecycleStatus::BridgeError
        };
        lifecycle.error_message = Some(error_message.clone());
        lifecycle.runtime_session.status = if lifecycle.process_session.is_some() {
            RuntimeSessionStatus::Recovering
        } else {
            RuntimeSessionStatus::Error
        };
        lifecycle.runtime_session.bridge_connected = false;
        lifecycle.runtime_session.last_error = Some(error_message);
    }

    pub fn touch_runtime_session(&self) -> RuntimeSessionState {
        let mut lifecycle = self.lifecycle.lock();
        let runtime = lifecycle.process_session.as_ref().map(|session| session.runtime.clone()).unwrap_or_else(|| lifecycle.runtime.clone());
        lifecycle.runtime_session.runtime = runtime.clone();
        lifecycle.runtime_session.capabilities = runtime_capabilities_for(&runtime);
        if lifecycle.runtime_session.session_key.is_none() {
            lifecycle.runtime_session.session_key = lifecycle.process_session.as_ref().map(runtime_session_key_for);
        }
        lifecycle.runtime_session.last_heartbeat_at = Some(crate::services::analysis::bridge_gateway::current_timestamp());
        if lifecycle.runtime_session.status == RuntimeSessionStatus::Starting && lifecycle.has_snapshot {
            lifecycle.runtime_session.status = RuntimeSessionStatus::Ready;
            lifecycle.runtime_session.bridge_connected = true;
        }
        lifecycle.runtime_session.clone()
    }

    pub fn reset(&self) {
        let mut lifecycle = self.lifecycle.lock();
        *lifecycle = WorkspaceLifecycleState {
            status: WorkspaceLifecycleStatus::Detached,
            process_session: None,
            runtime: RuntimeFlavor::Unknown,
            has_snapshot: false,
            error_message: None,
            runtime_session: RuntimeSessionState::default(),
        };
    }
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
        ],
        RuntimeFlavor::Unknown => vec![RuntimeCapability::Metadata],
    }
}

#[derive(Default)]
pub struct AppState {
    pub analysis: AnalysisState,
    pub workspace: WorkspaceState,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }
}
