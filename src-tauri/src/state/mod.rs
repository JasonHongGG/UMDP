use crate::domain::analysis_models::{AnalysisSnapshot, ProcessSession, RuntimeFlavor};
use crate::domain::bridge_protocol::BridgeOperation;
use crate::domain::workspace::{
    RuntimeCapability, RuntimeSessionState, RuntimeSessionStatus, WorkspaceLifecycleState,
    WorkspaceLifecycleStatus,
};
use parking_lot::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

#[derive(Default)]
pub struct AnalysisState {
    process_session: Mutex<Option<ProcessSession>>,
    metadata_snapshot: Mutex<Option<AnalysisSnapshot>>,
}

impl AnalysisState {
    pub fn process_session(&self) -> Option<ProcessSession> {
        self.process_session.lock().clone()
    }

    pub fn set_process_session(&self, process: ProcessSession) {
        *self.process_session.lock() = Some(process);
    }

    pub fn metadata_snapshot(&self) -> Option<AnalysisSnapshot> {
        self.metadata_snapshot.lock().clone()
    }

    pub fn set_metadata_snapshot(&self, snapshot: AnalysisSnapshot) {
        *self.metadata_snapshot.lock() = Some(snapshot);
    }

    pub fn clear_metadata(&self) {
        self.metadata_snapshot.lock().take();
    }
}

struct PersistentBridgeSession {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    executable_path: PathBuf,
}

static BRIDGE_REQUEST_COUNTER: AtomicU64 = AtomicU64::new(1);

fn next_bridge_correlation_id() -> String {
    format!(
        "bridge-{}-{}",
        std::process::id(),
        BRIDGE_REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

impl PersistentBridgeSession {
    fn spawn(executable_path: PathBuf) -> Result<Self, String> {
        let mut child = Command::new(&executable_path)
            .arg("--session")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Failed to launch persistent bridge session: {error}"))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Persistent bridge session stdin is unavailable".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Persistent bridge session stdout is unavailable".to_string())?;

        Ok(Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            executable_path,
        })
    }

    fn is_alive(&mut self) -> Result<bool, String> {
        match self
            .child
            .try_wait()
            .map_err(|error| format!("Failed to query persistent bridge session status: {error}"))?
        {
            Some(_) => Ok(false),
            None => Ok(true),
        }
    }

    fn read_response(&mut self) -> Result<(String, String), String> {
        let mut status = String::new();
        let mut payload = String::new();
        self.stdout
            .read_line(&mut status)
            .map_err(|error| format!("Failed to read bridge response status: {error}"))?;
        self.stdout
            .read_line(&mut payload)
            .map_err(|error| format!("Failed to read bridge response payload: {error}"))?;

        if status.is_empty() {
            return Err("Persistent bridge session closed unexpectedly".to_string());
        }

        Ok((
            status.trim_end_matches(['\r', '\n']).to_string(),
            payload.trim_end_matches(['\r', '\n']).to_string(),
        ))
    }

    fn read_response_line(&mut self, label: &str) -> Result<String, String> {
        let mut value = String::new();
        self.stdout
            .read_line(&mut value)
            .map_err(|error| format!("Failed to read bridge response {label}: {error}"))?;

        if value.is_empty() {
            return Err("Persistent bridge session closed unexpectedly".to_string());
        }

        Ok(value.trim_end_matches(['\r', '\n']).to_string())
    }

    fn ping(&mut self) -> Result<(), String> {
        writeln!(self.stdin, "PING").map_err(|error| format!("Failed to write bridge health check: {error}"))?;
        self.stdin
            .flush()
            .map_err(|error| format!("Failed to flush bridge health check: {error}"))?;

        let (status, payload) = self.read_response()?;
        if status == "OK" && payload == "PONG" {
            return Ok(());
        }

        Err(format!(
            "Unexpected persistent bridge health check response: status={status}, payload={payload}"
        ))
    }

    fn execute(&mut self, operation: &BridgeOperation, args: &[String]) -> Result<Vec<u8>, String> {
        let correlation_id = next_bridge_correlation_id();
        writeln!(self.stdin, "REQ2").map_err(|error| format!("Failed to write bridge request preamble: {error}"))?;
        writeln!(self.stdin, "{correlation_id}")
            .map_err(|error| format!("Failed to write bridge request correlation id: {error}"))?;
        writeln!(self.stdin, "{}", operation.as_protocol_name())
            .map_err(|error| format!("Failed to write bridge request operation: {error}"))?;
        writeln!(self.stdin, "{}", args.len()).map_err(|error| format!("Failed to write bridge request size: {error}"))?;
        for arg in args {
            if arg.contains(['\n', '\r']) {
                return Err("Bridge request argument contains an unsupported newline".to_string());
            }
            writeln!(self.stdin, "{arg}").map_err(|error| format!("Failed to write bridge request argument: {error}"))?;
        }
        self.stdin.flush().map_err(|error| format!("Failed to flush persistent bridge request: {error}"))?;

        let (status, payload) = self.read_response()?;
        if status == "OK2" || status == "ERR2" {
            let response_correlation_id = payload;
            let body_payload = self.read_response_line("payload")?;
            if response_correlation_id != correlation_id {
                return Err(format!(
                    "Persistent bridge response correlation mismatch: expected={correlation_id}, actual={response_correlation_id}"
                ));
            }

            return match status.as_str() {
                "OK2" => Ok(body_payload.as_bytes().to_vec()),
                "ERR2" => Err(body_payload),
                _ => Err(format!("Unexpected persistent bridge response status: {status}")),
            };
        }

        match status.as_str() {
            "OK" => Ok(payload.as_bytes().to_vec()),
            "ERR" => Err(payload),
            other => Err(format!("Unexpected persistent bridge response status: {other}")),
        }
    }

    fn shutdown(&mut self) {
        let _ = writeln!(self.stdin, "QUIT");
        let _ = self.stdin.flush();
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for PersistentBridgeSession {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[derive(Default)]
pub struct BridgeClientState {
    session: Mutex<Option<PersistentBridgeSession>>,
}

impl BridgeClientState {
    pub fn ensure_runtime_session(&self, executable_path: PathBuf) -> Result<(), String> {
        let mut session = self.session.lock();
        let needs_restart = match session.as_mut() {
            Some(existing) if existing.executable_path == executable_path => {
                if !existing.is_alive()? {
                    true
                } else {
                    existing.ping().is_err()
                }
            }
            Some(_) => true,
            None => true,
        };

        if needs_restart {
            session.take();
            *session = Some(PersistentBridgeSession::spawn(executable_path)?);
        }

        Ok(())
    }

    pub fn execute_runtime_request(
        &self,
        executable_path: PathBuf,
        operation: BridgeOperation,
        args: &[String],
    ) -> Result<Vec<u8>, String> {
        self.ensure_runtime_session(executable_path.clone())?;

        let first_attempt = {
            let mut session = self.session.lock();
            let active = session
                .as_mut()
                .ok_or_else(|| "Persistent bridge session is not available".to_string())?;
            if active.executable_path != executable_path {
                return Err("Persistent bridge session executable changed unexpectedly".to_string());
            }

            active.execute(&operation, args)
        };

        match first_attempt {
            Ok(payload) => Ok(payload),
            Err(error) if should_retry_runtime_request(&error) => {
                let mut session = self.session.lock();
                session.take();
                *session = Some(PersistentBridgeSession::spawn(executable_path.clone())?);

                let active = session
                    .as_mut()
                    .ok_or_else(|| "Persistent bridge session could not be restarted".to_string())?;

                active.execute(&operation, args).map_err(|retry_error| {
                    format!(
                        "{retry_error} (retry after restarting runtime bridge session from initial error: {error})"
                    )
                })
            }
            Err(error) => Err(error),
        }
    }

    pub fn reset(&self) {
        self.session.lock().take();
    }

    pub fn is_connected(&self) -> bool {
        self.session.lock().is_some()
    }
}

fn should_retry_runtime_request(error: &str) -> bool {
    error.contains("Failed to write bridge")
        || error.contains("Failed to flush persistent bridge")
        || error.contains("Failed to read bridge response")
        || error.contains("Persistent bridge session closed unexpectedly")
        || error.contains("Unexpected persistent bridge response")
    || error.contains("correlation mismatch")
        || error.contains("health check")
}

#[derive(Default)]
pub struct WorkspaceState {
    lifecycle: Mutex<WorkspaceLifecycleState>,
}

impl WorkspaceState {
    pub fn current(&self) -> WorkspaceLifecycleState {
        self.lifecycle.lock().clone()
    }

    pub fn set_attaching(&self) {
        let mut lifecycle = self.lifecycle.lock();
        lifecycle.status = WorkspaceLifecycleStatus::Attaching;
        lifecycle.error_message = None;
        lifecycle.runtime_session.status = RuntimeSessionStatus::Starting;
        lifecycle.runtime_session.bridge_connected = false;
        lifecycle.runtime_session.last_error = None;
    }

    pub fn set_attached_without_snapshot(&self, process_session: ProcessSession) {
        let mut lifecycle = self.lifecycle.lock();
        lifecycle.status = WorkspaceLifecycleStatus::AttachedWithoutSnapshot;
        lifecycle.runtime = process_session.runtime.clone();
        lifecycle.process_session = Some(process_session);
        lifecycle.has_snapshot = false;
        lifecycle.error_message = None;
        lifecycle.runtime_session = RuntimeSessionState {
            status: RuntimeSessionStatus::Starting,
            runtime: lifecycle.runtime.clone(),
            capabilities: runtime_capabilities_for(&lifecycle.runtime),
            bridge_connected: false,
            session_key: lifecycle.process_session.as_ref().map(runtime_session_key_for),
            last_error: None,
            last_heartbeat_at: None,
        };
    }

    pub fn set_snapshot_loading(&self, process_session: Option<ProcessSession>) {
        let mut lifecycle = self.lifecycle.lock();
        lifecycle.status = WorkspaceLifecycleStatus::SnapshotLoading;
        if let Some(process_session) = process_session {
            lifecycle.runtime = process_session.runtime.clone();
            lifecycle.process_session = Some(process_session);
        }
        lifecycle.has_snapshot = false;
        lifecycle.error_message = None;
        lifecycle.runtime_session.status = RuntimeSessionStatus::Starting;
        lifecycle.runtime_session.runtime = lifecycle.runtime.clone();
        lifecycle.runtime_session.capabilities = runtime_capabilities_for(&lifecycle.runtime);
        lifecycle.runtime_session.session_key = lifecycle.process_session.as_ref().map(runtime_session_key_for);
    }

    pub fn set_ready(&self, process_session: Option<ProcessSession>) {
        let mut lifecycle = self.lifecycle.lock();
        lifecycle.status = WorkspaceLifecycleStatus::Ready;
        if let Some(process_session) = process_session {
            lifecycle.runtime = process_session.runtime.clone();
            lifecycle.process_session = Some(process_session);
        }
        lifecycle.has_snapshot = true;
        lifecycle.error_message = None;
        lifecycle.runtime_session.status = RuntimeSessionStatus::Ready;
        lifecycle.runtime_session.runtime = lifecycle.runtime.clone();
        lifecycle.runtime_session.capabilities = runtime_capabilities_for(&lifecycle.runtime);
        lifecycle.runtime_session.bridge_connected = true;
        lifecycle.runtime_session.session_key = lifecycle.process_session.as_ref().map(runtime_session_key_for);
        lifecycle.runtime_session.last_error = None;
    }

    pub fn set_bridge_error(&self, error_message: impl Into<String>) {
        let mut lifecycle = self.lifecycle.lock();
        let error_message = error_message.into();
        lifecycle.status = if lifecycle.process_session.is_some() {
            WorkspaceLifecycleStatus::Recovering
        } else {
            WorkspaceLifecycleStatus::BridgeError
        };
        lifecycle.error_message = Some(error_message.clone());
        lifecycle.runtime_session.status = if lifecycle.process_session.is_some() {
            RuntimeSessionStatus::Recovering
        } else {
            RuntimeSessionStatus::Error
        };
        lifecycle.runtime_session.bridge_connected = false;
        lifecycle.runtime_session.last_error = Some(error_message);
    }

    pub fn mark_runtime_bridge_connected(&self) -> RuntimeSessionState {
        let mut lifecycle = self.lifecycle.lock();
        if lifecycle.runtime_session.session_key.is_none() {
            lifecycle.runtime_session.session_key = lifecycle.process_session.as_ref().map(runtime_session_key_for);
        }
        lifecycle.runtime_session.bridge_connected = true;
        lifecycle.runtime_session.last_error = None;
        lifecycle.runtime_session.last_heartbeat_at = Some(crate::services::analysis::bridge_gateway::current_timestamp());
        lifecycle.runtime_session.clone()
    }

    pub fn touch_runtime_session(&self) -> RuntimeSessionState {
        let mut lifecycle = self.lifecycle.lock();
        let runtime = lifecycle.process_session.as_ref().map(|session| session.runtime.clone()).unwrap_or_else(|| lifecycle.runtime.clone());
        lifecycle.runtime_session.runtime = runtime.clone();
        lifecycle.runtime_session.capabilities = runtime_capabilities_for(&runtime);
        if lifecycle.runtime_session.session_key.is_none() {
            lifecycle.runtime_session.session_key = lifecycle.process_session.as_ref().map(runtime_session_key_for);
        }
        lifecycle.runtime_session.last_heartbeat_at = Some(crate::services::analysis::bridge_gateway::current_timestamp());
        if lifecycle.runtime_session.status == RuntimeSessionStatus::Starting && lifecycle.has_snapshot {
            lifecycle.runtime_session.status = RuntimeSessionStatus::Ready;
            lifecycle.runtime_session.bridge_connected = true;
        }
        lifecycle.runtime_session.clone()
    }
}

fn runtime_session_key_for(process_session: &ProcessSession) -> String {
    format!("{}:{}:{:?}", process_session.pid, process_session.process_name, process_session.runtime)
}

fn runtime_capabilities_for(runtime: &RuntimeFlavor) -> Vec<RuntimeCapability> {
    match runtime {
        RuntimeFlavor::Mono | RuntimeFlavor::Il2cpp => vec![
            RuntimeCapability::Metadata,
            RuntimeCapability::PreviewQuery,
            RuntimeCapability::Execution,
            RuntimeCapability::FieldRead,
            RuntimeCapability::FieldWrite,
            RuntimeCapability::MethodInvoke,
        ],
        RuntimeFlavor::Unknown => vec![RuntimeCapability::Metadata],
    }
}

#[derive(Default)]
pub struct AppState {
    pub analysis: AnalysisState,
    pub bridge: BridgeClientState,
    pub workspace: WorkspaceState,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::analysis_models::{ProcessSession, RuntimeFlavor};

    fn sample_session() -> ProcessSession {
        ProcessSession {
            pid: 777,
            process_name: "Unity.exe".to_string(),
            exe_path: "C:/Game/Unity.exe".to_string(),
            data_dir: Some("C:/Game/Unity_Data".to_string()),
            managed_dir: Some("C:/Game/Unity_Data/Managed".to_string()),
            runtime: RuntimeFlavor::Mono,
        }
    }

    #[test]
    fn workspace_marks_recovering_after_bridge_error_when_attached() {
        let workspace = WorkspaceState::default();
        workspace.set_attached_without_snapshot(sample_session());
        workspace.set_bridge_error("bridge dropped");

        let current = workspace.current();
        assert_eq!(current.status, WorkspaceLifecycleStatus::Recovering);
        assert_eq!(current.runtime_session.status, RuntimeSessionStatus::Recovering);
        assert!(!current.runtime_session.bridge_connected);
        assert_eq!(current.runtime_session.last_error.as_deref(), Some("bridge dropped"));
    }

    #[test]
    fn workspace_marks_bridge_connected_and_heartbeats() {
        let workspace = WorkspaceState::default();
        workspace.set_attached_without_snapshot(sample_session());

        let connected = workspace.mark_runtime_bridge_connected();
        assert!(connected.bridge_connected);
        assert!(connected.last_heartbeat_at.is_some());
        assert_eq!(connected.session_key.as_deref(), Some("777:Unity.exe:Mono"));
    }

    #[test]
    fn runtime_request_retry_only_triggers_for_transport_failures() {
        assert!(should_retry_runtime_request("Failed to read bridge response payload"));
        assert!(should_retry_runtime_request("Persistent bridge session closed unexpectedly"));
        assert!(!should_retry_runtime_request("runtime exception"));
        assert!(!should_retry_runtime_request("method invocation failed"));
    }
}
