use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BridgeOperation {
    ProcessFetch,
    ProcessAttach,
    AnalysisSnapshotLoad,
    AnalysisOverlayLoad,
    SceneCatalogLoad,
    SceneObjectChildrenLoad,
    SceneObjectInspect,
    RuntimeFieldRead,
    RuntimeFieldWrite,
    RuntimeMethodInvoke,
}

impl BridgeOperation {
    pub fn as_protocol_name(&self) -> &'static str {
        match self {
            Self::ProcessFetch => "process-fetch",
            Self::ProcessAttach => "process-attach",
            Self::AnalysisSnapshotLoad => "analysis-snapshot-load",
            Self::AnalysisOverlayLoad => "analysis-overlay-load",
            Self::SceneCatalogLoad => "scene-catalog-load",
            Self::SceneObjectChildrenLoad => "scene-object-children-load",
            Self::SceneObjectInspect => "scene-object-inspect",
            Self::RuntimeFieldRead => "runtime-field-read",
            Self::RuntimeFieldWrite => "runtime-field-write",
            Self::RuntimeMethodInvoke => "runtime-method-invoke",
        }
    }
}
