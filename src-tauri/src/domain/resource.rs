#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WorkspaceResourceKind {
    WorkspaceSession,
    Metadata,
    Scene,
    RuntimeInvoke,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WorkspaceTaskStatus {
    Idle,
    Queued,
    Running,
    Success,
    Error,
    Cancelled,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WorkspaceTaskScope {
    Workspace,
    Resource,
    Selection,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTaskProgress {
    pub completed: usize,
    pub total: Option<usize>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTaskSnapshot {
    pub task_id: String,
    pub resource_kind: WorkspaceResourceKind,
    pub operation_key: String,
    pub scope: WorkspaceTaskScope,
    pub status: WorkspaceTaskStatus,
    pub progress: Option<WorkspaceTaskProgress>,
    pub target_id: Option<String>,
    pub started_at: String,
    pub updated_at: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSelectionHint {
    pub resource_kind: WorkspaceResourceKind,
    pub target_id: String,
    pub ancestor_ids: Vec<String>,
}