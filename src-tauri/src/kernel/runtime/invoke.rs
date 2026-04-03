use crate::domain::analysis_models::{
    ClassDescriptor, MethodDescriptor, RuntimeInvokeArgumentKind, RuntimeInvokeFailureKind,
    RuntimeMethodInvokeArgument, RuntimeMethodInvokeRequest, RuntimeMethodInvokeResult,
    RuntimeMethodInvokeValue,
};
use crate::infrastructure::native::memory::RemoteMemory;
use crate::infrastructure::native::runtime_api::{NativeAddress, NativeMethodRecord, RuntimeApi};
use crate::kernel::runtime::overlay;

pub fn invoke_runtime_method(
    runtime_api: &dyn RuntimeApi,
    pid: u32,
    descriptor: &ClassDescriptor,
    method: &MethodDescriptor,
    request: &RuntimeMethodInvokeRequest,
) -> Result<RuntimeMethodInvokeResult, String> {
    let image = overlay::resolve_image(runtime_api, &descriptor.bridge_image_name)?;
    let class_handle = runtime_api.resolve_class(image, &descriptor.namespace, &descriptor.name)?;
    let runtime_method = resolve_runtime_method(runtime_api, class_handle, method)?;
    let instance_address = request
        .instance_address
        .as_deref()
        .map(parse_address)
        .transpose()?
        .unwrap_or(0);

    let memory = RemoteMemory::open(pid)?;
    let mut primitive_argument_storage = Vec::new();
    let mut argument_pointers = Vec::with_capacity(method.parameters.len());

    for (parameter, argument) in method.parameters.iter().zip(&request.arguments) {
        let argument_pointer = marshal_argument(
            &memory,
            runtime_api,
            &parameter.type_name,
            argument,
            &mut primitive_argument_storage,
        )
        .map_err(|error| {
            build_error_result(
                request,
                method,
                RuntimeInvokeFailureKind::ArgumentMismatch,
                error,
            )
        })?;
        argument_pointers.push(argument_pointer);
    }

    let parameter_array = if argument_pointers.is_empty() {
        None
    } else {
        let allocation = memory.allocate(
            argument_pointers.len() * std::mem::size_of::<NativeAddress>(),
            windows::Win32::System::Memory::PAGE_READWRITE.0,
        )?;
        let argument_bytes = unsafe {
            std::slice::from_raw_parts(
                argument_pointers.as_ptr() as *const u8,
                argument_pointers.len() * std::mem::size_of::<NativeAddress>(),
            )
        };
        memory.write_bytes(allocation.address, argument_bytes)?;
        Some(allocation)
    };

    let exception_storage = memory.allocate(
        std::mem::size_of::<NativeAddress>(),
        windows::Win32::System::Memory::PAGE_READWRITE.0,
    )?;
    memory.write_value(exception_storage.address, &0usize)?;

    let result_object = runtime_api.invoke_method(
        runtime_method.handle,
        if runtime_method.is_static {
            0
        } else {
            instance_address
        },
        parameter_array
            .as_ref()
            .map(|allocation| allocation.address)
            .unwrap_or(0),
        exception_storage.address,
    )?;

    let exception_object: NativeAddress = memory.read_value(exception_storage.address)?;
    if exception_object != 0 {
        return Ok(RuntimeMethodInvokeResult {
            class_stable_id: request.class_stable_id.clone(),
            method_stable_id: request.method_stable_id.clone(),
            method_name: runtime_method.name,
            method_signature: runtime_method.signature,
            return_type: runtime_method.return_type,
            success: false,
            failure_kind: RuntimeInvokeFailureKind::RuntimeException,
            error: None,
            exception: runtime_api
                .describe_exception(exception_object)?
                .or_else(|| Some("runtime exception".to_string())),
            result: None,
        });
    }

    let result = read_invoke_result(runtime_api, &runtime_method, result_object)?;
    Ok(RuntimeMethodInvokeResult {
        class_stable_id: request.class_stable_id.clone(),
        method_stable_id: request.method_stable_id.clone(),
        method_name: runtime_method.name,
        method_signature: runtime_method.signature,
        return_type: runtime_method.return_type,
        success: true,
        failure_kind: RuntimeInvokeFailureKind::None,
        error: None,
        exception: None,
        result: Some(result),
    })
}

fn resolve_runtime_method(
    runtime_api: &dyn RuntimeApi,
    class_handle: NativeAddress,
    method: &MethodDescriptor,
) -> Result<NativeMethodRecord, String> {
    let hierarchy = overlay::build_class_hierarchy(runtime_api, class_handle)?;
    let expected_return_type = normalize_type_name(&method.return_type);
    let expected_parameter_types = method
        .parameters
        .iter()
        .map(|parameter| normalize_type_name(&parameter.type_name))
        .collect::<Vec<_>>();

    for class in &hierarchy {
        for candidate in runtime_api.enumerate_methods(*class)? {
            if candidate.name == method.name && candidate.signature == method.signature {
                return Ok(candidate);
            }
        }
    }

    for class in hierarchy {
        for candidate in runtime_api.enumerate_methods(class)? {
            if candidate.name != method.name {
                continue;
            }
            if normalize_type_name(&candidate.return_type) != expected_return_type {
                continue;
            }
            if candidate.parameter_types.len() != expected_parameter_types.len() {
                continue;
            }
            if candidate
                .parameter_types
                .iter()
                .map(|value| normalize_type_name(value))
                .eq(expected_parameter_types.iter().cloned())
            {
                return Ok(candidate);
            }
        }
    }

    Err("method not found".to_string())
}

fn marshal_argument(
    memory: &RemoteMemory,
    runtime_api: &dyn RuntimeApi,
    parameter_type: &str,
    argument: &RuntimeMethodInvokeArgument,
    primitive_argument_storage: &mut Vec<crate::infrastructure::native::memory::RemoteAllocation>,
) -> Result<NativeAddress, String> {
    let normalized_parameter_type = normalize_type_name(parameter_type);

    if argument.value.is_none() {
        return Ok(0);
    }

    if is_string_type(&normalized_parameter_type) {
        if matches!(argument.value_kind, RuntimeInvokeArgumentKind::Address) {
            return Err(format!(
                "address argument is not valid for parameter type: {}",
                parameter_type
            ));
        }
        return runtime_api.create_managed_string(argument.value.as_deref().unwrap_or_default());
    }

    let primitive_size = primitive_size_for_type(&normalized_parameter_type);
    if primitive_size == 0 {
        if !matches!(argument.value_kind, RuntimeInvokeArgumentKind::Address) {
            return Err(format!(
                "reference-type parameter requires address argument: {}",
                parameter_type
            ));
        }
        if !supports_managed_reference_address_argument(&normalized_parameter_type) {
            return Err(format!(
                "unsupported address parameter type: {}",
                parameter_type
            ));
        }
        return parse_address(argument.value.as_deref().unwrap_or_default());
    }

    if matches!(argument.value_kind, RuntimeInvokeArgumentKind::Address) {
        return Err(format!(
            "address argument is not valid for parameter type: {}",
            parameter_type
        ));
    }

    let allocation = memory.allocate(
        primitive_size,
        windows::Win32::System::Memory::PAGE_READWRITE.0,
    )?;
    let storage_address = allocation.address;
    let raw_value = argument.value.as_deref().unwrap_or_default();

    match normalized_parameter_type.as_str() {
        "System.Boolean" => {
            let value = if raw_value == "true" { 1u8 } else { 0u8 };
            memory.write_value(storage_address, &value)?;
        }
        "System.Byte" => memory.write_value(storage_address, &parse_unsigned::<u8>(raw_value)?)?,
        "System.SByte" => memory.write_value(storage_address, &parse_signed::<i8>(raw_value)?)?,
        "System.Int16" => memory.write_value(storage_address, &parse_signed::<i16>(raw_value)?)?,
        "System.UInt16" => {
            memory.write_value(storage_address, &parse_unsigned::<u16>(raw_value)?)?
        }
        "System.Int32" => memory.write_value(storage_address, &parse_signed::<i32>(raw_value)?)?,
        "System.UInt32" => {
            memory.write_value(storage_address, &parse_unsigned::<u32>(raw_value)?)?
        }
        "System.Int64" => memory.write_value(storage_address, &parse_signed::<i64>(raw_value)?)?,
        "System.UInt64" => {
            memory.write_value(storage_address, &parse_unsigned::<u64>(raw_value)?)?
        }
        "System.Single" => memory.write_value(
            storage_address,
            &raw_value
                .parse::<f32>()
                .map_err(|error| error.to_string())?,
        )?,
        "System.Double" => memory.write_value(
            storage_address,
            &raw_value
                .parse::<f64>()
                .map_err(|error| error.to_string())?,
        )?,
        "System.IntPtr" | "System.UIntPtr" => {
            memory.write_value(storage_address, &parse_address(raw_value)?)?
        }
        _ => {
            return Err(format!(
                "unsupported argument parameter type: {}",
                parameter_type
            ))
        }
    }

    primitive_argument_storage.push(allocation);
    Ok(storage_address)
}

fn read_invoke_result(
    runtime_api: &dyn RuntimeApi,
    method: &NativeMethodRecord,
    result_object: NativeAddress,
) -> Result<RuntimeMethodInvokeValue, String> {
    let return_type = normalize_type_name(&method.return_type);
    if return_type == "System.Void" {
        return Ok(RuntimeMethodInvokeValue {
            kind: "void".to_string(),
            value: None,
            object_address: None,
        });
    }

    if result_object == 0 {
        return Ok(RuntimeMethodInvokeValue {
            kind: "null".to_string(),
            value: None,
            object_address: None,
        });
    }

    if is_string_type(&return_type) {
        return Ok(RuntimeMethodInvokeValue {
            kind: "string".to_string(),
            value: runtime_api.read_managed_string(result_object)?,
            object_address: Some(format_object_address(result_object)),
        });
    }

    if return_type == "System.Boolean" {
        let value = runtime_api
            .try_read_unboxed_bytes(result_object, 1)?
            .and_then(|bytes| bytes.first().copied())
            .map(|value| if value != 0 { "true" } else { "false" }.to_string());
        return Ok(RuntimeMethodInvokeValue {
            kind: "boolean".to_string(),
            value,
            object_address: None,
        });
    }

    if let Some(size) = number_result_size(&return_type) {
        let value = runtime_api
            .try_read_unboxed_bytes(result_object, size)?
            .map(|bytes| format_numeric_result(&return_type, &bytes))
            .transpose()?;
        return Ok(RuntimeMethodInvokeValue {
            kind: "number".to_string(),
            value,
            object_address: None,
        });
    }

    Ok(RuntimeMethodInvokeValue {
        kind: "object".to_string(),
        value: None,
        object_address: Some(format_object_address(result_object)),
    })
}

fn build_error_result(
    request: &RuntimeMethodInvokeRequest,
    method: &MethodDescriptor,
    failure_kind: RuntimeInvokeFailureKind,
    error: impl Into<String>,
) -> String {
    let _ = request;
    let _ = method;
    match failure_kind {
        RuntimeInvokeFailureKind::ArgumentMismatch => error.into(),
        _ => error.into(),
    }
}

fn number_result_size(type_name: &str) -> Option<usize> {
    match type_name {
        "System.Byte" | "System.SByte" => Some(1),
        "System.Int16" | "System.UInt16" => Some(2),
        "System.Int32" | "System.UInt32" | "System.Single" => Some(4),
        "System.Int64" | "System.UInt64" | "System.Double" | "System.IntPtr" | "System.UIntPtr" => {
            Some(8)
        }
        _ => None,
    }
}

fn format_numeric_result(type_name: &str, bytes: &[u8]) -> Result<String, String> {
    match type_name {
        "System.Byte" => Ok(bytes[0].to_string()),
        "System.SByte" => Ok(i8::from_ne_bytes([bytes[0]]).to_string()),
        "System.Int16" => Ok(i16::from_ne_bytes(
            bytes
                .try_into()
                .map_err(|_| "invalid Int16 return payload".to_string())?,
        )
        .to_string()),
        "System.UInt16" => Ok(u16::from_ne_bytes(
            bytes
                .try_into()
                .map_err(|_| "invalid UInt16 return payload".to_string())?,
        )
        .to_string()),
        "System.Int32" => Ok(i32::from_ne_bytes(
            bytes
                .try_into()
                .map_err(|_| "invalid Int32 return payload".to_string())?,
        )
        .to_string()),
        "System.UInt32" => Ok(u32::from_ne_bytes(
            bytes
                .try_into()
                .map_err(|_| "invalid UInt32 return payload".to_string())?,
        )
        .to_string()),
        "System.Int64" => Ok(i64::from_ne_bytes(
            bytes
                .try_into()
                .map_err(|_| "invalid Int64 return payload".to_string())?,
        )
        .to_string()),
        "System.UInt64" => Ok(u64::from_ne_bytes(
            bytes
                .try_into()
                .map_err(|_| "invalid UInt64 return payload".to_string())?,
        )
        .to_string()),
        "System.Single" => Ok(f32::from_ne_bytes(
            bytes
                .try_into()
                .map_err(|_| "invalid Single return payload".to_string())?,
        )
        .to_string()),
        "System.Double" => Ok(f64::from_ne_bytes(
            bytes
                .try_into()
                .map_err(|_| "invalid Double return payload".to_string())?,
        )
        .to_string()),
        "System.IntPtr" | "System.UIntPtr" => Ok(format_object_address(usize::from_ne_bytes(
            bytes
                .try_into()
                .map_err(|_| "invalid pointer return payload".to_string())?,
        ))),
        _ => Err(format!("unsupported numeric return type: {}", type_name)),
    }
}

fn primitive_size_for_type(type_name: &str) -> usize {
    match type_name {
        "System.Boolean" | "System.Byte" | "System.SByte" => 1,
        "System.Int16" | "System.UInt16" => 2,
        "System.Int32" | "System.UInt32" | "System.Single" => 4,
        "System.Int64" | "System.UInt64" | "System.Double" | "System.IntPtr" | "System.UIntPtr" => {
            8
        }
        _ => 0,
    }
}

fn is_string_type(type_name: &str) -> bool {
    type_name == "System.String"
}

fn supports_managed_reference_address_argument(type_name: &str) -> bool {
    primitive_size_for_type(type_name) == 0
        && !is_string_type(type_name)
        && !is_out_of_scope_address_parameter_type(type_name)
}

fn is_out_of_scope_address_parameter_type(type_name: &str) -> bool {
    if type_name.is_empty() {
        return true;
    }

    if matches!(
        type_name,
        "System.Void"
            | "System.Decimal"
            | "System.DateTime"
            | "System.TimeSpan"
            | "System.Guid"
            | "UnityEngine.Vector2"
            | "UnityEngine.Vector3"
            | "UnityEngine.Vector4"
            | "UnityEngine.Quaternion"
            | "UnityEngine.Color"
            | "UnityEngine.Color32"
            | "UnityEngine.Rect"
            | "UnityEngine.Bounds"
            | "UnityEngine.RaycastHit"
    ) {
        return true;
    }

    type_name.contains('<')
        || type_name.ends_with("[]")
        || type_name.ends_with('&')
        || type_name.ends_with('*')
}

fn normalize_type_name(value: &str) -> String {
    let mut value = value.trim().to_string();
    if value.is_empty() {
        return value;
    }

    let mut suffix = String::new();
    loop {
        if value.ends_with("[]") {
            suffix = format!("[]{}", suffix);
            value.truncate(value.len() - 2);
            value = value.trim().to_string();
            continue;
        }

        if let Some(last) = value.chars().last() {
            if last == '&' || last == '*' {
                suffix.insert(0, last);
                value.pop();
                value = value.trim().to_string();
                continue;
            }
        }
        break;
    }

    let base = map_alias(&value);
    format!("{}{}", normalize_generic_aliases(&base), suffix)
}

fn normalize_generic_aliases(value: &str) -> String {
    let mut rebuilt = String::new();
    let mut token = String::new();

    let flush_token = |rebuilt: &mut String, token: &mut String| {
        if token.is_empty() {
            return;
        }
        if !token.contains('.') {
            *token = map_alias(token);
        }
        rebuilt.push_str(token);
        token.clear();
    };

    for ch in value.chars() {
        let is_word = ch.is_ascii_alphanumeric() || ch == '_' || ch == '.';
        if is_word {
            token.push(ch);
            continue;
        }
        flush_token(&mut rebuilt, &mut token);
        rebuilt.push(ch);
    }
    flush_token(&mut rebuilt, &mut token);
    rebuilt
}

fn map_alias(value: &str) -> String {
    match value {
        "void" => "System.Void",
        "bool" => "System.Boolean",
        "byte" => "System.Byte",
        "sbyte" => "System.SByte",
        "short" => "System.Int16",
        "ushort" => "System.UInt16",
        "int" => "System.Int32",
        "uint" => "System.UInt32",
        "long" => "System.Int64",
        "ulong" => "System.UInt64",
        "float" => "System.Single",
        "double" => "System.Double",
        "string" => "System.String",
        "object" => "System.Object",
        other => other,
    }
    .to_string()
}

fn parse_address(value: &str) -> Result<NativeAddress, String> {
    let trimmed = value.trim();
    let normalized = trimmed.strip_prefix("0x").unwrap_or(trimmed);
    usize::from_str_radix(normalized, if trimmed.starts_with("0x") { 16 } else { 10 })
        .map_err(|error| error.to_string())
}

fn parse_signed<T>(value: &str) -> Result<T, String>
where
    T: TryFrom<i64>,
    <T as TryFrom<i64>>::Error: std::fmt::Display,
{
    let parsed = if let Some(stripped) = value.strip_prefix("0x") {
        i64::from_str_radix(stripped, 16).map_err(|error| error.to_string())?
    } else {
        value.parse::<i64>().map_err(|error| error.to_string())?
    };
    T::try_from(parsed).map_err(|error| error.to_string())
}

fn parse_unsigned<T>(value: &str) -> Result<T, String>
where
    T: TryFrom<u64>,
    <T as TryFrom<u64>>::Error: std::fmt::Display,
{
    let parsed = if let Some(stripped) = value.strip_prefix("0x") {
        u64::from_str_radix(stripped, 16).map_err(|error| error.to_string())?
    } else {
        value.parse::<u64>().map_err(|error| error.to_string())?
    };
    T::try_from(parsed).map_err(|error| error.to_string())
}

fn format_object_address(address: NativeAddress) -> String {
    format!("0x{:x}", address)
}
