use crate::domain::analysis_models::{AnalysisSnapshot, ProcessSession};
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