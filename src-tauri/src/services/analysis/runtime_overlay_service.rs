use crate::domain::analysis_models::{
    create_field_stable_id, FieldDescriptor, RuntimeClassOverlayDescriptor, RuntimeInstanceFieldSnapshot,
    RuntimeOverlaySnapshot, RuntimeResolvedFieldDescriptor, StaticFieldDescriptor,
};
use crate::services::analysis::bridge_gateway::{current_timestamp, BridgeGateway, ProcessBridgeGateway};
use crate::services::analysis::bridge_transport::AppBridgeTransport;
use crate::services::analysis::runtime_session_service::{
    ensure_attached_session, execute_runtime_operation, resolve_class_descriptor,
};
use crate::state::AppState;
use tauri::AppHandle;

pub fn get_runtime_static_fields(
    app: &AppHandle,
    state: &AppState,
    class_stable_id: &str,
) -> Result<RuntimeOverlaySnapshot, String> {
    let attached = ensure_attached_session(state)?;
    let descriptor = resolve_class_descriptor(state, class_stable_id)?;

    execute_runtime_operation(state, || {
        let gateway = ProcessBridgeGateway::new(AppBridgeTransport::new(state));
        let response = gateway.load_runtime_overlay(app, attached.pid, &descriptor, None)?;

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
                    legacy_field_name: field.name.clone(),
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
                    legacy_field_name: field.name.clone(),
                    name: field.name,
                    field_type: field.field_type,
                    offset: None,
                    address: field.address,
                    value: field.value,
                })
                .collect(),
        };

        Ok(RuntimeOverlaySnapshot {
            schema_version: 1,
            generated_at: current_timestamp(),
            classes: std::collections::HashMap::from([(descriptor.stable_id.clone(), overlay)]),
        })
    })
}

pub fn get_runtime_instance_fields(
    app: &AppHandle,
    state: &AppState,
    class_stable_id: &str,
    instance_address: &str,
) -> Result<RuntimeInstanceFieldSnapshot, String> {
    let attached = ensure_attached_session(state)?;
    let descriptor = resolve_class_descriptor(state, class_stable_id)?;

    execute_runtime_operation(state, || {
        let gateway = ProcessBridgeGateway::new(AppBridgeTransport::new(state));
        let response = gateway.load_runtime_overlay(app, attached.pid, &descriptor, Some(instance_address))?;

        Ok(RuntimeInstanceFieldSnapshot {
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
                    legacy_field_name: field.name.clone(),
                    name: field.name,
                    field_type: field.field_type,
                    offset: field.offset,
                    address: field.address,
                    value: field.value,
                })
                .collect(),
        })
    })
}