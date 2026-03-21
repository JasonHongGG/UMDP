use crate::domain::analysis_models::{AnalysisSnapshot, ProcessSession, RuntimeFlavor};
use crate::domain::workspace::{
    RuntimeCapability, RuntimeSessionState, RuntimeSessionStatus, WorkspaceLifecycleState,
    WorkspaceLifecycleStatus,
};
use parking_lot::Mutex;
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

    fn execute(&mut self, args: &[String]) -> Result<Vec<u8>, String> {
        writeln!(self.stdin, "REQ").map_err(|error| format!("Failed to write bridge request preamble: {error}"))?;
        writeln!(self.stdin, "{}", args.len()).map_err(|error| format!("Failed to write bridge request size: {error}"))?;
        for arg in args {
            if arg.contains(['\n', '\r']) {
                return Err("Bridge request argument contains an unsupported newline".to_string());
            }
            writeln!(self.stdin, "{arg}").map_err(|error| format!("Failed to write bridge request argument: {error}"))?;
        }
        self.stdin.flush().map_err(|error| format!("Failed to flush persistent bridge request: {error}"))?;

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

        let status = status.trim_end_matches(['\r', '\n']);
        let payload = payload.trim_end_matches(['\r', '\n']);
        match status {
            "OK" => Ok(payload.as_bytes().to_vec()),
            "ERR" => Err(payload.to_string()),
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
            Some(existing) if existing.executable_path == executable_path => !existing.is_alive()?,
            Some(_) => true,
            None => true,
        };

        if needs_restart {
            session.take();
            *session = Some(PersistentBridgeSession::spawn(executable_path)?);
        }

        Ok(())
    }

    pub fn execute_runtime_request(&self, executable_path: PathBuf, args: &[String]) -> Result<Vec<u8>, String> {
        self.ensure_runtime_session(executable_path.clone())?;
        let mut session = self.session.lock();
        let active = session
            .as_mut()
            .ok_or_else(|| "Persistent bridge session is not available".to_string())?;
        if active.executable_path != executable_path {
            return Err("Persistent bridge session executable changed unexpectedly".to_string());
        }

        active.execute(args)
    }

    pub fn reset(&self) {
        self.session.lock().take();
    }

    pub fn is_connected(&self) -> bool {
        self.session.lock().is_some()
    }
}

#[derive(Default)]
pub struct WorkspaceState {
    lifecycle: Mutex<WorkspaceLifecycleState>,
}

impl WorkspaceState {
    pub fn current(&self) -> WorkspaceLifecycleState {
        self.lifecycle.lock().clone()
    }

    pub fn set_selecting_process(&self) {
        let mut lifecycle = self.lifecycle.lock();
        lifecycle.status = WorkspaceLifecycleStatus::SelectingProcess;
        lifecycle.error_message = None;
        lifecycle.runtime_session.status = RuntimeSessionStatus::Idle;
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

    pub fn reset(&self) {
        let mut lifecycle = self.lifecycle.lock();
        *lifecycle = WorkspaceLifecycleState {
            status: WorkspaceLifecycleStatus::Detached,
            process_session: None,
            runtime: RuntimeFlavor::Unknown,
            has_snapshot: false,
            error_message: None,
            runtime_session: RuntimeSessionState::default(),
        };
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
