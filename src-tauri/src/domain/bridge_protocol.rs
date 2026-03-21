use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BridgeOperation {
    ProcessFetch,
    ProcessAttach,
    AnalysisSnapshotLoad,
    AnalysisOverlayLoad,
    RuntimeFieldRead,
    RuntimeFieldWrite,
    RuntimeMethodInvoke,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeCommandEnvelope {
    pub schema_version: u32,
    pub command_version: u32,
    pub operation: BridgeOperation,
    pub request_id: String,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeError {
    pub code: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeResponseEnvelope {
    pub schema_version: u32,
    pub command_version: u32,
    pub request_id: String,
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<BridgeError>,
}
