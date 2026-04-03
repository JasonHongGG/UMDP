use crate::domain::analysis_models::{
    ClassDescriptor, RuntimeFieldSetFailureKind, RuntimeFieldSetRequest, RuntimeFieldSetResult,
};
use crate::infrastructure::native::memory::RemoteMemory;
use crate::infrastructure::native::runtime_api::{NativeAddress, NativeFieldRecord, RuntimeApi};
use crate::kernel::runtime::overlay;

pub fn set_runtime_field_value(
    runtime_api: &dyn RuntimeApi,
    pid: u32,
    descriptor: &ClassDescriptor,
    request: &RuntimeFieldSetRequest,
) -> Result<RuntimeFieldSetResult, String> {
    let image = overlay::resolve_image(runtime_api, &descriptor.bridge_image_name)?;
    let class_handle = runtime_api.resolve_class(image, &descriptor.namespace, &descriptor.name)?;
    let hierarchy = overlay::build_class_hierarchy(runtime_api, class_handle)?;

    let mut static_fields = Vec::new();
    let mut instance_fields = Vec::new();
    for class in hierarchy {
        for field in runtime_api.enumerate_fields(class)? {
            if field.is_static {
                static_fields.push(field);
            } else {
                instance_fields.push(field);
            }
        }
    }

    let candidates = if request.is_static {
        &static_fields
    } else {
        &instance_fields
    };

    let instance_address = request
        .instance_address
        .as_deref()
        .map(parse_address)
        .transpose()?;
    let target_address = request
        .target_address
        .as_deref()
        .map(parse_address)
        .transpose()?;

    let field = candidates.iter().find(|field| {
        if field.name != request.field_name
            || field.type_name != request.field_type_name
            || field.is_static != request.is_static
        {
            return false;
        }

        if let Some(target_address) = target_address {
            if field.is_static {
                return field.static_address == Some(target_address);
            }
            if let (Some(instance_address), Some(offset)) = (instance_address, field.offset) {
                return instance_address + offset == target_address;
            }
        }

        true
    });

    let Some(field) = field else {
        return Ok(RuntimeFieldSetResult {
            class_stable_id: request.class_stable_id.clone(),
            member_stable_id: request.member_stable_id.clone(),
            field_name: request.field_name.clone(),
            field_type_name: request.field_type_name.clone(),
            is_static: request.is_static,
            address: request.target_address.clone(),
            success: false,
            failure_kind: RuntimeFieldSetFailureKind::FieldNotFound,
            error: Some("field not found".to_string()),
            previous_value: None,
            applied_value: None,
        });
    };

    let Some(resolved_address) = resolve_field_address(field, instance_address) else {
        return Ok(RuntimeFieldSetResult {
            class_stable_id: request.class_stable_id.clone(),
            member_stable_id: request.member_stable_id.clone(),
            field_name: field.name.clone(),
            field_type_name: field.type_name.clone(),
            is_static: field.is_static,
            address: request.target_address.clone(),
            success: false,
            failure_kind: RuntimeFieldSetFailureKind::InstanceRequired,
            error: Some("instance address is required for non-static field".to_string()),
            previous_value: None,
            applied_value: None,
        });
    };

    if let Some(target_address) = target_address {
        if target_address != resolved_address {
            return Ok(RuntimeFieldSetResult {
                class_stable_id: request.class_stable_id.clone(),
                member_stable_id: request.member_stable_id.clone(),
                field_name: field.name.clone(),
                field_type_name: field.type_name.clone(),
                is_static: field.is_static,
                address: Some(format_hex_address(resolved_address)),
                success: false,
                failure_kind: RuntimeFieldSetFailureKind::AddressMismatch,
                error: Some("resolved field address does not match target address".to_string()),
                previous_value: None,
                applied_value: None,
            });
        }
    }

    let previous_value = overlay::read_field_value(runtime_api, field, instance_address)?;
    let memory = RemoteMemory::open(pid)?;

    let write_result = apply_field_write(&memory, runtime_api, field, resolved_address, request);
    if let Err((failure_kind, error)) = write_result {
        return Ok(RuntimeFieldSetResult {
            class_stable_id: request.class_stable_id.clone(),
            member_stable_id: request.member_stable_id.clone(),
            field_name: field.name.clone(),
            field_type_name: field.type_name.clone(),
            is_static: field.is_static,
            address: Some(format_hex_address(resolved_address)),
            success: false,
            failure_kind,
            error: Some(error),
            previous_value,
            applied_value: None,
        });
    }

    let applied_value = overlay::read_field_value(runtime_api, field, instance_address)?;
    Ok(RuntimeFieldSetResult {
        class_stable_id: request.class_stable_id.clone(),
        member_stable_id: request.member_stable_id.clone(),
        field_name: field.name.clone(),
        field_type_name: field.type_name.clone(),
        is_static: field.is_static,
        address: Some(format_hex_address(resolved_address)),
        success: true,
        failure_kind: RuntimeFieldSetFailureKind::None,
        error: None,
        previous_value,
        applied_value,
    })
}

fn resolve_field_address(
    field: &NativeFieldRecord,
    instance_address: Option<NativeAddress>,
) -> Option<NativeAddress> {
    if field.is_static {
        return field.static_address;
    }
    let offset = field.offset?;
    Some(instance_address? + offset)
}

fn apply_field_write(
    memory: &RemoteMemory,
    runtime_api: &dyn RuntimeApi,
    field: &NativeFieldRecord,
    address: NativeAddress,
    request: &RuntimeFieldSetRequest,
) -> Result<(), (RuntimeFieldSetFailureKind, String)> {
    match field.type_name.as_str() {
        "System.Boolean" => {
            let value = match request.serialized_value.as_deref() {
                Some("true") => 1u8,
                Some("false") => 0u8,
                Some(other) => {
                    return Err((
                        RuntimeFieldSetFailureKind::InvalidValue,
                        format!("invalid boolean value: {}", other),
                    ));
                }
                None => {
                    return Err((
                        RuntimeFieldSetFailureKind::InvalidValue,
                        "missing boolean value".to_string(),
                    ))
                }
            };
            write_protected_value(memory, address, &value).map_err(write_failed)
        }
        "System.Byte" => write_numeric::<u8, _>(
            memory,
            address,
            request.serialized_value.as_deref(),
            parse_unsigned,
        ),
        "System.SByte" => write_numeric::<i8, _>(
            memory,
            address,
            request.serialized_value.as_deref(),
            parse_signed,
        ),
        "System.Int16" => write_numeric::<i16, _>(
            memory,
            address,
            request.serialized_value.as_deref(),
            parse_signed,
        ),
        "System.UInt16" => write_numeric::<u16, _>(
            memory,
            address,
            request.serialized_value.as_deref(),
            parse_unsigned,
        ),
        "System.Int32" => write_numeric::<i32, _>(
            memory,
            address,
            request.serialized_value.as_deref(),
            parse_signed,
        ),
        "System.UInt32" => write_numeric::<u32, _>(
            memory,
            address,
            request.serialized_value.as_deref(),
            parse_unsigned,
        ),
        "System.Int64" => write_numeric::<i64, _>(
            memory,
            address,
            request.serialized_value.as_deref(),
            parse_signed,
        ),
        "System.UInt64" => write_numeric::<u64, _>(
            memory,
            address,
            request.serialized_value.as_deref(),
            parse_unsigned,
        ),
        "System.Single" => {
            let value = request
                .serialized_value
                .as_deref()
                .ok_or_else(|| {
                    (
                        RuntimeFieldSetFailureKind::InvalidValue,
                        "missing floating-point value".to_string(),
                    )
                })
                .and_then(|value| {
                    value.parse::<f32>().map_err(|error| {
                        (RuntimeFieldSetFailureKind::InvalidValue, error.to_string())
                    })
                })?;
            write_protected_value(memory, address, &value).map_err(write_failed)
        }
        "System.Double" => {
            let value = request
                .serialized_value
                .as_deref()
                .ok_or_else(|| {
                    (
                        RuntimeFieldSetFailureKind::InvalidValue,
                        "missing floating-point value".to_string(),
                    )
                })
                .and_then(|value| {
                    value.parse::<f64>().map_err(|error| {
                        (RuntimeFieldSetFailureKind::InvalidValue, error.to_string())
                    })
                })?;
            write_protected_value(memory, address, &value).map_err(write_failed)
        }
        "System.IntPtr" | "System.UIntPtr" | _
            if matches!(
                request.value_kind,
                crate::domain::analysis_models::RuntimeFieldValueKind::Address
            ) =>
        {
            let value = request
                .serialized_value
                .as_deref()
                .ok_or_else(|| {
                    (
                        RuntimeFieldSetFailureKind::InvalidValue,
                        "missing address value".to_string(),
                    )
                })
                .and_then(|value| {
                    parse_address(value)
                        .map_err(|error| (RuntimeFieldSetFailureKind::InvalidValue, error))
                })?;
            write_protected_value(memory, address, &value).map_err(write_failed)
        }
        "System.String" => {
            let string_object = runtime_api
                .create_managed_string(request.serialized_value.as_deref().unwrap_or_default())
                .map_err(write_failed)?;
            write_protected_value(memory, address, &string_object).map_err(write_failed)
        }
        _ => Err((
            RuntimeFieldSetFailureKind::UnsupportedType,
            format!("unsupported field type: {}", field.type_name),
        )),
    }
}

fn write_numeric<T, F>(
    memory: &RemoteMemory,
    address: NativeAddress,
    raw_value: Option<&str>,
    parser: F,
) -> Result<(), (RuntimeFieldSetFailureKind, String)>
where
    T: Copy,
    F: FnOnce(&str) -> Result<T, String>,
{
    let raw_value = raw_value.ok_or_else(|| {
        (
            RuntimeFieldSetFailureKind::InvalidValue,
            "missing numeric value".to_string(),
        )
    })?;
    let value =
        parser(raw_value).map_err(|error| (RuntimeFieldSetFailureKind::InvalidValue, error))?;
    write_protected_value(memory, address, &value).map_err(write_failed)
}

fn write_protected_value<T: Copy>(
    memory: &RemoteMemory,
    address: NativeAddress,
    value: &T,
) -> Result<(), String> {
    let size = std::mem::size_of::<T>();
    let previous = memory.protect(
        address,
        size,
        windows::Win32::System::Memory::PAGE_EXECUTE_READWRITE.0,
    )?;
    let write_result = memory.write_value(address, value);
    let restore_result = memory.protect(address, size, previous);
    write_result?;
    restore_result?;
    Ok(())
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

fn parse_address(value: &str) -> Result<NativeAddress, String> {
    let trimmed = value.trim();
    let normalized = trimmed.strip_prefix("0x").unwrap_or(trimmed);
    usize::from_str_radix(normalized, if trimmed.starts_with("0x") { 16 } else { 10 })
        .map_err(|error| error.to_string())
}

fn write_failed(error: impl ToString) -> (RuntimeFieldSetFailureKind, String) {
    (RuntimeFieldSetFailureKind::WriteFailed, error.to_string())
}

fn format_hex_address(address: NativeAddress) -> String {
    format!("{:x}", address)
}
