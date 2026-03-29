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
    SceneObjectInspectHeader,
    SceneObjectInspectChildrenPage,
    SceneObjectInspectComponentsPage,
    SceneObjectCreateChild,
    SceneObjectDuplicate,
    SceneObjectDelete,
    SceneObjectSetActive,
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
            Self::SceneObjectInspectHeader => "scene-object-inspect-header",
            Self::SceneObjectInspectChildrenPage => "scene-object-inspect-children-page",
            Self::SceneObjectInspectComponentsPage => "scene-object-inspect-components-page",
            Self::SceneObjectCreateChild => "scene-object-create-child",
            Self::SceneObjectDuplicate => "scene-object-duplicate",
            Self::SceneObjectDelete => "scene-object-delete",
            Self::SceneObjectSetActive => "scene-object-set-active",
            Self::RuntimeFieldRead => "runtime-field-read",
            Self::RuntimeFieldWrite => "runtime-field-write",
            Self::RuntimeMethodInvoke => "runtime-method-invoke",
        }
    }
}
