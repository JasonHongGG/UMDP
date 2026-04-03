use crate::state::AppState;
use std::time::Instant;

pub(crate) fn log_scene_duration(label: &str, started_at: Instant, details: &str) {
    eprintln!(
        "[perf][scene-service] {label} completed in {}ms {details}",
        started_at.elapsed().as_millis()
    );
}

pub(crate) fn current_scene_session_key(state: &AppState) -> Option<String> {
    state.workspace().lifecycle().current().runtime_session.session_key
}