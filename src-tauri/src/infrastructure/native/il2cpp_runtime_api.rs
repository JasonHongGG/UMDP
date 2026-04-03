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

pub struct Il2CppRuntimeApi {
    memory: RemoteMemory,
    runtime_module: NativeModuleInfo,
    exports: HashMap<String, NativeAddress>,
    root_domain: NativeAddress,
    thread_attach: NativeAddress,
    thread_detach: NativeAddress,
}

impl Il2CppRuntimeApi {
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
            "il2cpp_domain_get",
            "il2cpp_thread_attach",
            "il2cpp_thread_detach",
            "il2cpp_domain_get_assemblies",
            "il2cpp_assembly_get_image",
            "il2cpp_image_get_name",
            "il2cpp_class_from_name",
            "il2cpp_class_get_parent",
            "il2cpp_class_get_fields",
            "il2cpp_class_get_methods",
            "il2cpp_object_get_class",
            "il2cpp_class_get_type",
            "il2cpp_field_get_name",
            "il2cpp_field_get_flags",
            "il2cpp_field_get_type",
            "il2cpp_type_get_name",
            "il2cpp_field_get_offset",
            "il2cpp_field_static_get_value",
            "il2cpp_method_get_name",
            "il2cpp_method_get_flags",
            "il2cpp_method_get_param_count",
            "il2cpp_method_get_param_name",
            "il2cpp_method_get_param",
            "il2cpp_method_get_return_type",
            "il2cpp_runtime_invoke",
            "il2cpp_string_new",
            "il2cpp_string_length",
            "il2cpp_string_chars",
            "il2cpp_array_length",
            "il2cpp_object_unbox",
            "il2cpp_object_new",
            "il2cpp_object_to_string",
        ];

        for export in required_exports {
            let address = self.resolve_export_address(export)?;
            self.exports.insert(export.to_string(), address);
        }

        self.thread_attach = self.export_address("il2cpp_thread_attach")?;
        self.thread_detach = self.export_address("il2cpp_thread_detach")?;
        self.root_domain =
            self.invoke_direct(self.export_address("il2cpp_domain_get")?, &[], false)?;
        if self.root_domain == 0 {
            return Err("failed to resolve il2cpp root domain".to_string());
        }

        Ok(())
    }

    fn export_address(&self, name: &str) -> Result<NativeAddress, String> {
        self.exports
            .get(name)
            .copied()
            .ok_or_else(|| format!("required il2cpp export not found: {name}"))
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
                "failed to load local il2cpp module for export resolution: {}",
                error.message()
            )
        })?;

        let proc_name =
            std::ffi::CString::new(name).map_err(|_| format!("invalid export name: {name}"))?;
        let local_proc = unsafe { GetProcAddress(local_module, PCSTR(proc_name.as_ptr() as _)) };
        let local_base = local_module.0 as usize;
        let local_proc_address = local_proc
            .map(|proc| proc as *const () as usize)
            .unwrap_or(0);
        unsafe {
            let _ = FreeLibrary(local_module);
        }

        if local_proc_address == 0 {
            return Err(format!("required il2cpp export not found: {name}"));
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
}

impl RuntimeApi for Il2CppRuntimeApi {
    fn enumerate_assemblies(&self) -> Result<Vec<NativeAddress>, String> {
        let count_block = self.memory.allocate(
            std::mem::size_of::<u64>(),
            windows::Win32::System::Memory::PAGE_READWRITE.0,
        )?;
        self.memory.write_value(count_block.address, &0u64)?;

        let assemblies_address = self.invoke(
            "il2cpp_domain_get_assemblies",
            &[self.root_domain, count_block.address],
        )?;
        if assemblies_address == 0 {
            return Ok(Vec::new());
        }

        let count: u64 = self.memory.read_value(count_block.address)?;
        if count == 0 {
            return Ok(Vec::new());
        }

        let size = count as usize * std::mem::size_of::<NativeAddress>();
        let bytes = self.memory.read_bytes(assemblies_address, size)?;
        Ok(bytes
            .chunks_exact(std::mem::size_of::<NativeAddress>())
            .map(|chunk| {
                chunk
                    .try_into()
                    .map(NativeAddress::from_ne_bytes)
                    .map_err(|_| "failed to decode assembly handle".to_string())
            })
            .collect::<Result<Vec<_>, _>>()?)
    }

    fn get_assembly_image(&self, assembly: NativeAddress) -> Result<NativeAddress, String> {
        self.invoke("il2cpp_assembly_get_image", &[assembly])
    }

    fn get_image_name(&self, image: NativeAddress) -> Result<String, String> {
        self.invoke_string("il2cpp_image_get_name", &[image])
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

        let class_handle = self.invoke(
            "il2cpp_class_from_name",
            &[image, namespace_arg.address(), class_arg.address()],
        )?;
        if class_handle == 0 {
            return Err("class not found".to_string());
        }
        Ok(class_handle)
    }

    fn get_parent_class(&self, class: NativeAddress) -> Result<NativeAddress, String> {
        self.invoke("il2cpp_class_get_parent", &[class])
    }

    fn enumerate_fields(&self, class: NativeAddress) -> Result<Vec<NativeFieldRecord>, String> {
        let iterator = self.memory.allocate(
            std::mem::size_of::<NativeAddress>(),
            windows::Win32::System::Memory::PAGE_READWRITE.0,
        )?;
        self.memory.write_value(iterator.address, &0usize)?;

        let mut fields = Vec::new();
        loop {
            let field_handle =
                self.invoke("il2cpp_class_get_fields", &[class, iterator.address])?;
            if field_handle == 0 {
                break;
            }

            let name_address = self.invoke("il2cpp_field_get_name", &[field_handle])?;
            let field_name = self.memory.read_utf8(name_address, 1024)?;
            if should_skip_field(&field_name) {
                continue;
            }

            let flags = self.invoke_i32("il2cpp_field_get_flags", &[field_handle])?;
            let is_literal = (flags & FIELD_ATTRIBUTE_LITERAL) != 0;
            let has_field_rva = (flags & FIELD_ATTRIBUTE_HAS_FIELD_RVA) != 0;
            let has_static_storage =
                (flags & FIELD_ATTRIBUTE_STATIC) != 0 && !is_literal && !has_field_rva;
            let is_static = has_static_storage || is_literal || has_field_rva;
            let type_handle = self.invoke("il2cpp_field_get_type", &[field_handle])?;
            let type_name = self.invoke_string("il2cpp_type_get_name", &[type_handle])?;
            let offset = self.invoke_i32("il2cpp_field_get_offset", &[field_handle])?;

            fields.push(NativeFieldRecord {
                handle: Some(field_handle),
                name: field_name,
                type_name,
                is_static,
                static_address: None,
                offset: Some(offset.max(0) as usize),
            });
        }

        Ok(fields)
    }

    fn enumerate_methods(&self, class: NativeAddress) -> Result<Vec<NativeMethodRecord>, String> {
        let iterator = self.memory.allocate(
            std::mem::size_of::<NativeAddress>(),
            windows::Win32::System::Memory::PAGE_READWRITE.0,
        )?;
        self.memory.write_value(iterator.address, &0usize)?;

        let mut methods = Vec::new();
        loop {
            let method_handle =
                self.invoke("il2cpp_class_get_methods", &[class, iterator.address])?;
            if method_handle == 0 {
                break;
            }

            let name_address = self.invoke("il2cpp_method_get_name", &[method_handle])?;
            let method_name = self.memory.read_utf8(name_address, 1024)?;
            if should_skip_method(&method_name) {
                continue;
            }

            let flags = self.invoke_i32("il2cpp_method_get_flags", &[method_handle, 0])?;
            let parameter_count = self
                .invoke_i32("il2cpp_method_get_param_count", &[method_handle])?
                .max(0) as usize;
            let return_type_handle =
                self.invoke("il2cpp_method_get_return_type", &[method_handle])?;
            let return_type = self.invoke_string("il2cpp_type_get_name", &[return_type_handle])?;

            let mut parameter_types = Vec::with_capacity(parameter_count);
            let mut signature = format!("{return_type} (");
            for index in 0..parameter_count {
                if index > 0 {
                    signature.push_str(", ");
                }

                let param_name_address =
                    self.invoke("il2cpp_method_get_param_name", &[method_handle, index])?;
                let parameter_name = self.memory.read_utf8(param_name_address, 1024)?;
                let parameter_type_handle =
                    self.invoke("il2cpp_method_get_param", &[method_handle, index])?;
                let parameter_type =
                    self.invoke_string("il2cpp_type_get_name", &[parameter_type_handle])?;

                parameter_types.push(parameter_type.clone());
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

        self.invoke("il2cpp_object_get_class", &[object])
    }

    fn get_class_type_name(&self, class: NativeAddress) -> Result<String, String> {
        if class == 0 {
            return Ok(String::new());
        }

        let type_handle = self.invoke("il2cpp_class_get_type", &[class])?;
        if type_handle == 0 {
            return Ok(String::new());
        }

        self.invoke_string("il2cpp_type_get_name", &[type_handle])
    }

    fn get_array_length(&self, array_object: NativeAddress) -> Result<usize, String> {
        if array_object == 0 {
            return Ok(0);
        }

        Ok(self.invoke("il2cpp_array_length", &[array_object])?)
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

        self.invoke("il2cpp_object_unbox", &[object])
    }

    fn create_managed_object(&self, class: NativeAddress) -> Result<NativeAddress, String> {
        if class == 0 {
            return Ok(0);
        }

        self.invoke("il2cpp_object_new", &[class])
    }

    fn create_managed_string(&self, value: &str) -> Result<NativeAddress, String> {
        let remote_value = RemoteUtf8String::new(&self.memory, value)?;
        self.invoke("il2cpp_string_new", &[remote_value.address()])
    }

    fn invoke_method(
        &self,
        method: NativeAddress,
        instance: NativeAddress,
        parameters: NativeAddress,
        exception: NativeAddress,
    ) -> Result<NativeAddress, String> {
        self.invoke(
            "il2cpp_runtime_invoke",
            &[method, instance, parameters, exception],
        )
    }

    fn read_managed_string(&self, object: NativeAddress) -> Result<Option<String>, String> {
        if object == 0 {
            return Ok(None);
        }

        let length = self.invoke_i32("il2cpp_string_length", &[object])?.max(0) as usize;
        let chars = self.invoke("il2cpp_string_chars", &[object])?;
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

        let raw_value = self.unbox_object(object)?;
        if raw_value == 0 {
            return Ok(None);
        }

        Ok(Some(self.memory.read_bytes(raw_value, size)?))
    }

    fn describe_exception(&self, exception: NativeAddress) -> Result<Option<String>, String> {
        if exception == 0 {
            return Ok(None);
        }

        let string_object = self.invoke("il2cpp_object_to_string", &[exception, 0])?;
        self.read_managed_string(string_object)
    }

    fn try_read_static_field_bytes(
        &self,
        field: &NativeFieldRecord,
        size: usize,
    ) -> Result<Option<Vec<u8>>, String> {
        let Some(field_handle) = field.handle else {
            return Ok(None);
        };

        let scratch = self
            .memory
            .allocate(size, windows::Win32::System::Memory::PAGE_READWRITE.0)?;
        self.memory.write_bytes(scratch.address, &vec![0u8; size])?;
        self.invoke(
            "il2cpp_field_static_get_value",
            &[field_handle, scratch.address],
        )?;
        Ok(Some(self.memory.read_bytes(scratch.address, size)?))
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
    let modules =
        crate::infrastructure::native::process::enumerate_modules(memory.process().pid())?;
    for module in modules {
        if module.name.eq_ignore_ascii_case("GameAssembly.dll") {
            return Ok(module);
        }
    }

    Err("il2cpp runtime module not found".to_string())
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

fn should_skip_field(field_name: &str) -> bool {
    field_name.is_empty() || field_name.starts_with('<')
}

fn should_skip_method(method_name: &str) -> bool {
    method_name.is_empty()
}
