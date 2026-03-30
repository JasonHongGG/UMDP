use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BridgeOperation {
    ProcessFetch,
    ProcessAttach,
    AnalysisSnapshotLoad,
    AnalysisOverlayLoad,
    SceneCatalogLoad,
    SceneObjectChildrenLoad,
    SceneObjectChildrenPageLoad,
    SceneObjectInspect,
    SceneObjectInspectHeader,
    SceneObjectInspectChildrenPage,
    SceneObjectInspectComponentsPage,
    SceneObjectCreateRoot,
    SceneObjectCreateChild,
    SceneObjectDuplicate,
    SceneObjectDelete,
    SceneObjectRename,
    SceneObjectSetTag,
    SceneObjectSetLayer,
    SceneObjectSetHideFlags,
    SceneObjectReparent,
    SceneObjectSetActive,
    SceneObjectSetTransform,
    SceneComponentSetBehaviourEnabled,
    SceneComponentCreate,
    SceneComponentDelete,
    SceneLoadByBuildIndex,
    RuntimeFieldRead,
    RuntimeFieldWrite,
    RuntimeMethodInvoke,
}

#[cfg(test)]
pub const ALL_BRIDGE_OPERATIONS: [BridgeOperation; 29] = [
    BridgeOperation::ProcessFetch,
    BridgeOperation::ProcessAttach,
    BridgeOperation::AnalysisSnapshotLoad,
    BridgeOperation::AnalysisOverlayLoad,
    BridgeOperation::SceneCatalogLoad,
    BridgeOperation::SceneObjectChildrenLoad,
    BridgeOperation::SceneObjectChildrenPageLoad,
    BridgeOperation::SceneObjectInspect,
    BridgeOperation::SceneObjectInspectHeader,
    BridgeOperation::SceneObjectInspectChildrenPage,
    BridgeOperation::SceneObjectInspectComponentsPage,
    BridgeOperation::SceneObjectCreateRoot,
    BridgeOperation::SceneObjectCreateChild,
    BridgeOperation::SceneObjectDuplicate,
    BridgeOperation::SceneObjectDelete,
    BridgeOperation::SceneObjectRename,
    BridgeOperation::SceneObjectSetTag,
    BridgeOperation::SceneObjectSetLayer,
    BridgeOperation::SceneObjectSetHideFlags,
    BridgeOperation::SceneObjectReparent,
    BridgeOperation::SceneObjectSetActive,
    BridgeOperation::SceneObjectSetTransform,
    BridgeOperation::SceneComponentSetBehaviourEnabled,
    BridgeOperation::SceneComponentCreate,
    BridgeOperation::SceneComponentDelete,
    BridgeOperation::SceneLoadByBuildIndex,
    BridgeOperation::RuntimeFieldRead,
    BridgeOperation::RuntimeFieldWrite,
    BridgeOperation::RuntimeMethodInvoke,
];

impl BridgeOperation {
    #[cfg(test)]
    pub fn all() -> &'static [BridgeOperation] {
        &ALL_BRIDGE_OPERATIONS
    }

    pub fn as_protocol_name(&self) -> &'static str {
        match self {
            Self::ProcessFetch => "process-fetch",
            Self::ProcessAttach => "process-attach",
            Self::AnalysisSnapshotLoad => "analysis-snapshot-load",
            Self::AnalysisOverlayLoad => "analysis-overlay-load",
            Self::SceneCatalogLoad => "scene-catalog-load",
            Self::SceneObjectChildrenLoad => "scene-object-children-load",
            Self::SceneObjectChildrenPageLoad => "scene-object-children-page-load",
            Self::SceneObjectInspect => "scene-object-inspect",
            Self::SceneObjectInspectHeader => "scene-object-inspect-header",
            Self::SceneObjectInspectChildrenPage => "scene-object-inspect-children-page",
            Self::SceneObjectInspectComponentsPage => "scene-object-inspect-components-page",
            Self::SceneObjectCreateRoot => "scene-object-create-root",
            Self::SceneObjectCreateChild => "scene-object-create-child",
            Self::SceneObjectDuplicate => "scene-object-duplicate",
            Self::SceneObjectDelete => "scene-object-delete",
            Self::SceneObjectRename => "scene-object-rename",
            Self::SceneObjectSetTag => "scene-object-set-tag",
            Self::SceneObjectSetLayer => "scene-object-set-layer",
            Self::SceneObjectSetHideFlags => "scene-object-set-hide-flags",
            Self::SceneObjectReparent => "scene-object-reparent",
            Self::SceneObjectSetActive => "scene-object-set-active",
            Self::SceneObjectSetTransform => "scene-object-set-transform",
            Self::SceneComponentSetBehaviourEnabled => "scene-component-set-behaviour-enabled",
            Self::SceneComponentCreate => "scene-component-create",
            Self::SceneComponentDelete => "scene-component-delete",
            Self::SceneLoadByBuildIndex => "scene-load-by-build-index",
            Self::RuntimeFieldRead => "runtime-field-read",
            Self::RuntimeFieldWrite => "runtime-field-write",
            Self::RuntimeMethodInvoke => "runtime-method-invoke",
        }
    }
}

#[cfg(test)]
pub fn all_protocol_names() -> Vec<&'static str> {
    BridgeOperation::all()
        .iter()
        .map(BridgeOperation::as_protocol_name)
        .collect()
}
