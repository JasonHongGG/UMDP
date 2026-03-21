use crate::domain::analysis_models::{AnalysisSnapshot, ProcessSession, RuntimeFlavor};
use crate::domain::workspace::{WorkspaceLifecycleState, WorkspaceLifecycleStatus};
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
    }

    pub fn set_attaching(&self) {
        let mut lifecycle = self.lifecycle.lock();
        lifecycle.status = WorkspaceLifecycleStatus::Attaching;
        lifecycle.error_message = None;
    }

    pub fn set_attached_without_snapshot(&self, process_session: ProcessSession) {
        let mut lifecycle = self.lifecycle.lock();
        lifecycle.status = WorkspaceLifecycleStatus::AttachedWithoutSnapshot;
        lifecycle.runtime = process_session.runtime.clone();
        lifecycle.process_session = Some(process_session);
        lifecycle.has_snapshot = false;
        lifecycle.error_message = None;
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
    }

    pub fn set_bridge_error(&self, error_message: impl Into<String>) {
        let mut lifecycle = self.lifecycle.lock();
        lifecycle.status = if lifecycle.process_session.is_some() {
            WorkspaceLifecycleStatus::Recovering
        } else {
            WorkspaceLifecycleStatus::BridgeError
        };
        lifecycle.error_message = Some(error_message.into());
    }

    pub fn reset(&self) {
        let mut lifecycle = self.lifecycle.lock();
        *lifecycle = WorkspaceLifecycleState {
            status: WorkspaceLifecycleStatus::Detached,
            process_session: None,
            runtime: RuntimeFlavor::Unknown,
            has_snapshot: false,
            error_message: None,
        };
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
