use crate::domain::analysis_models::AnalysisSnapshot;
use crate::services::analysis::bridge_gateway::{current_timestamp, BridgeGateway, ProcessBridgeGateway};
use crate::services::analysis::bridge_transport::AppBridgeTransport;
use crate::services::analysis::runtime_session_service::{ensure_attached_session, execute_runtime_operation};
use crate::state::AppState;
use tauri::AppHandle;
use std::time::Instant;

pub fn load_all_metadata(app: &AppHandle, state: &AppState) -> Result<AnalysisSnapshot, String> {
    let attached = ensure_attached_session(state)?;

    execute_runtime_operation(state, || {
        let started_at = Instant::now();
        let gateway = ProcessBridgeGateway::new(AppBridgeTransport::new(state));
        let metadata_input = attached
            .data_dir
            .clone()
            .or(attached.managed_dir.clone())
            .ok_or_else(|| "Attached process has no Unity data directory or managed directory".to_string())?;

        let mut response = gateway.load_all_metadata(app, &metadata_input)?;

        response.process = Some(attached.clone());
        response.generated_at = current_timestamp();

        eprintln!(
            "[perf][metadata] load_all_metadata service completed in {}ms input={} class_count={} image_count={}",
            started_at.elapsed().as_millis(),
            metadata_input,
            response.classes.len(),
            response.images.len()
        );

        state.analysis.set_metadata_snapshot(response.clone());
        Ok(response)
    })
}
