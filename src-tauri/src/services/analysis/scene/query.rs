use super::events::emit_scene_workspace_state;
use super::{current_scene_session_key, log_scene_duration};
use crate::domain::analysis_models::{
    RuntimeSceneCatalogSnapshot, RuntimeSceneChildrenPageSnapshot,
    RuntimeSceneChildrenSnapshot, RuntimeSceneComponentsPageSnapshot,
    RuntimeSceneObjectInspectorHeaderSnapshot,
    RuntimeSceneObjectInspectorSnapshot, SceneWorkspaceState,
};
use crate::kernel::runtime::access::current_runtime_session;
use crate::kernel::runtime::session::RuntimeSession;
use crate::kernel::scene::query as native_scene;
use crate::services::analysis::runtime_session_service::{
    ensure_attached_session, execute_runtime_operation,
};
use crate::state::AppState;
use std::sync::Arc;
use std::time::Instant;
use tauri::AppHandle;

pub fn start_scene_refresh(
    _app: &AppHandle,
    state: &AppState,
) -> Result<SceneWorkspaceState, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_query_runtime_ready(state)?;
    let session_key = current_scene_session_key(state);
    let workspace = state.scene_module.workspace.set_refreshing(session_key.clone());
    emit_scene_workspace_state(_app, &workspace);

    let snapshot = match execute_runtime_operation(state, || load_scene_catalog(state)) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            let workspace = state
                .scene_module
                .workspace
                .set_error(session_key.as_deref(), error.clone());
            emit_scene_workspace_state(_app, &workspace);
            return Err(error);
        }
    };

    let scene_count = snapshot.scenes.len();
    let root_count = snapshot
        .scenes
        .iter()
        .map(|scene| scene.roots.len())
        .sum::<usize>();
    let workspace = state
        .scene_module
        .workspace
        .set_snapshot(session_key.as_deref(), snapshot);
    emit_scene_workspace_state(_app, &workspace);
    if current_scene_session_key(state) == session_key {
        state.scene_module.children.reset();
        state.scene_module.inspector.reset();
    }
    log_scene_duration(
        "start_scene_refresh",
        started_at,
        &format!("scene_count={scene_count} root_count={root_count}"),
    );
    Ok(workspace)
}

pub fn get_scene_object_children(
    _app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneChildrenSnapshot, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_query_runtime_ready(state)?;

    let snapshot = execute_runtime_operation(state, || {
        load_scene_children(state, object_address)
    })?;
    log_scene_duration(
        "get_scene_object_children",
        started_at,
        &format!(
            "object_address={object_address} child_count={}",
            snapshot.children.len()
        ),
    );
    Ok(snapshot)
}

pub fn get_scene_object_inspector(
    _app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneObjectInspectorSnapshot, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_query_runtime_ready(state)?;

    let snapshot = execute_runtime_operation(state, || {
        load_scene_inspector(state, object_address)
    })?;
    log_scene_duration(
        "get_scene_object_inspector",
        started_at,
        &format!(
            "object_address={object_address} children={} components={}",
            snapshot.children.len(),
            snapshot.components.len()
        ),
    );
    Ok(snapshot)
}

pub(super) fn load_scene_catalog(
    state: &AppState,
) -> Result<RuntimeSceneCatalogSnapshot, String> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let runtime_session = require_runtime_session(state)?;
    let snapshot = native_scene::load_scene_catalog(runtime_session.as_ref())?;
    log_scene_duration(
        "load_scene_catalog",
        started_at,
        &format!("pid={} scene_count={}", attached.pid, snapshot.scenes.len()),
    );
    Ok(snapshot)
}

pub(super) fn load_scene_children(
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneChildrenSnapshot, String> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let runtime_session = require_runtime_session(state)?;
    let snapshot = native_scene::load_scene_children(runtime_session.as_ref(), object_address)?;
    log_scene_duration(
        "load_scene_children",
        started_at,
        &format!(
            "pid={} object_address={} child_count={}",
            attached.pid,
            object_address,
            snapshot.children.len()
        ),
    );
    Ok(snapshot)
}

pub(super) fn load_scene_children_page(
    state: &AppState,
    object_address: &str,
    offset: usize,
    limit: usize,
) -> Result<RuntimeSceneChildrenPageSnapshot, String> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let runtime_session = require_runtime_session(state)?;
    let snapshot = native_scene::load_scene_children_page(
        runtime_session.as_ref(),
        object_address,
        offset,
        limit,
    )?;
    log_scene_duration(
        "load_scene_children_page",
        started_at,
        &format!(
            "pid={} object_address={} offset={} loaded={} total={}",
            attached.pid,
            object_address,
            snapshot.offset,
            snapshot.children.len(),
            snapshot.total_count
        ),
    );
    Ok(snapshot)
}

pub(super) fn load_scene_inspector(
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneObjectInspectorSnapshot, String> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let runtime_session = require_runtime_session(state)?;
    let snapshot = native_scene::load_scene_inspector(runtime_session.as_ref(), object_address)?;
    log_scene_duration(
        "load_scene_inspector",
        started_at,
        &format!(
            "pid={} object_address={} children={} components={}",
            attached.pid,
            object_address,
            snapshot.children.len(),
            snapshot.components.len()
        ),
    );
    Ok(snapshot)
}

pub(super) fn load_scene_inspector_header(
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneObjectInspectorHeaderSnapshot, String> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let runtime_session = require_runtime_session(state)?;
    let snapshot = native_scene::load_scene_inspector_header(runtime_session.as_ref(), object_address)?;
    log_scene_duration(
        "load_scene_inspector_header",
        started_at,
        &format!("pid={} object_address={object_address}", attached.pid),
    );
    Ok(snapshot)
}

pub(super) fn load_scene_inspector_children_page(
    state: &AppState,
    object_address: &str,
    offset: usize,
    limit: usize,
) -> Result<RuntimeSceneChildrenPageSnapshot, String> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let runtime_session = require_runtime_session(state)?;
    let snapshot = native_scene::load_scene_inspector_children_page(
        runtime_session.as_ref(),
        object_address,
        offset,
        limit,
    )?;
    log_scene_duration(
        "load_scene_inspector_children_page",
        started_at,
        &format!(
            "pid={} object_address={} offset={} loaded={} total={}",
            attached.pid,
            object_address,
            snapshot.offset,
            snapshot.children.len(),
            snapshot.total_count
        ),
    );
    Ok(snapshot)
}

pub(super) fn load_scene_inspector_components_page(
    state: &AppState,
    object_address: &str,
    offset: usize,
    limit: usize,
) -> Result<RuntimeSceneComponentsPageSnapshot, String> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let runtime_session = require_runtime_session(state)?;
    let snapshot = native_scene::load_scene_inspector_components_page(
        runtime_session.as_ref(),
        object_address,
        offset,
        limit,
    )?;
    log_scene_duration(
        "load_scene_inspector_components_page",
        started_at,
        &format!(
            "pid={} object_address={} offset={} loaded={} total={}",
            attached.pid,
            object_address,
            snapshot.offset,
            snapshot.components.len(),
            snapshot.total_count
        ),
    );
    Ok(snapshot)
}

pub(super) fn ensure_scene_query_runtime_ready(
    state: &AppState,
) -> Result<(), String> {
    let runtime_session = require_runtime_session(state)?;
    if runtime_session.runtime_api().is_none() {
        return Err("Native runtime session is missing its runtime API".to_string());
    }
    Ok(())
}

fn require_runtime_session(state: &AppState) -> Result<Arc<RuntimeSession>, String> {
    current_runtime_session(state)
        .ok_or_else(|| "Native runtime session is unavailable".to_string())
}
