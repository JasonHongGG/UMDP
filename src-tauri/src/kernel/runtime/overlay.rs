use crate::domain::analysis_models::ClassDescriptor;
use crate::infrastructure::native::runtime_api::{NativeAddress, NativeFieldRecord, RuntimeApi};

#[derive(Debug, Clone)]
pub struct NativeOverlayStaticField {
    pub name: String,
    pub field_type: String,
    pub address: Option<String>,
    pub value: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NativeOverlayField {
    pub name: String,
    pub field_type: String,
    pub offset: Option<String>,
    pub address: Option<String>,
    pub value: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NativeOverlayResult {
    pub static_fields: Vec<NativeOverlayStaticField>,
    pub fields: Vec<NativeOverlayField>,
}

pub fn load_class_overlay(
    runtime_api: &dyn RuntimeApi,
    descriptor: &ClassDescriptor,
    instance_address: Option<NativeAddress>,
) -> Result<NativeOverlayResult, String> {
    let image = resolve_image(runtime_api, &descriptor.bridge_image_name)?;
    let class_handle = runtime_api.resolve_class(image, &descriptor.namespace, &descriptor.name)?;
    let hierarchy = build_class_hierarchy(runtime_api, class_handle)?;

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

    Ok(NativeOverlayResult {
        static_fields: static_fields
            .iter()
            .map(|field| NativeOverlayStaticField {
                name: field.name.clone(),
                field_type: field.type_name.clone(),
                address: field.static_address.map(format_hex_address),
                value: read_field_value(runtime_api, field, None).ok().flatten(),
            })
            .collect(),
        fields: instance_fields
            .iter()
            .map(|field| NativeOverlayField {
                name: field.name.clone(),
                field_type: field.type_name.clone(),
                offset: field.offset.map(format_hex_offset),
                address: instance_address.and_then(|address| field.offset.map(|offset| format_hex_address(address + offset))),
                value: instance_address.and_then(|address| read_field_value(runtime_api, field, Some(address)).ok().flatten()),
            })
            .collect(),
    })
}

pub(crate) fn resolve_image(runtime_api: &dyn RuntimeApi, image_name: &str) -> Result<NativeAddress, String> {
    let expected = image_name.to_ascii_lowercase();
    let without_extension = expected.strip_suffix(".dll").unwrap_or(&expected);
    for assembly in runtime_api.enumerate_assemblies()? {
        let image = runtime_api.get_assembly_image(assembly)?;
        if image == 0 {
            continue;
        }
        let actual_name = runtime_api.get_image_name(image)?.to_ascii_lowercase();
        if actual_name == expected || actual_name == without_extension {
            return Ok(image);
        }
    }

    Err("image not found".to_string())
}

pub(crate) fn build_class_hierarchy(runtime_api: &dyn RuntimeApi, class_handle: NativeAddress) -> Result<Vec<NativeAddress>, String> {
    let mut hierarchy = Vec::new();
    let mut current = class_handle;
    while current != 0 {
        hierarchy.push(current);
        current = runtime_api.get_parent_class(current)?;
    }
    hierarchy.reverse();
    Ok(hierarchy)
}

pub(crate) fn read_field_value(
    runtime_api: &dyn RuntimeApi,
    field: &NativeFieldRecord,
    instance_address: Option<NativeAddress>,
) -> Result<Option<String>, String> {
    let try_read = |size: usize| -> Result<Option<Vec<u8>>, String> {
        if field.is_static {
            runtime_api.try_read_static_field_bytes(field, size)
        } else if let Some(instance) = instance_address {
            runtime_api.try_read_instance_field_bytes(instance, field, size)
        } else {
            Ok(None)
        }
    };

    match field.type_name.as_str() {
        "System.Boolean" => Ok(try_read(1)?.map(|bytes| if bytes[0] == 0 { "false".to_string() } else { "true".to_string() })),
        "System.Byte" => Ok(try_read(1)?.map(|bytes| bytes[0].to_string())),
        "System.SByte" => Ok(try_read(1)?.map(|bytes| (bytes[0] as i8).to_string())),
        "System.Int16" => Ok(try_read(2)?.map(|bytes| i16::from_le_bytes([bytes[0], bytes[1]]).to_string())),
        "System.UInt16" => Ok(try_read(2)?.map(|bytes| u16::from_le_bytes([bytes[0], bytes[1]]).to_string())),
        "System.Int32" => Ok(try_read(4)?.map(|bytes| i32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]).to_string())),
        "System.UInt32" => Ok(try_read(4)?.map(|bytes| u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]).to_string())),
        "System.Int64" => Ok(try_read(8)?.map(|bytes| i64::from_le_bytes(bytes.try_into().unwrap()).to_string())),
        "System.UInt64" => Ok(try_read(8)?.map(|bytes| u64::from_le_bytes(bytes.try_into().unwrap()).to_string())),
        "System.Single" => Ok(try_read(4)?.map(|bytes| f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]).to_string())),
        "System.Double" => Ok(try_read(8)?.map(|bytes| f64::from_le_bytes(bytes.try_into().unwrap()).to_string())),
        _ => {
            let pointer_value = if cfg!(target_pointer_width = "64") {
                try_read(8)?.map(|bytes| usize::from_le_bytes(bytes.try_into().unwrap()))
            } else {
                try_read(4)?.map(|bytes| u32::from_le_bytes(bytes.try_into().unwrap()) as usize)
            };

            Ok(pointer_value.map(|value| {
                if value == 0 {
                    "null".to_string()
                } else {
                    format!("0x{}", format_hex_address(value))
                }
            }))
        }
    }
}

fn format_hex_address(address: NativeAddress) -> String {
    format!("{:x}", address)
}

fn format_hex_offset(offset: usize) -> String {
    format!("{:03X}", offset)
}