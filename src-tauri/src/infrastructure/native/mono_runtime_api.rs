use crate::infrastructure::native::memory::{RemoteMemory, RemoteUtf8String};
use crate::infrastructure::native::process::NativeModuleInfo;
use crate::infrastructure::native::remote_call::RemoteCallInvoker;
use crate::infrastructure::native::runtime_api::{
    NativeAddress, NativeFieldRecord, NativeMethodRecord, RuntimeApi,
};
use std::collections::HashMap;
use windows::core::{PCSTR, PCWSTR};
use windows::Win32::Foundation::FreeLibrary;
use windows::Win32::System::LibraryLoader::{
    GetProcAddress, LoadLibraryExW, DONT_RESOLVE_DLL_REFERENCES,
};

const FIELD_ATTRIBUTE_STATIC: i32 = 0x0010;
const FIELD_ATTRIBUTE_LITERAL: i32 = 0x0040;
const FIELD_ATTRIBUTE_HAS_FIELD_RVA: i32 = 0x0100;
const METHOD_ATTRIBUTE_STATIC: i32 = 0x0010;
const MANAGED_ARRAY_DATA_OFFSET: usize = 0x20;

pub struct MonoRuntimeApi {
    memory: RemoteMemory,
    runtime_module: NativeModuleInfo,
    exports: HashMap<String, NativeAddress>,
    root_domain: NativeAddress,
    thread_attach: NativeAddress,
    thread_detach: NativeAddress,
}

impl MonoRuntimeApi {
    pub fn new(memory: RemoteMemory) -> Result<Self, String> {
        let runtime_module = find_runtime_module(&memory)?;
        let mut api = Self {
            memory,
            runtime_module,
            exports: HashMap::new(),
            root_domain: 0,
            thread_attach: 0,
            thread_detach: 0,
        };
        api.initialize()?;
        Ok(api)
    }

    fn initialize(&mut self) -> Result<(), String> {
        let required_exports = [
            "mono_get_root_domain",
            "mono_thread_attach",
            "mono_thread_detach",
            "mono_assembly_foreach",
            "mono_assembly_get_image",
            "mono_image_get_name",
            "mono_class_from_name",
            "mono_class_get_parent",
            "mono_object_get_class",
            "mono_class_get_type",
            "mono_class_vtable",
            "mono_vtable_get_static_field_data",
            "mono_class_get_fields",
            "mono_class_get_methods",
            "mono_field_get_name",
            "mono_field_get_flags",
            "mono_field_get_type",
            "mono_type_get_name",
            "mono_field_get_offset",
            "mono_method_get_name",
            "mono_method_get_flags",
            "mono_method_signature",
            "mono_signature_get_desc",
            "mono_signature_get_param_count",
            "mono_method_get_param_names",
            "mono_signature_get_return_type",
            "mono_runtime_invoke",
            "mono_string_new",
            "mono_string_length",
            "mono_string_chars",
            "mono_array_length",
            "mono_object_unbox",
            "mono_object_new",
            "mono_object_to_string",
        ];

        for export in required_exports {
            let address = self.resolve_export_address(export)?;
            self.exports.insert(export.to_string(), address);
        }

        if let Ok(address) = self.resolve_export_address("mono_class_from_name_case") {
            self.exports
                .insert("mono_class_from_name_case".to_string(), address);
        }

        self.thread_attach = self.export_address("mono_thread_attach")?;
        self.thread_detach = self.export_address("mono_thread_detach")?;
        self.root_domain =
            self.invoke_direct(self.export_address("mono_get_root_domain")?, &[], false)?;
        if self.root_domain == 0 {
            return Err("failed to resolve mono root domain".to_string());
        }

        Ok(())
    }

    fn export_address(&self, name: &str) -> Result<NativeAddress, String> {
        self.exports
            .get(name)
            .copied()
            .ok_or_else(|| format!("required mono export not found: {}", name))
    }

    fn try_export_address(&self, name: &str) -> Option<NativeAddress> {
        self.exports.get(name).copied()
    }

    fn resolve_export_address(&self, name: &str) -> Result<NativeAddress, String> {
        let wide_path = encode_wide(&self.runtime_module.path);
        let local_module = unsafe {
            LoadLibraryExW(
                PCWSTR(wide_path.as_ptr()),
                None,
                DONT_RESOLVE_DLL_REFERENCES,
            )
        }
        .map_err(|error| {
            format!(
                "failed to load local mono module for export resolution: {}",
                error.message()
            )
        })?;

        let proc_name =
            std::ffi::CString::new(name).map_err(|_| format!("invalid export name: {}", name))?;
        let local_proc = unsafe { GetProcAddress(local_module, PCSTR(proc_name.as_ptr() as _)) };
        let local_base = local_module.0 as usize;
        let local_proc_address = local_proc
            .map(|proc| proc as *const () as usize)
            .unwrap_or(0);
        unsafe {
            let _ = FreeLibrary(local_module);
        }

        if local_proc_address == 0 {
            return Err(format!("required mono export not found: {}", name));
        }

        Ok(self.runtime_module.base_address + (local_proc_address - local_base))
    }

    fn invoker(&self) -> RemoteCallInvoker {
        RemoteCallInvoker::new(
            self.memory.clone(),
            self.root_domain,
            self.thread_attach,
            self.thread_detach,
        )
    }

    fn invoke(&self, name: &str, arguments: &[NativeAddress]) -> Result<NativeAddress, String> {
        self.invoke_direct(self.export_address(name)?, arguments, true)
    }

    fn invoke_direct(
        &self,
        function_address: NativeAddress,
        arguments: &[NativeAddress],
        attach_thread: bool,
    ) -> Result<NativeAddress, String> {
        self.invoker()
            .invoke(function_address, arguments, attach_thread)
    }

    fn invoke_string(&self, name: &str, arguments: &[NativeAddress]) -> Result<String, String> {
        let address = self.invoke(name, arguments)?;
        self.memory.read_utf8(address, 4096)
    }

    fn invoke_i32(&self, name: &str, arguments: &[NativeAddress]) -> Result<i32, String> {
        Ok(self.invoke(name, arguments)? as i32)
    }

    fn resolve_static_field_address(
        &self,
        class_handle: NativeAddress,
        field_offset: usize,
    ) -> Result<NativeAddress, String> {
        let vtable = self.invoke("mono_class_vtable", &[self.root_domain, class_handle])?;
        if vtable == 0 {
            return Ok(0);
        }
        let static_data = self.invoke("mono_vtable_get_static_field_data", &[vtable])?;
        if static_data == 0 {
            return Ok(0);
        }
        Ok(static_data + field_offset)
    }
}

impl RuntimeApi for MonoRuntimeApi {
    fn enumerate_assemblies(&self) -> Result<Vec<NativeAddress>, String> {
        #[derive(Clone, Copy)]
        #[repr(C)]
        struct AssemblyCollector {
            count: u32,
            reserved: u32,
            handles: [NativeAddress; 510],
        }

        let callback_code: [u8; 17] = [
            0x8B, 0x02, 0x3D, 0xFE, 0x01, 0x00, 0x00, 0x77, 0x07, 0x48, 0x89, 0x4C, 0xC2, 0x08,
            0xFF, 0x02, 0xC3,
        ];

        let callback_offset = 0x100usize;
        let data_offset = 0x200usize;
        let block_size = data_offset + std::mem::size_of::<AssemblyCollector>();
        let block = self.memory.allocate(
            block_size,
            windows::Win32::System::Memory::PAGE_EXECUTE_READWRITE.0,
        )?;
        let callback_address = block.address + callback_offset;
        let data_address = block.address + data_offset;

        let collector = AssemblyCollector {
            count: 0,
            reserved: 0,
            handles: [0; 510],
        };
        self.memory.write_bytes(callback_address, &callback_code)?;
        self.memory.write_value(data_address, &collector)?;
        self.memory.protect(
            block.address,
            block.size,
            windows::Win32::System::Memory::PAGE_EXECUTE_READWRITE.0,
        )?;
        self.invoke("mono_assembly_foreach", &[callback_address, data_address])?;
        let collector: AssemblyCollector = self.memory.read_value(data_address)?;
        let count = collector.count.min(collector.handles.len() as u32) as usize;
        Ok(collector.handles[..count].to_vec())
    }

    fn get_assembly_image(&self, assembly: NativeAddress) -> Result<NativeAddress, String> {
        self.invoke("mono_assembly_get_image", &[assembly])
    }

    fn get_image_name(&self, image: NativeAddress) -> Result<String, String> {
        self.invoke_string("mono_image_get_name", &[image])
    }

    fn resolve_class(
        &self,
        image: NativeAddress,
        namespace: &str,
        class_name: &str,
    ) -> Result<NativeAddress, String> {
        let (normalized_namespace, normalized_name) = normalize_class_name(namespace, class_name);
        let namespace_arg = RemoteUtf8String::new(&self.memory, &normalized_namespace)?;
        let class_arg = RemoteUtf8String::new(&self.memory, &normalized_name)?;

        if let Some(function) = self.try_export_address("mono_class_from_name_case") {
            let class_handle = self.invoke_direct(
                function,
                &[image, namespace_arg.address(), class_arg.address()],
                true,
            )?;
            if class_handle != 0 {
                return Ok(class_handle);
            }
        }

        let class_handle = self.invoke(
            "mono_class_from_name",
            &[image, namespace_arg.address(), class_arg.address()],
        )?;
        if class_handle == 0 {
            return Err("class not found".to_string());
        }

        Ok(class_handle)
    }

    fn get_parent_class(&self, class: NativeAddress) -> Result<NativeAddress, String> {
        self.invoke("mono_class_get_parent", &[class])
    }

    fn enumerate_fields(&self, class: NativeAddress) -> Result<Vec<NativeFieldRecord>, String> {
        let iterator = self.memory.allocate(
            std::mem::size_of::<NativeAddress>(),
            windows::Win32::System::Memory::PAGE_READWRITE.0,
        )?;
        self.memory.write_value(iterator.address, &0usize)?;

        let mut fields = Vec::new();
        loop {
            let field_handle = self.invoke("mono_class_get_fields", &[class, iterator.address])?;
            if field_handle == 0 {
                break;
            }

            let name_address = self.invoke("mono_field_get_name", &[field_handle])?;
            let field_name = self.memory.read_utf8(name_address, 1024)?;
            if field_name.is_empty() {
                continue;
            }

            let flags = self.invoke_i32("mono_field_get_flags", &[field_handle])?;
            let is_literal = (flags & FIELD_ATTRIBUTE_LITERAL) != 0;
            let has_field_rva = (flags & FIELD_ATTRIBUTE_HAS_FIELD_RVA) != 0;
            let has_static_storage =
                (flags & FIELD_ATTRIBUTE_STATIC) != 0 && !is_literal && !has_field_rva;
            let is_static = has_static_storage || is_literal || has_field_rva;
            let type_handle = self.invoke("mono_field_get_type", &[field_handle])?;
            let type_name = self.invoke_string("mono_type_get_name", &[type_handle])?;
            let offset = self.invoke_i32("mono_field_get_offset", &[field_handle])?;

            let static_address = if has_static_storage {
                let resolved = self.resolve_static_field_address(class, offset.max(0) as usize)?;
                (resolved != 0).then_some(resolved)
            } else {
                None
            };

            fields.push(NativeFieldRecord {
                handle: Some(field_handle),
                name: field_name,
                type_name,
                is_static,
                static_address,
                offset: Some(offset.max(0) as usize),
            });
        }

        Ok(fields)
    }

    fn enumerate_methods(&self, _class: NativeAddress) -> Result<Vec<NativeMethodRecord>, String> {
        let class = _class;
        let iterator = self.memory.allocate(
            std::mem::size_of::<NativeAddress>(),
            windows::Win32::System::Memory::PAGE_READWRITE.0,
        )?;
        self.memory.write_value(iterator.address, &0usize)?;

        let mut methods = Vec::new();
        loop {
            let method_handle =
                self.invoke("mono_class_get_methods", &[class, iterator.address])?;
            if method_handle == 0 {
                break;
            }

            let name_address = self.invoke("mono_method_get_name", &[method_handle])?;
            let method_name = self.memory.read_utf8(name_address, 1024)?;
            if method_name.is_empty() {
                continue;
            }

            let flags = self.invoke_i32("mono_method_get_flags", &[method_handle, 0])?;
            let signature_handle = self.invoke("mono_method_signature", &[method_handle])?;
            let parameter_desc =
                self.invoke_string("mono_signature_get_desc", &[signature_handle, 1])?;
            let parameter_types = split_parameter_types(&parameter_desc);
            let parameter_count =
                self.invoke_i32("mono_signature_get_param_count", &[signature_handle])?;

            let mut name_ptrs = vec![0usize; parameter_count.max(0) as usize];
            if !name_ptrs.is_empty() {
                let names_block = self.memory.allocate(
                    name_ptrs.len() * std::mem::size_of::<NativeAddress>(),
                    windows::Win32::System::Memory::PAGE_READWRITE.0,
                )?;
                let name_ptr_bytes = unsafe {
                    std::slice::from_raw_parts(
                        name_ptrs.as_ptr() as *const u8,
                        name_ptrs.len() * std::mem::size_of::<NativeAddress>(),
                    )
                };
                self.memory
                    .write_bytes(names_block.address, name_ptr_bytes)?;
                self.invoke(
                    "mono_method_get_param_names",
                    &[method_handle, names_block.address],
                )?;
                let raw_name_ptrs = self.memory.read_bytes(
                    names_block.address,
                    name_ptrs.len() * std::mem::size_of::<NativeAddress>(),
                )?;
                for (index, chunk) in raw_name_ptrs
                    .chunks_exact(std::mem::size_of::<NativeAddress>())
                    .enumerate()
                {
                    name_ptrs[index] = NativeAddress::from_ne_bytes(
                        chunk
                            .try_into()
                            .map_err(|_| "failed to decode parameter name pointer".to_string())?,
                    );
                }
            }

            let return_type_handle =
                self.invoke("mono_signature_get_return_type", &[signature_handle])?;
            let return_type = self.invoke_string("mono_type_get_name", &[return_type_handle])?;

            let mut signature = format!("{} (", return_type);
            for index in 0..parameter_count.max(0) as usize {
                if index > 0 {
                    signature.push_str(", ");
                }

                let parameter_type = parameter_types
                    .get(index)
                    .cloned()
                    .unwrap_or_else(|| "System.Object".to_string());
                let parameter_name = name_ptrs
                    .get(index)
                    .copied()
                    .filter(|address| *address != 0)
                    .map(|address| self.memory.read_utf8(address, 1024))
                    .transpose()?
                    .unwrap_or_default();
                signature.push_str(&parameter_type);
                if !parameter_name.is_empty() {
                    signature.push(' ');
                    signature.push_str(&parameter_name);
                }
            }
            signature.push(')');

            methods.push(NativeMethodRecord {
                handle: method_handle,
                name: method_name,
                signature,
                return_type,
                is_static: (flags & METHOD_ATTRIBUTE_STATIC) != 0,
                parameter_types,
            });
        }

        Ok(methods)
    }

    fn get_object_class(&self, object: NativeAddress) -> Result<NativeAddress, String> {
        if object == 0 {
            return Ok(0);
        }

        self.invoke("mono_object_get_class", &[object])
    }

    fn get_class_type_name(&self, class: NativeAddress) -> Result<String, String> {
        if class == 0 {
            return Ok(String::new());
        }

        let type_handle = self.invoke("mono_class_get_type", &[class])?;
        if type_handle == 0 {
            return Ok(String::new());
        }

        self.invoke_string("mono_type_get_name", &[type_handle])
    }

    fn get_array_length(&self, array_object: NativeAddress) -> Result<usize, String> {
        if array_object == 0 {
            return Ok(0);
        }

        Ok(self.invoke("mono_array_length", &[array_object])?)
    }

    fn get_array_element_address(
        &self,
        array_object: NativeAddress,
        index: usize,
    ) -> Result<NativeAddress, String> {
        if array_object == 0 || index >= self.get_array_length(array_object)? {
            return Ok(0);
        }

        self.memory.read_value(
            array_object + MANAGED_ARRAY_DATA_OFFSET + index * std::mem::size_of::<NativeAddress>(),
        )
    }

    fn unbox_object(&self, object: NativeAddress) -> Result<NativeAddress, String> {
        if object == 0 {
            return Ok(0);
        }

        self.invoke("mono_object_unbox", &[object])
    }

    fn create_managed_object(&self, class: NativeAddress) -> Result<NativeAddress, String> {
        if class == 0 {
            return Ok(0);
        }

        self.invoke("mono_object_new", &[self.root_domain, class])
    }

    fn create_managed_string(&self, value: &str) -> Result<NativeAddress, String> {
        let remote_value = RemoteUtf8String::new(&self.memory, value)?;
        self.invoke(
            "mono_string_new",
            &[self.root_domain, remote_value.address()],
        )
    }

    fn invoke_method(
        &self,
        method: NativeAddress,
        instance: NativeAddress,
        parameters: NativeAddress,
        exception: NativeAddress,
    ) -> Result<NativeAddress, String> {
        self.invoke(
            "mono_runtime_invoke",
            &[method, instance, parameters, exception],
        )
    }

    fn read_managed_string(&self, object: NativeAddress) -> Result<Option<String>, String> {
        if object == 0 {
            return Ok(None);
        }

        let length = self.invoke_i32("mono_string_length", &[object])?.max(0) as usize;
        let chars = self.invoke("mono_string_chars", &[object])?;
        if chars == 0 {
            return Ok(Some(String::new()));
        }
        let utf16 = self.memory.read_utf16(chars, length)?;
        Ok(Some(String::from_utf16_lossy(&utf16)))
    }

    fn try_read_unboxed_bytes(
        &self,
        object: NativeAddress,
        size: usize,
    ) -> Result<Option<Vec<u8>>, String> {
        if object == 0 {
            return Ok(None);
        }

        let raw_value = self.invoke("mono_object_unbox", &[object])?;
        if raw_value == 0 {
            return Ok(None);
        }

        Ok(Some(self.memory.read_bytes(raw_value, size)?))
    }

    fn describe_exception(&self, exception: NativeAddress) -> Result<Option<String>, String> {
        if exception == 0 {
            return Ok(None);
        }

        let string_object = self.invoke("mono_object_to_string", &[exception, 0])?;
        self.read_managed_string(string_object)
    }

    fn try_read_static_field_bytes(
        &self,
        field: &NativeFieldRecord,
        size: usize,
    ) -> Result<Option<Vec<u8>>, String> {
        let Some(address) = field.static_address else {
            return Ok(None);
        };
        Ok(Some(self.memory.read_bytes(address, size)?))
    }

    fn try_read_instance_field_bytes(
        &self,
        instance: NativeAddress,
        field: &NativeFieldRecord,
        size: usize,
    ) -> Result<Option<Vec<u8>>, String> {
        let Some(offset) = field.offset else {
            return Ok(None);
        };
        if field.is_static || instance == 0 {
            return Ok(None);
        }
        Ok(Some(self.memory.read_bytes(instance + offset, size)?))
    }
}

fn find_runtime_module(memory: &RemoteMemory) -> Result<NativeModuleInfo, String> {
    let candidates = ["mono.dll", "mono-2.0-bdwgc.dll", "mono-2.0-sgen.dll"];
    let modules =
        crate::infrastructure::native::process::enumerate_modules(memory.process().pid())?;
    for module in modules {
        let lower = module.name.to_ascii_lowercase();
        if candidates.iter().any(|candidate| lower == *candidate) {
            return Ok(module);
        }
    }

    Err("mono runtime module not found".to_string())
}

fn encode_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn normalize_class_name(class_namespace: &str, class_name: &str) -> (String, String) {
    let mut normalized_namespace = class_namespace.to_string();
    let mut normalized_name = class_name.to_string();
    if normalized_namespace.is_empty() {
        if let Some(last_dot) = normalized_name.rfind('.') {
            normalized_namespace = normalized_name[..last_dot].to_string();
            normalized_name = normalized_name[last_dot + 1..].to_string();
        }
    }

    normalized_name = normalized_name.replace('+', "/");
    (normalized_namespace, normalized_name)
}

fn split_parameter_types(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}
