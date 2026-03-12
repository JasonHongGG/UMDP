use crate::models::{AttachResponse, AttachedProcess, ProcessInfo};
use crate::state::AppState;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use sysinfo::System;
use tauri::State;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible};

pub fn fetch_system_processes() -> Vec<ProcessInfo> {
    let mut app_pids = HashSet::new();

    struct EnumState<'a> {
        pids: &'a mut HashSet<u32>,
    }

    unsafe extern "system" fn enum_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
        if IsWindowVisible(hwnd).as_bool() {
            let length = GetWindowTextLengthW(hwnd);
            if length > 0 {
                let mut pid = 0;
                GetWindowThreadProcessId(hwnd, Some(&mut pid));
                if pid > 0 {
                    let state = &mut *(lparam.0 as *mut EnumState);
                    state.pids.insert(pid);
                }
            }
        }
        BOOL(1)
    }

    let mut state = EnumState { pids: &mut app_pids };
    unsafe {
        let _ = EnumWindows(Some(enum_window), LPARAM(&mut state as *mut _ as isize));
    }

    let mut sys = System::new_all();
    sys.refresh_processes();

    let mut processes: Vec<ProcessInfo> = sys
        .processes()
        .iter()
        .filter(|(pid, _)| app_pids.contains(&pid.as_u32()))
        .map(|(pid, process)| ProcessInfo {
            pid: pid.as_u32(),
            name: process.name().to_string(),
        })
        .collect();

    processes.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    processes
}

pub fn attach_to_process(state: State<'_, AppState>, pid: u32, name: String) -> Result<AttachResponse, String> {
    let mut sys = System::new_all();
    sys.refresh_processes();

    let process = sys
        .process(sysinfo::Pid::from_u32(pid))
        .ok_or_else(|| format!("Process {} ({}) not found", name, pid))?;

    let exe_path = process
        .exe()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default();

    let managed_dir = derive_managed_dir(&exe_path);
    let runtime = detect_runtime(&managed_dir);

    {
        let mut attached = state.attached_process.lock();
        *attached = Some(AttachedProcess {
            pid,
            managed_dir: managed_dir.clone(),
            runtime: runtime.clone(),
        });
    }

    state.metadata.lock().take();

    Ok(AttachResponse {
        attached: true,
        process_name: name,
        process_id: pid,
        exe_path,
        managed_dir,
        runtime,
    })
}

fn derive_managed_dir(exe_path: &str) -> Option<String> {
    let exe = PathBuf::from(exe_path);
    let stem = exe.file_stem()?.to_string_lossy();
    let parent = exe.parent()?;
    let data_dir = parent.join(format!("{}_Data", stem));
    let managed_dir = data_dir.join("Managed");
    if managed_dir.is_dir() {
        Some(managed_dir.to_string_lossy().to_string())
    } else {
        None
    }
}

fn detect_runtime(managed_dir: &Option<String>) -> String {
    let Some(dir) = managed_dir else {
        return "Unknown".to_string();
    };

    let managed_path = Path::new(dir);
    let mono_bleeding = managed_path.join(r"..\..\MonoBleedingEdge");
    let game_assembly = managed_path.join(r"..\..\GameAssembly.dll");

    if mono_bleeding.exists() {
        "Mono".to_string()
    } else if game_assembly.exists() {
        "IL2CPP".to_string()
    } else {
        "Unknown".to_string()
    }
}
