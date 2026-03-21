use crate::domain::bridge_protocol::BridgeOperation;
use crate::services::analysis::executable_resolver::find_bundled_executable;
use serde::de::DeserializeOwned;
use std::process::Command;
use tauri::AppHandle;

pub struct ProcessBridgeRequest {
    pub operation: BridgeOperation,
    pub executable_name: &'static str,
    pub args: Vec<String>,
}

pub fn execute_json<T>(app: &AppHandle, request: ProcessBridgeRequest) -> Result<T, String>
where
    T: DeserializeOwned,
{
    let helper_executable = find_bundled_executable(app, request.executable_name)?;
    let operation_name = format!("{:?}", request.operation);
    let output = Command::new(&helper_executable)
        .args(&request.args)
        .output()
        .map_err(|error| format!("Failed to launch {operation_name} bridge process: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{operation_name} bridge process failed: {}", stderr.trim()));
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Failed to parse {operation_name} bridge response: {error}"))
}
