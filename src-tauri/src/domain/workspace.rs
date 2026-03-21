use crate::domain::analysis_models::{ProcessSession, RuntimeFlavor};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WorkspaceLifecycleStatus {
    Detached,
    SelectingProcess,
    Attaching,
    AttachedWithoutSnapshot,
    SnapshotLoading,
    Ready,
    BridgeError,
    Recovering,
}

impl Default for WorkspaceLifecycleStatus {
    fn default() -> Self {
        Self::Detached
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLifecycleState {
    pub status: WorkspaceLifecycleStatus,
    pub process_session: Option<ProcessSession>,
    pub runtime: RuntimeFlavor,
    pub has_snapshot: bool,
    pub error_message: Option<String>,
}

impl Default for WorkspaceLifecycleState {
    fn default() -> Self {
        Self {
            status: WorkspaceLifecycleStatus::Detached,
            process_session: None,
            runtime: RuntimeFlavor::Unknown,
            has_snapshot: false,
            error_message: None,
        }
    }
}
