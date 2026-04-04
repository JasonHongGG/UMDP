use crate::infrastructure::logging;
use crate::state::AppState;
use std::time::Instant;

pub(crate) fn log_scene_duration(label: &str, started_at: Instant, details: &str) {
    logging::debug(
        "scene",
        "scene_kernel",
        &format!("{label} completed."),
        vec![
            ("durationMs", started_at.elapsed().as_millis().to_string()),
            ("details", details.to_string()),
        ],
    );
}

pub(crate) fn current_scene_session_key(state: &AppState) -> Option<String> {
    state
        .workspace()
        .lifecycle()
        .current()
        .runtime_session
        .session_key
}