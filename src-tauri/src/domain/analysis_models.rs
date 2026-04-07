use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub type StableId = String;

#[derive(Debug, Clone, Serialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeFlavor {
    Mono,
    Il2cpp,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessSession {
    pub pid: u32,
    pub process_name: String,
    pub exe_path: String,
    pub data_dir: Option<String>,
    pub managed_dir: Option<String>,
    pub runtime: RuntimeFlavor,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeScreenPoint {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeScreenRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProcessWindowCandidate {
    pub pid: u32,
    pub window_handle: String,
    pub title: String,
    pub class_name: String,
    pub window_rect: RuntimeScreenRect,
    pub client_rect: RuntimeScreenRect,
    pub is_visible: bool,
    pub is_minimized: bool,
    pub is_foreground: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisSnapshot {
    pub schema_version: u32,
    pub generated_at: String,
    pub process: Option<ProcessSession>,
    pub images: Vec<ImageDescriptor>,
    pub classes: HashMap<StableId, ClassDescriptor>,
    pub image_class_index: HashMap<StableId, Vec<StableId>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeOverlaySnapshot {
    pub schema_version: u32,
    pub generated_at: String,
    pub classes: HashMap<StableId, RuntimeClassOverlayDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageDescriptor {
    pub stable_id: StableId,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InheritanceDescriptor {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldDescriptor {
    pub stable_id: StableId,
    pub name: String,
    pub field_type: String,
    pub offset: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaticFieldDescriptor {
    pub stable_id: StableId,
    pub name: String,
    pub field_type: String,
    pub offset: Option<String>,
    pub address: Option<String>,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MethodParameterDescriptor {
    pub position: usize,
    pub name: String,
    pub type_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MethodDescriptor {
    pub stable_id: StableId,
    pub name: String,
    pub signature: String,
    pub return_type: String,
    pub parameters: Vec<MethodParameterDescriptor>,
    pub is_static: bool,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeResolvedFieldDescriptor {
    pub stable_id: StableId,
    pub name: String,
    pub field_type: String,
    pub offset: Option<String>,
    pub address: Option<String>,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassDescriptor {
    pub stable_id: StableId,
    #[serde(skip_serializing)]
    pub bridge_image_name: String,
    pub image_stable_id: StableId,
    pub name: String,
    pub namespace: String,
    pub full_name: String,
    pub inheritance: Vec<InheritanceDescriptor>,
    pub fields: Vec<FieldDescriptor>,
    pub static_fields: Vec<StaticFieldDescriptor>,
    pub methods: Vec<MethodDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeClassOverlayDescriptor {
    pub class_stable_id: StableId,
    pub fields: Vec<FieldDescriptor>,
    pub static_fields: Vec<StaticFieldDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInstanceFieldSnapshot {
    pub class_stable_id: StableId,
    pub instance_address: String,
    pub fields: Vec<RuntimeResolvedFieldDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeInvokeArgumentKind {
    Null,
    Boolean,
    Number,
    String,
    Address,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeInvokeFailureKind {
    None,
    NotAttached,
    MetadataUnavailable,
    ClassNotFound,
    MethodNotFound,
    InstanceRequired,
    ArgumentMismatch,
    InvalidAddress,
    CapabilityUnavailable,
    RuntimeUnavailable,
    RuntimeException,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMethodInvokeArgument {
    pub name: String,
    pub type_name: String,
    pub value_kind: RuntimeInvokeArgumentKind,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMethodInvokeRequest {
    pub class_stable_id: StableId,
    pub method_stable_id: StableId,
    pub instance_address: Option<String>,
    pub arguments: Vec<RuntimeMethodInvokeArgument>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMethodInvokeValue {
    pub kind: String,
    pub value: Option<String>,
    pub object_address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMethodInvokeResult {
    pub class_stable_id: StableId,
    pub method_stable_id: StableId,
    pub method_name: String,
    pub method_signature: String,
    pub return_type: String,
    pub success: bool,
    pub failure_kind: RuntimeInvokeFailureKind,
    pub error: Option<String>,
    pub exception: Option<String>,
    pub result: Option<RuntimeMethodInvokeValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeFieldValueKind {
    Boolean,
    Integer,
    Float,
    String,
    Address,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeFieldSetFailureKind {
    None,
    NotAttached,
    MetadataUnavailable,
    ClassNotFound,
    FieldNotFound,
    InstanceRequired,
    InvalidAddress,
    AddressMismatch,
    CapabilityUnavailable,
    RuntimeUnavailable,
    UnsupportedType,
    InvalidValue,
    WriteFailed,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeFieldSetRequest {
    pub class_stable_id: StableId,
    pub member_stable_id: StableId,
    pub field_name: String,
    pub field_type_name: String,
    pub is_static: bool,
    pub instance_address: Option<String>,
    pub target_address: Option<String>,
    pub value_kind: RuntimeFieldValueKind,
    pub serialized_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeFieldSetResult {
    pub class_stable_id: StableId,
    pub member_stable_id: StableId,
    pub field_name: String,
    pub field_type_name: String,
    pub is_static: bool,
    pub address: Option<String>,
    pub success: bool,
    pub failure_kind: RuntimeFieldSetFailureKind,
    pub error: Option<String>,
    pub previous_value: Option<String>,
    pub applied_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SceneRefreshStatus {
    Idle,
    Refreshing,
    Ready,
    Error,
}

impl Default for SceneRefreshStatus {
    fn default() -> Self {
        Self::Idle
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SceneResourceFreshness {
    Empty,
    Fresh,
    Refreshing,
    Stale,
    Error,
}

impl Default for SceneResourceFreshness {
    fn default() -> Self {
        Self::Empty
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeSceneResourceKind {
    Catalog,
    Children,
    SceneObjectHeader,
    SceneObjectComponents,
}

impl Default for RuntimeSceneResourceKind {
    fn default() -> Self {
        Self::Catalog
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeSceneSnapshotKind {
    Empty,
    Retained,
    Fresh,
}

impl Default for RuntimeSceneSnapshotKind {
    fn default() -> Self {
        Self::Empty
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneResourceState {
    pub resource_kind: RuntimeSceneResourceKind,
    pub resource_revision: u64,
    pub session_key: Option<String>,
    pub freshness: SceneResourceFreshness,
    pub last_successful_at: Option<String>,
    pub is_retaining_snapshot: bool,
    pub snapshot_kind: RuntimeSceneSnapshotKind,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeVector3Snapshot {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeQuaternionSnapshot {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub w: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneNodeSummary {
    pub object_address: String,
    pub transform_address: Option<String>,
    pub parent_object_address: Option<String>,
    pub name: String,
    pub active_self: bool,
    pub is_static: Option<bool>,
    pub child_count: usize,
    pub has_children: bool,
    pub component_count: Option<usize>,
    pub layer: Option<i32>,
    pub tag: Option<String>,
    pub hide_flags: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeSceneKind {
    Loaded,
    DontDestroyOnLoad,
    HideAndDontSave,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneBuildSettingsEntry {
    pub build_index: i32,
    pub path: String,
    pub name: String,
    pub is_loaded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneDescriptor {
    pub scene_handle: i32,
    pub name: String,
    pub is_loaded: bool,
    pub kind: RuntimeSceneKind,
    pub build_index: Option<i32>,
    pub path: Option<String>,
    pub roots: Vec<RuntimeSceneNodeSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneCatalogSnapshot {
    pub generated_at: String,
    pub scenes: Vec<RuntimeSceneDescriptor>,
    pub build_settings_scenes: Vec<RuntimeSceneBuildSettingsEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneComponentSummary {
    pub component_address: String,
    pub type_name: String,
    pub is_behaviour: bool,
    pub behaviour_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneHierarchyPathEntry {
    pub object_address: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneTransformSnapshot {
    pub transform_address: String,
    pub world_position: Option<RuntimeVector3Snapshot>,
    pub local_position: Option<RuntimeVector3Snapshot>,
    pub local_rotation: Option<RuntimeQuaternionSnapshot>,
    pub local_euler_angles: Option<RuntimeVector3Snapshot>,
    pub local_scale: Option<RuntimeVector3Snapshot>,
    pub parent_transform_address: Option<String>,
    pub parent_object_address: Option<String>,
    pub child_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneTransformUpdate {
    pub world_position: Option<RuntimeVector3Snapshot>,
    pub local_position: Option<RuntimeVector3Snapshot>,
    pub local_rotation: Option<RuntimeQuaternionSnapshot>,
    pub local_euler_angles: Option<RuntimeVector3Snapshot>,
    pub local_scale: Option<RuntimeVector3Snapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneChildrenSnapshot {
    pub parent_object_address: String,
    pub children: Vec<RuntimeSceneNodeSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneChildrenPageSnapshot {
    pub generated_at: String,
    pub parent_object_address: String,
    pub offset: usize,
    pub total_count: usize,
    pub next_offset: Option<usize>,
    pub children: Vec<RuntimeSceneNodeSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeSceneChildrenTaskStatus {
    Idle,
    Queued,
    Loading,
    Ready,
    Error,
    Cancelled,
}

impl Default for RuntimeSceneChildrenTaskStatus {
    fn default() -> Self {
        Self::Idle
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneObjectChildrenTaskState {
    pub task_id: u64,
    pub resource_revision: u64,
    pub session_key: Option<String>,
    pub parent_object_address: String,
    pub status: RuntimeSceneChildrenTaskStatus,
    pub mutation_epoch: u64,
    pub started_at: String,
    pub updated_at: String,
    pub children: Vec<RuntimeSceneNodeSummary>,
    pub total_count: usize,
    pub loaded_count: usize,
    pub next_offset: Option<usize>,
    pub error_message: Option<String>,
    pub is_stale: bool,
    pub resource_state: RuntimeSceneResourceState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneComponentsPageSnapshot {
    pub generated_at: String,
    pub object_address: String,
    pub offset: usize,
    pub total_count: usize,
    pub next_offset: Option<usize>,
    pub components: Vec<RuntimeSceneComponentSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneObjectInspectorHeaderSnapshot {
    pub generated_at: String,
    pub scene_handle: Option<i32>,
    pub scene_name: Option<String>,
    pub scene_kind: Option<RuntimeSceneKind>,
    pub object: RuntimeSceneNodeSummary,
    pub parent: Option<RuntimeSceneNodeSummary>,
    pub hierarchy_path: Vec<RuntimeSceneHierarchyPathEntry>,
    pub transform: Option<RuntimeSceneTransformSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeSceneObjectHeaderTaskStatus {
    Idle,
    Queued,
    Loading,
    Ready,
    Error,
    Cancelled,
}

impl Default for RuntimeSceneObjectHeaderTaskStatus {
    fn default() -> Self {
        Self::Idle
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneObjectHeaderTaskState {
    pub task_id: u64,
    pub resource_revision: u64,
    pub session_key: Option<String>,
    pub object_address: String,
    pub status: RuntimeSceneObjectHeaderTaskStatus,
    pub mutation_epoch: u64,
    pub started_at: String,
    pub updated_at: String,
    pub header: Option<RuntimeSceneObjectInspectorHeaderSnapshot>,
    pub error_message: Option<String>,
    pub is_stale: bool,
    pub resource_state: RuntimeSceneResourceState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeSceneObjectComponentsTaskStatus {
    Idle,
    Queued,
    Loading,
    Ready,
    Error,
    Cancelled,
}

impl Default for RuntimeSceneObjectComponentsTaskStatus {
    fn default() -> Self {
        Self::Idle
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneObjectComponentsTaskState {
    pub task_id: u64,
    pub resource_revision: u64,
    pub session_key: Option<String>,
    pub object_address: String,
    pub status: RuntimeSceneObjectComponentsTaskStatus,
    pub mutation_epoch: u64,
    pub started_at: String,
    pub updated_at: String,
    pub components: Vec<RuntimeSceneComponentSummary>,
    pub total_count: usize,
    pub loaded_count: usize,
    pub next_offset: Option<usize>,
    pub error_message: Option<String>,
    pub is_stale: bool,
    pub resource_state: RuntimeSceneResourceState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeSceneMutationOperation {
    CreateChild,
    CreateRoot,
    Duplicate,
    Delete,
    Rename,
    SetTag,
    SetLayer,
    SetHideFlags,
    Reparent,
    SetActive,
    SetTransform,
    SetBehaviourEnabled,
    AddComponent,
    RemoveComponent,
    LoadScene,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneSelectionHint {
    pub scene_handle: Option<i32>,
    pub object_address: String,
    pub ancestor_object_addresses: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneAffectedResource {
    pub resource_kind: RuntimeSceneResourceKind,
    pub object_address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneMutationResult {
    pub operation: RuntimeSceneMutationOperation,
    pub scene_handle: Option<i32>,
    pub target_object_address: Option<String>,
    pub parent_object_address: Option<String>,
    pub object: Option<RuntimeSceneNodeSummary>,
    pub deleted_object_address: Option<String>,
    pub preferred_selection_address: Option<String>,
    pub preferred_selection_hint: Option<RuntimeSceneSelectionHint>,
    pub active_self: Option<bool>,
    pub tag: Option<String>,
    pub layer: Option<i32>,
    pub hide_flags: Option<String>,
    pub behaviour_enabled: Option<bool>,
    pub hierarchy_path: Vec<RuntimeSceneHierarchyPathEntry>,
    pub transform: Option<RuntimeSceneTransformSnapshot>,
    pub affected_resources: Vec<RuntimeSceneAffectedResource>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeSceneMousePickerStatus {
    Idle,
    Armed,
    Observing,
    Cancelled,
    Error,
}

impl Default for RuntimeSceneMousePickerStatus {
    fn default() -> Self {
        Self::Idle
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneMouseTargetHit {
    pub observed_at: String,
    pub object_address: String,
    pub object_name: String,
    pub transform_address: Option<String>,
    pub scene_handle: Option<i32>,
    pub scene_name: Option<String>,
    pub scene_kind: Option<RuntimeSceneKind>,
    pub hierarchy_path: Vec<RuntimeSceneHierarchyPathEntry>,
    pub distance: Option<f32>,
    pub screen_position: RuntimeScreenPoint,
    pub client_position: RuntimeScreenPoint,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSceneMousePickerSnapshot {
    pub resource_revision: u64,
    pub session_key: Option<String>,
    pub status: RuntimeSceneMousePickerStatus,
    pub status_detail: Option<String>,
    pub is_running: bool,
    pub target_window: Option<ProcessWindowCandidate>,
    pub cursor_screen_position: Option<RuntimeScreenPoint>,
    pub cursor_client_position: Option<RuntimeScreenPoint>,
    pub cursor_inside_client: bool,
    pub hover_hit: Option<RuntimeSceneMouseTargetHit>,
    pub recent_hits: Vec<RuntimeSceneMouseTargetHit>,
    pub last_updated_at: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SceneWorkspaceState {
    pub resource_revision: u64,
    pub session_key: Option<String>,
    pub refresh_status: SceneRefreshStatus,
    pub error_message: Option<String>,
    pub mutation_epoch: u64,
    pub snapshot: Option<RuntimeSceneCatalogSnapshot>,
    pub last_updated_at: Option<String>,
    pub resource_state: RuntimeSceneResourceState,
}

fn normalize_segment(segment: &str) -> String {
    segment.trim().replace(['|', '\\'], "_")
}

pub fn create_stable_id(kind: &str, parts: &[&str]) -> StableId {
    let normalized = parts
        .iter()
        .map(|part| normalize_segment(part))
        .collect::<Vec<_>>()
        .join("|");

    format!("{kind}:{normalized}")
}

pub fn create_field_stable_id(
    class_stable_id: &StableId,
    field_name: &str,
    field_type: &str,
    field_kind: &str,
) -> StableId {
    create_stable_id(
        "field",
        &[class_stable_id.as_str(), field_kind, field_name, field_type],
    )
}
