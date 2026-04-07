use crate::domain::analysis_models::{ProcessSession, RuntimeFlavor};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeSessionStatus {
    Idle,
    Starting,
    Ready,
    Degraded,
    Error,
}

impl Default for RuntimeSessionStatus {
    fn default() -> Self {
        Self::Idle
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeCapability {
    Metadata,
    PreviewQuery,
    Execution,
    InstanceEnumeration,
    FieldRead,
    FieldWrite,
    MethodInvoke,
    SceneCatalogRead,
    SceneObjectHeaderRead,
    SceneObjectChildrenRead,
    SceneObjectComponentsRead,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeSceneObjectComponentsCapabilityStatus {
    Unknown,
    Supported,
    Unsupported,
}

impl Default for RuntimeSceneObjectComponentsCapabilityStatus {
    fn default() -> Self {
        Self::Unknown
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeSceneObjectComponentsStrategy {
    IndexedGameObjectApi,
    GetComponentsByType,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneObjectComponentsCapabilityState {
    pub status: RuntimeSceneObjectComponentsCapabilityStatus,
    pub strategy: Option<RuntimeSceneObjectComponentsStrategy>,
    pub reason: Option<String>,
    pub checked_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSessionState {
    pub status: RuntimeSessionStatus,
    pub runtime: RuntimeFlavor,
    pub capabilities: Vec<RuntimeCapability>,
    pub scene_object_components: RuntimeSceneObjectComponentsCapabilityState,
    pub connected: bool,
    pub session_key: Option<String>,
    pub last_error: Option<String>,
    pub last_heartbeat_at: Option<String>,
}

impl Default for RuntimeSessionState {
    fn default() -> Self {
        Self {
            status: RuntimeSessionStatus::Idle,
            runtime: RuntimeFlavor::Unknown,
            capabilities: Vec::new(),
            scene_object_components: RuntimeSceneObjectComponentsCapabilityState::default(),
            connected: false,
            session_key: None,
            last_error: None,
            last_heartbeat_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WorkspaceLifecycleStatus {
    Detached,
    SelectingProcess,
    Attaching,
    AttachedWithoutSnapshot,
    SnapshotLoading,
    Ready,
    RuntimeError,
}

impl Default for WorkspaceLifecycleStatus {
    fn default() -> Self {
        Self::Detached
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLifecycleState {
    pub resource_revision: u64,
    pub status: WorkspaceLifecycleStatus,
    pub process_session: Option<ProcessSession>,
    pub runtime: RuntimeFlavor,
    pub has_snapshot: bool,
    pub error_message: Option<String>,
    pub runtime_session: RuntimeSessionState,
}

impl Default for WorkspaceLifecycleState {
    fn default() -> Self {
        Self {
            resource_revision: 0,
            status: WorkspaceLifecycleStatus::Detached,
            process_session: None,
            runtime: RuntimeFlavor::Unknown,
            has_snapshot: false,
            error_message: None,
            runtime_session: RuntimeSessionState::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemContractVersions {
    pub tauri_command_version: u32,
    pub analysis_schema_version: u32,
    pub workflow_schema_version: u32,
}

pub fn current_contract_versions() -> SystemContractVersions {
    SystemContractVersions {
        tauri_command_version: 5,
        analysis_schema_version: 5,
        workflow_schema_version: 1,
    }
}
