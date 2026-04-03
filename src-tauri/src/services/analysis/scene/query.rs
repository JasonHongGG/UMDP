use super::events::emit_scene_workspace_state;
use super::{current_scene_session_key, log_scene_duration};
use crate::domain::analysis_models::{
    RuntimeSceneCatalogSnapshot, RuntimeSceneChildrenPageSnapshot, RuntimeSceneChildrenSnapshot,
    RuntimeSceneComponentsPageSnapshot, RuntimeSceneObjectInspectorHeaderSnapshot,
    RuntimeSceneObjectInspectorSnapshot, SceneWorkspaceState,
};
use crate::domain::operation::{OperationError, OperationResult};
use crate::kernel::runtime::session::RuntimeSession;
use crate::kernel::scene::query as native_scene;
use crate::services::analysis::runtime_session_service::{
    ensure_attached_session, ensure_runtime_session_ready, execute_runtime_operation, present,
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
    present(ensure_attached_session(state).map(|_| ()))?;
    present(ensure_scene_query_runtime_ready(state))?;
    let session_key = current_scene_session_key(state);
    let workspace = state
        .scene()
        .workspace()
        .set_refreshing(session_key.clone());
    emit_scene_workspace_state(_app, &workspace);

    let snapshot = match execute_runtime_operation(state, || load_scene_catalog(state)) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            let workspace = state
                .scene()
                .workspace()
                .set_error(session_key.as_deref(), error.to_string());
            emit_scene_workspace_state(_app, &workspace);
            return Err(error.into());
        }
    };

    let scene_count = snapshot.scenes.len();
    let root_count = snapshot
        .scenes
        .iter()
        .map(|scene| scene.roots.len())
        .sum::<usize>();
    let workspace = state
        .scene()
        .workspace()
        .set_snapshot(session_key.as_deref(), snapshot);
    emit_scene_workspace_state(_app, &workspace);
    if current_scene_session_key(state) == session_key {
        state.scene().children().reset();
        state.scene().inspector().reset();
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
    present(ensure_attached_session(state).map(|_| ()))?;
    present(ensure_scene_query_runtime_ready(state))?;

    let snapshot = present(execute_runtime_operation(state, || {
        load_scene_children(state, object_address)
    }))?;
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
    present(ensure_attached_session(state).map(|_| ()))?;
    present(ensure_scene_query_runtime_ready(state))?;

    let snapshot = present(execute_runtime_operation(state, || {
        load_scene_inspector(state, object_address)
    }))?;
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

pub(super) fn load_scene_catalog(state: &AppState) -> OperationResult<RuntimeSceneCatalogSnapshot> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let runtime_session = require_runtime_session(state)?;
    let snapshot =
        native_scene::load_scene_catalog(runtime_session.as_ref()).map_err(OperationError::from)?;
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
) -> OperationResult<RuntimeSceneChildrenSnapshot> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let runtime_session = require_runtime_session(state)?;
    let snapshot = native_scene::load_scene_children(runtime_session.as_ref(), object_address)
        .map_err(OperationError::from)?;
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
) -> OperationResult<RuntimeSceneChildrenPageSnapshot> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let runtime_session = require_runtime_session(state)?;
    let snapshot = native_scene::load_scene_children_page(
        runtime_session.as_ref(),
        object_address,
        offset,
        limit,
    )
    .map_err(OperationError::from)?;
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
) -> OperationResult<RuntimeSceneObjectInspectorSnapshot> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let runtime_session = require_runtime_session(state)?;
    let snapshot = native_scene::load_scene_inspector(runtime_session.as_ref(), object_address)
        .map_err(OperationError::from)?;
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
) -> OperationResult<RuntimeSceneObjectInspectorHeaderSnapshot> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let runtime_session = require_runtime_session(state)?;
    let snapshot =
        native_scene::load_scene_inspector_header(runtime_session.as_ref(), object_address)
            .map_err(OperationError::from)?;
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
) -> OperationResult<RuntimeSceneChildrenPageSnapshot> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let runtime_session = require_runtime_session(state)?;
    let snapshot = native_scene::load_scene_inspector_children_page(
        runtime_session.as_ref(),
        object_address,
        offset,
        limit,
    )
    .map_err(OperationError::from)?;
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
) -> OperationResult<RuntimeSceneComponentsPageSnapshot> {
    let started_at = Instant::now();
    let attached = ensure_attached_session(state)?;
    let runtime_session = require_runtime_session(state)?;
    let snapshot = native_scene::load_scene_inspector_components_page(
        runtime_session.as_ref(),
        object_address,
        offset,
        limit,
    )
    .map_err(OperationError::from)?;
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

pub(super) fn ensure_scene_query_runtime_ready(state: &AppState) -> OperationResult<()> {
    require_runtime_session(state)?;
    Ok(())
}

fn require_runtime_session(state: &AppState) -> OperationResult<Arc<RuntimeSession>> {
    ensure_runtime_session_ready(state)
}
