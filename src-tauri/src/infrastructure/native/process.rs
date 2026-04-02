use crate::domain::analysis_models::RuntimeFlavor;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Module32FirstW, Module32NextW, MODULEENTRY32W,
    TH32CS_SNAPMODULE, TH32CS_SNAPMODULE32,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_OPERATION, PROCESS_VM_READ,
    PROCESS_VM_WRITE,
};

#[derive(Debug, Clone)]
pub struct NativeModuleInfo {
    pub name: String,
    pub path: String,
    pub base_address: usize,
    pub size: u32,
}

#[derive(Debug)]
pub struct ProcessHandle {
    raw: HANDLE,
    pid: u32,
}

unsafe impl Send for ProcessHandle {}
unsafe impl Sync for ProcessHandle {}

impl ProcessHandle {
    pub fn pid(&self) -> u32 {
        self.pid
    }

    pub fn raw(&self) -> HANDLE {
        self.raw
    }
}

impl Drop for ProcessHandle {
    fn drop(&mut self) {
        if !self.raw.is_invalid() {
            unsafe {
                let _ = CloseHandle(self.raw);
            }
        }
    }
}

pub fn open_process(pid: u32) -> Result<ProcessHandle, String> {
    let desired_access = PROCESS_QUERY_INFORMATION | PROCESS_VM_READ | PROCESS_VM_WRITE | PROCESS_VM_OPERATION;
    let handle = unsafe { OpenProcess(desired_access, false, pid) }
        .map_err(|error| format!("Failed to open process {}: {}", pid, error.message()))?;

    Ok(ProcessHandle { raw: handle, pid })
}

pub fn enumerate_modules(pid: u32) -> Result<Vec<NativeModuleInfo>, String> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid) }
        .map_err(|error| format!("Failed to create module snapshot for process {}: {}", pid, error.message()))?;

    let mut modules = Vec::new();
    let mut entry = MODULEENTRY32W {
        dwSize: std::mem::size_of::<MODULEENTRY32W>() as u32,
        ..Default::default()
    };

    let mut has_entry = unsafe { Module32FirstW(snapshot, &mut entry) }.is_ok();
    while has_entry {
        modules.push(NativeModuleInfo {
            name: wide_string(&entry.szModule),
            path: wide_string(&entry.szExePath),
            base_address: entry.modBaseAddr as usize,
            size: entry.modBaseSize,
        });
        has_entry = unsafe { Module32NextW(snapshot, &mut entry) }.is_ok();
    }

    unsafe {
        let _ = CloseHandle(snapshot);
    }

    Ok(modules)
}

pub fn detect_runtime_flavor(pid: u32) -> Result<RuntimeFlavor, String> {
    let modules = enumerate_modules(pid)?;
    for module in modules {
        let lower = module.name.to_ascii_lowercase();
        if lower == "gameassembly.dll" {
            return Ok(RuntimeFlavor::Il2cpp);
        }
        if lower.contains("mono") {
            return Ok(RuntimeFlavor::Mono);
        }
    }

    Ok(RuntimeFlavor::Unknown)
}

fn wide_string(buffer: &[u16]) -> String {
    let len = buffer.iter().position(|value| *value == 0).unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..len])
}