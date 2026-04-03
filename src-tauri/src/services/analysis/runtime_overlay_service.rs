use crate::domain::analysis_models::{
    create_field_stable_id, FieldDescriptor, RuntimeClassOverlayDescriptor, RuntimeInstanceFieldSnapshot,
    RuntimeOverlaySnapshot, RuntimeResolvedFieldDescriptor, StaticFieldDescriptor,
};
use crate::domain::operation::{OperationError, OperationResult};
use crate::infrastructure::clock::current_timestamp;
use crate::kernel::runtime::overlay as native_overlay;
use crate::services::analysis::runtime_session_service::{
    ensure_runtime_session_ready, execute_runtime_operation, present, resolve_class_descriptor,
};
use crate::state::AppState;
use tauri::AppHandle;

pub fn get_runtime_static_fields(
    _app: &AppHandle,
    state: &AppState,
    class_stable_id: &str,
) -> Result<RuntimeOverlaySnapshot, String> {
    let descriptor = resolve_class_descriptor(state, class_stable_id).map_err(String::from)?;

    present(execute_runtime_operation(state, || {
        let response = load_native_overlay_response(state, &descriptor, None)?;

        let overlay = RuntimeClassOverlayDescriptor {
            class_stable_id: descriptor.stable_id.clone(),
            fields: response
                .fields
                .into_iter()
                .map(|field| FieldDescriptor {
                    stable_id: create_field_stable_id(
                        &descriptor.stable_id,
                        &field.name,
                        &field.field_type,
                        "instance",
                    ),
                    name: field.name,
                    field_type: field.field_type,
                    offset: field.offset,
                })
                .collect(),
            static_fields: response
                .static_fields
                .into_iter()
                .map(|field| StaticFieldDescriptor {
                    stable_id: create_field_stable_id(
                        &descriptor.stable_id,
                        &field.name,
                        &field.field_type,
                        "static",
                    ),
                    name: field.name,
                    field_type: field.field_type,
                    offset: None,
                    address: field.address,
                    value: field.value,
                })
                .collect(),
        };

        Ok::<RuntimeOverlaySnapshot, OperationError>(RuntimeOverlaySnapshot {
            schema_version: 1,
            generated_at: current_timestamp(),
            classes: std::collections::HashMap::from([(descriptor.stable_id.clone(), overlay)]),
        })
    }))
}

pub fn get_runtime_instance_fields(
    _app: &AppHandle,
    state: &AppState,
    class_stable_id: &str,
    instance_address: &str,
) -> Result<RuntimeInstanceFieldSnapshot, String> {
    let descriptor = resolve_class_descriptor(state, class_stable_id).map_err(String::from)?;

    present(execute_runtime_operation(state, || {
        let parsed_instance_address = parse_address(instance_address)?;
        let response = load_native_overlay_response(state, &descriptor, Some(parsed_instance_address))?;

        Ok::<RuntimeInstanceFieldSnapshot, OperationError>(RuntimeInstanceFieldSnapshot {
            class_stable_id: descriptor.stable_id.clone(),
            instance_address: instance_address.to_string(),
            fields: response
                .fields
                .into_iter()
                .map(|field| RuntimeResolvedFieldDescriptor {
                    stable_id: create_field_stable_id(
                        &descriptor.stable_id,
                        &field.name,
                        &field.field_type,
                        "instance",
                    ),
                    name: field.name,
                    field_type: field.field_type,
                    offset: field.offset,
                    address: field.address,
                    value: field.value,
                })
                .collect(),
        })
    }))
}

struct NativeOverlayFieldRow {
    address: Option<String>,
    value: Option<String>,
    offset: Option<String>,
    name: String,
    field_type: String,
}

struct NativeOverlayStaticFieldRow {
    address: Option<String>,
    value: Option<String>,
    name: String,
    field_type: String,
}

struct NativeOverlayResponse {
    static_fields: Vec<NativeOverlayStaticFieldRow>,
    fields: Vec<NativeOverlayFieldRow>,
}

impl NativeOverlayResponse {
    fn from_native(response: native_overlay::NativeOverlayResult) -> Self {
        Self {
            static_fields: response
                .static_fields
                .into_iter()
                .map(|field| NativeOverlayStaticFieldRow {
                    address: field.address,
                    value: field.value,
                    name: field.name,
                    field_type: field.field_type,
                })
                .collect(),
            fields: response
                .fields
                .into_iter()
                .map(|field| NativeOverlayFieldRow {
                    address: field.address,
                    value: field.value,
                    offset: field.offset,
                    name: field.name,
                    field_type: field.field_type,
                })
                .collect(),
        }
    }
}

fn load_native_overlay_response(
    state: &AppState,
    descriptor: &crate::domain::analysis_models::ClassDescriptor,
    instance_address: Option<usize>,
) -> OperationResult<NativeOverlayResponse> {
    let runtime_session = ensure_runtime_session_ready(state)?;
    let runtime_api = runtime_session
        .runtime_api()
        .ok_or_else(OperationError::runtime_api_unavailable)?;
    let overlay = native_overlay::load_class_overlay(runtime_api, descriptor, instance_address)
        .map_err(OperationError::from)?;
    Ok(NativeOverlayResponse::from_native(overlay))
}

fn parse_address(value: &str) -> OperationResult<usize> {
    let trimmed = value.trim();
    let normalized = trimmed.strip_prefix("0x").unwrap_or(trimmed);
    usize::from_str_radix(normalized, 16)
        .map_err(|error| OperationError::invalid_address(format!("Invalid instance address '{}': {}", value, error)))
}