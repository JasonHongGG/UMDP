use crate::domain::analysis_models::{
    RuntimeQuaternionSnapshot, RuntimeSceneBuildSettingsEntry, RuntimeSceneCatalogSnapshot,
    RuntimeSceneChildrenPageSnapshot, RuntimeSceneChildrenSnapshot, RuntimeSceneComponentSummary,
    RuntimeSceneComponentsPageSnapshot, RuntimeSceneDescriptor, RuntimeSceneHierarchyPathEntry,
    RuntimeSceneKind, RuntimeSceneMouseTargetHit, RuntimeSceneMutationOperation,
    RuntimeSceneMutationResult, RuntimeSceneNodeSummary,
    RuntimeSceneObjectInspectorHeaderSnapshot, RuntimeSceneSelectionHint,
    RuntimeSceneTransformSnapshot, RuntimeSceneTransformUpdate, RuntimeScreenPoint,
    RuntimeVector3Snapshot,
};
use crate::infrastructure::clock::current_timestamp;
use crate::infrastructure::native::memory::{RemoteAllocation, RemoteMemory};
use crate::infrastructure::native::runtime_api::{
    NativeAddress, NativeFieldRecord, NativeMethodRecord, RuntimeApi,
};
use crate::kernel::runtime::session::RuntimeSession;
use std::collections::HashMap;

#[derive(Clone, Copy, PartialEq, Eq)]
enum NodeSummaryFlavor {
    Catalog,
    Inspector,
}

enum SceneInvokeArgument {
    Number(i32),
    Boolean(bool),
    String(String),
    Address(NativeAddress),
    Null,
    Bytes(Vec<u8>),
}

struct ScenePage<T> {
    items: Vec<T>,
    total_count: usize,
    next_offset: Option<usize>,
}

struct SceneQueryKernel<'a> {
    runtime_api: &'a dyn RuntimeApi,
    memory: RemoteMemory,
    class_cache: HashMap<String, NativeAddress>,
    method_cache: HashMap<String, Option<NativeMethodRecord>>,
    field_cache: HashMap<String, Option<NativeFieldRecord>>,
    type_name_cache: HashMap<NativeAddress, String>,
    hierarchy_cache: HashMap<NativeAddress, Vec<RuntimeSceneHierarchyPathEntry>>,
}

include!("entrypoints.rs");
include!("catalog.rs");
include!("mutation.rs");
include!("runtime.rs");
include!("projection.rs");
include!("helpers.rs");
include!("picker.rs");

#[cfg(test)]
mod tests;