use crate::models::{AttachedProcess, DumpAllResponse};
use parking_lot::Mutex;

#[derive(Default)]
pub struct AppState {
    pub attached_process: Mutex<Option<AttachedProcess>>,
    pub metadata: Mutex<Option<DumpAllResponse>>,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }
}
