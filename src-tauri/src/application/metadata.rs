use crate::domain::analysis_models::{
    RuntimeInstanceFieldSnapshot, RuntimeOverlaySnapshot,
};
use crate::services::analysis::runtime_overlay_service;
use crate::state::AppState;
use tauri::AppHandle;

pub fn get_runtime_static_fields(
    app: &AppHandle,
    state: &AppState,
    class_stable_id: &str,
) -> Result<RuntimeOverlaySnapshot, String> {
    runtime_overlay_service::get_runtime_static_fields(app, state, class_stable_id)
}

pub fn get_runtime_instance_fields(
    app: &AppHandle,
    state: &AppState,
    class_stable_id: &str,
    instance_address: &str,
) -> Result<RuntimeInstanceFieldSnapshot, String> {
    runtime_overlay_service::get_runtime_instance_fields(
        app,
        state,
        class_stable_id,
        instance_address,
    )
}