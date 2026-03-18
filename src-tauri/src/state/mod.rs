use crate::models::{AttachedProcess, DumpAllResponse};
use parking_lot::Mutex;

#[derive(Default)]
pub struct AnalysisState {
    process_session: Mutex<Option<AttachedProcess>>,
    metadata_snapshot: Mutex<Option<DumpAllResponse>>,
}

impl AnalysisState {
    pub fn process_session(&self) -> Option<AttachedProcess> {
        self.process_session.lock().clone()
    }

    pub fn set_process_session(&self, process: AttachedProcess) {
        *self.process_session.lock() = Some(process);
    }

    pub fn metadata_snapshot(&self) -> Option<DumpAllResponse> {
        self.metadata_snapshot.lock().clone()
    }

    pub fn set_metadata_snapshot(&self, snapshot: DumpAllResponse) {
        *self.metadata_snapshot.lock() = Some(snapshot);
    }

    pub fn clear_metadata(&self) {
        self.metadata_snapshot.lock().take();
    }
}

#[derive(Default)]
pub struct AppState {
    pub analysis: AnalysisState,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }
}
