use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub type StableId = String;

#[derive(Debug, Clone, Serialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub legacy_image_id: String,
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
    pub legacy_field_name: String,
    pub name: String,
    pub field_type: String,
    pub offset: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaticFieldDescriptor {
    pub stable_id: StableId,
    pub legacy_field_name: String,
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
    pub legacy_field_name: String,
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
    pub legacy_class_id: String,
    pub legacy_image_id: String,
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
    pub error: Option<String>,
    pub exception: Option<String>,
    pub result: Option<RuntimeMethodInvokeValue>,
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