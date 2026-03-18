#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub type StableId = String;

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
pub struct MethodDescriptor {
    pub stable_id: StableId,
    pub name: String,
    pub signature: String,
    pub tags: Vec<String>,
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