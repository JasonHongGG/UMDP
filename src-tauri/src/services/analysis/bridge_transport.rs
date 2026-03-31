use crate::domain::bridge_protocol::BridgeOperation;
use crate::services::analysis::executable_resolver::find_bundled_executable;
use crate::state::AppState;
use serde::de::DeserializeOwned;
use std::process::Command;
use tauri::AppHandle;

pub struct BridgeRequest {
    pub operation: BridgeOperation,
    pub executable_name: &'static str,
    pub args: Vec<String>,
}

pub trait BridgeTransport {
    fn execute_raw(&self, app: &AppHandle, request: &BridgeRequest) -> Result<Vec<u8>, String>;
}

pub struct ProcessBridgeTransport;

impl BridgeTransport for ProcessBridgeTransport {
    fn execute_raw(&self, app: &AppHandle, request: &BridgeRequest) -> Result<Vec<u8>, String> {
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

        Ok(output.stdout)
    }
}

pub struct AppBridgeTransport<'a> {
    state: &'a AppState,
}

impl<'a> AppBridgeTransport<'a> {
    pub fn new(state: &'a AppState) -> Self {
        Self { state }
    }
}

impl BridgeTransport for AppBridgeTransport<'_> {
    fn execute_raw(&self, app: &AppHandle, request: &BridgeRequest) -> Result<Vec<u8>, String> {
        if request.executable_name == "UnityMonoBridge.exe" {
            let executable = find_bundled_executable(app, request.executable_name)?;
            return self
                .state
                .runtime_infra
                .bridge
                .execute_runtime_request(executable, request.operation.clone(), &request.args);
        }

        ProcessBridgeTransport.execute_raw(app, request)
    }
}

pub fn execute_json_with<T>(transport: &impl BridgeTransport, app: &AppHandle, request: BridgeRequest) -> Result<T, String>
where
    T: DeserializeOwned,
{
    let operation_name = format!("{:?}", request.operation);
    let raw = transport.execute_raw(app, &request)?;

    serde_json::from_slice(&raw).map_err(|error| format!("Failed to parse {operation_name} bridge response: {error}"))
}
