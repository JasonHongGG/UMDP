use crate::domain::analysis_models::{ProcessSession, RuntimeFlavor};
use crate::domain::operation::{OperationError, OperationResult};
use crate::state::AppState;
use std::path::{Path, PathBuf};
use sysinfo::System;

fn same_metadata_source(left: &ProcessSession, right: &ProcessSession) -> bool {
    left.pid == right.pid
        && left.exe_path == right.exe_path
        && left.data_dir == right.data_dir
        && left.managed_dir == right.managed_dir
        && left.runtime == right.runtime
}

pub fn attach_to_process(
    state: &AppState,
    pid: u32,
    name: String,
) -> OperationResult<ProcessSession> {
    let mut sys = System::new_all();
    sys.refresh_processes();

    let process = sys
        .process(sysinfo::Pid::from_u32(pid))
        .ok_or_else(|| OperationError::process_not_found(pid, &name))?;

    let exe_path = process
        .exe()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default();

    let data_dir = derive_data_dir(&exe_path);
    let managed_dir = data_dir.as_deref().and_then(derive_managed_dir);
    let runtime = detect_runtime(data_dir.as_deref(), managed_dir.as_deref());

    let session = ProcessSession {
        pid,
        process_name: name,
        exe_path,
        data_dir: data_dir.clone(),
        managed_dir: managed_dir.clone(),
        runtime,
    };

    let preserve_metadata = state
        .workspace()
        .lifecycle()
        .process_session()
        .as_ref()
        .is_some_and(|existing| same_metadata_source(existing, &session))
        && state.workspace().lifecycle().metadata_snapshot().is_some();

    if !preserve_metadata {
        state.workspace().lifecycle().clear_metadata();
    }

    Ok(session)
}

fn derive_data_dir(exe_path: &str) -> Option<String> {
    let exe = PathBuf::from(exe_path);
    let stem = exe.file_stem()?.to_string_lossy();
    let parent = exe.parent()?;
    let data_dir = parent.join(format!("{}_Data", stem));
    if data_dir.is_dir() {
        Some(data_dir.to_string_lossy().to_string())
    } else {
        None
    }
}

fn derive_managed_dir(data_dir: &str) -> Option<String> {
    let managed_dir = Path::new(data_dir).join("Managed");
    if managed_dir.is_dir() {
        Some(managed_dir.to_string_lossy().to_string())
    } else {
        None
    }
}

fn detect_runtime(data_dir: Option<&str>, managed_dir: Option<&str>) -> RuntimeFlavor {
    let Some(dir) = data_dir else {
        return RuntimeFlavor::Unknown;
    };

    let data_path = Path::new(dir);
    let mono_bleeding = data_path.join("MonoBleedingEdge");
    let game_assembly = data_path.join(r"..\GameAssembly.dll");
    let global_metadata = data_path.join(r"il2cpp_data\Metadata\global-metadata.dat");

    if game_assembly.exists() && global_metadata.exists() {
        RuntimeFlavor::Il2cpp
    } else if mono_bleeding.exists() || managed_dir.is_some() {
        RuntimeFlavor::Mono
    } else {
        RuntimeFlavor::Unknown
    }
}