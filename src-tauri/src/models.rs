use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InheritanceNode {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StaticFieldInfo {
    pub name: String,
    pub field_type: String,
    pub address: Option<String>,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldInfo {
    pub offset: Option<String>,
    pub name: String,
    pub field_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MethodInfo {
    pub name: String,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassInfo {
    pub id: String,
    pub name: String,
    pub namespace: String,
    pub full_name: String,
    pub inheritance: Vec<InheritanceNode>,
    pub static_fields: Vec<StaticFieldInfo>,
    pub fields: Vec<FieldInfo>,
    pub methods: Vec<MethodInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageInfo {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassSummary {
    pub id: String,
    pub name: String,
    pub namespace: String,
    pub full_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeClassOverlayResponse {
    pub static_fields: Vec<StaticFieldInfo>,
    pub fields: Vec<FieldInfo>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AttachResponse {
    pub attached: bool,
    pub process_name: String,
    pub process_id: u32,
    pub exe_path: String,
    pub data_dir: Option<String>,
    pub managed_dir: Option<String>,
    pub runtime: String,
}

#[derive(Debug, Clone)]
pub struct AttachedProcess {
    pub pid: u32,
    pub data_dir: Option<String>,
    pub managed_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DumpAllResponse {
    pub images: Vec<ImageInfo>,
    #[serde(rename = "classesByImage")]
    pub classes_by_image: HashMap<String, Vec<ClassSummary>>,
    #[serde(rename = "classDetails")]
    pub class_details: HashMap<String, ClassInfo>,
}
