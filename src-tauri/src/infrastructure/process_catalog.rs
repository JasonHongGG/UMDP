use crate::domain::analysis_models::ProcessInfo;
use std::collections::HashSet;
use sysinfo::System;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible,
};

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

    let mut state = EnumState {
        pids: &mut app_pids,
    };
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