mod events;
mod mutation;
mod query;
mod tasks;

use crate::state::AppState;
use std::time::Instant;

pub use mutation::{
    create_scene_child, create_scene_component, create_scene_root,
    delete_scene_component, delete_scene_object, duplicate_scene_object,
    load_scene_by_build_index, rename_scene_object, reparent_scene_object,
    set_scene_behaviour_enabled, set_scene_object_active,
    set_scene_object_hide_flags, set_scene_object_layer,
    set_scene_object_tag, set_scene_object_transform,
};
pub use query::{
    get_scene_object_children, get_scene_object_inspector,
    start_scene_refresh,
};
pub use tasks::{
    cancel_scene_object_children_analysis,
    cancel_scene_object_inspector_analysis, get_scene_object_children_state,
    get_scene_object_inspector_state, start_scene_object_children_analysis,
    start_scene_object_inspector_analysis,
};

pub(crate) fn log_scene_duration(label: &str, started_at: Instant, details: &str) {
    eprintln!(
        "[perf][scene-service] {label} completed in {}ms {details}",
        started_at.elapsed().as_millis()
    );
}

pub(crate) fn current_scene_session_key(state: &AppState) -> Option<String> {
    state.workspace_session.lifecycle.current().runtime_session.session_key
}