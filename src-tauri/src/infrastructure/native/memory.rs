use crate::infrastructure::native::process::ProcessHandle;
use std::sync::Arc;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Diagnostics::Debug::{ReadProcessMemory, WriteProcessMemory};
use windows::Win32::System::Memory::{
    VirtualAllocEx, VirtualFreeEx, VirtualProtectEx, MEM_COMMIT, MEM_RELEASE, MEM_RESERVE,
    PAGE_READWRITE,
};
use windows::Win32::System::Threading::{CreateRemoteThread, WaitForSingleObject, INFINITE};

#[derive(Debug, Clone)]
pub struct RemoteAllocation {
    memory: RemoteMemory,
    pub address: usize,
    pub size: usize,
}

impl Drop for RemoteAllocation {
    fn drop(&mut self) {
        let _ = self.memory.free_address(self.address);
    }
}

#[derive(Debug, Clone)]
pub struct RemoteUtf8String {
    allocation: RemoteAllocation,
}

impl RemoteUtf8String {
    pub fn new(memory: &RemoteMemory, value: &str) -> Result<Self, String> {
        let mut bytes = value.as_bytes().to_vec();
        bytes.push(0);
        let allocation = memory.allocate(bytes.len(), PAGE_READWRITE.0)?;
        memory.write_bytes(allocation.address, &bytes)?;
        Ok(Self { allocation })
    }

    pub fn address(&self) -> usize {
        self.allocation.address
    }
}

#[derive(Debug, Clone)]
pub struct RemoteMemory {
    process: Arc<ProcessHandle>,
}

impl RemoteMemory {
    pub fn open(pid: u32) -> Result<Self, String> {
        let process = Arc::new(crate::infrastructure::native::process::open_process(pid)?);
        Ok(Self { process })
    }

    pub fn process(&self) -> &ProcessHandle {
        self.process.as_ref()
    }

    pub fn allocate(&self, size: usize, protection: u32) -> Result<RemoteAllocation, String> {
        let address = unsafe {
            VirtualAllocEx(
                self.process.raw(),
                None,
                size,
                MEM_COMMIT | MEM_RESERVE,
                windows::Win32::System::Memory::PAGE_PROTECTION_FLAGS(protection),
            )
        } as usize;

        if address == 0 {
            return Err(format!(
                "Failed to allocate remote memory for process {} (size={})",
                self.process.pid(),
                size
            ));
        }

        Ok(RemoteAllocation {
            memory: self.clone(),
            address,
            size,
        })
    }

    pub fn protect(&self, address: usize, size: usize, protection: u32) -> Result<u32, String> {
        let mut previous = windows::Win32::System::Memory::PAGE_PROTECTION_FLAGS(0);
        unsafe {
            VirtualProtectEx(
                self.process.raw(),
                address as _,
                size,
                windows::Win32::System::Memory::PAGE_PROTECTION_FLAGS(protection),
                &mut previous,
            )
        }
        .map_err(|error| {
            format!(
                "Failed to change process memory protection at 0x{address:X}: {}",
                error.message()
            )
        })?;
        Ok(previous.0)
    }

    pub fn free_address(&self, address: usize) -> Result<(), String> {
        unsafe { VirtualFreeEx(self.process.raw(), address as _, 0, MEM_RELEASE) }
            .map_err(|error| format!("Failed to free remote allocation at 0x{address:X}: {}", error.message()))?;
        Ok(())
    }

    pub fn read_bytes(&self, address: usize, size: usize) -> Result<Vec<u8>, String> {
        let mut buffer = vec![0u8; size];
        let mut bytes_read = 0;
        unsafe {
            ReadProcessMemory(
                self.process.raw(),
                address as _,
                buffer.as_mut_ptr() as _,
                size,
                Some(&mut bytes_read),
            )
        }
        .map_err(|error| format!("Failed to read process memory at 0x{address:X}: {}", error.message()))?;
        buffer.truncate(bytes_read);
        Ok(buffer)
    }

    pub fn read_value<T: Copy>(&self, address: usize) -> Result<T, String> {
        let bytes = self.read_bytes(address, std::mem::size_of::<T>())?;
        if bytes.len() != std::mem::size_of::<T>() {
            return Err(format!(
                "Failed to read complete value at 0x{address:X}: {} of {} bytes",
                bytes.len(),
                std::mem::size_of::<T>()
            ));
        }

        let mut value = std::mem::MaybeUninit::<T>::uninit();
        unsafe {
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), value.as_mut_ptr() as *mut u8, bytes.len());
            Ok(value.assume_init())
        }
    }

    pub fn write_bytes(&self, address: usize, data: &[u8]) -> Result<(), String> {
        let mut bytes_written = 0;
        unsafe {
            WriteProcessMemory(
                self.process.raw(),
                address as _,
                data.as_ptr() as _,
                data.len(),
                Some(&mut bytes_written),
            )
        }
        .map_err(|error| format!("Failed to write process memory at 0x{address:X}: {}", error.message()))?;

        if bytes_written != data.len() {
            return Err(format!(
                "Incomplete process memory write at 0x{address:X}: wrote {} of {} bytes",
                bytes_written,
                data.len()
            ));
        }

        Ok(())
    }

    pub fn write_value<T: Copy>(&self, address: usize, value: &T) -> Result<(), String> {
        let bytes = unsafe {
            std::slice::from_raw_parts(value as *const T as *const u8, std::mem::size_of::<T>())
        };
        self.write_bytes(address, bytes)
    }

    pub fn read_utf8(&self, address: usize, max_length: usize) -> Result<String, String> {
        if address == 0 {
            return Ok(String::new());
        }

        let mut result = String::new();
        for index in 0..max_length {
            let value = self.read_value::<u8>(address + index)?;
            if value == 0 {
                break;
            }
            result.push(value as char);
        }
        Ok(result)
    }

    pub fn read_utf16(&self, address: usize, char_count: usize) -> Result<Vec<u16>, String> {
        if address == 0 || char_count == 0 {
            return Ok(Vec::new());
        }

        let bytes = self.read_bytes(address, char_count * std::mem::size_of::<u16>())?;
        if bytes.len() % 2 != 0 {
            return Err(format!("Invalid UTF-16 byte length {} at 0x{address:X}", bytes.len()));
        }

        Ok(bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect())
    }

    pub fn execute(&self, entry_point: usize) -> Result<(), String> {
        let thread = unsafe {
            CreateRemoteThread(
                self.process.raw(),
                None,
                0,
                Some(std::mem::transmute(entry_point)),
                None,
                0,
                None,
            )
        }
        .map_err(|error| format!("Failed to create remote thread at 0x{entry_point:X}: {}", error.message()))?;

        unsafe {
            WaitForSingleObject(thread, INFINITE);
            let _ = CloseHandle(thread);
        }

        Ok(())
    }
}