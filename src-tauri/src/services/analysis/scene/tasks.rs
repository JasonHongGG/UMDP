use super::events::{
    emit_scene_children_task_state, emit_scene_inspector_task_state,
};
use super::query::{
    load_scene_children_page, load_scene_inspector_children_page,
    load_scene_inspector_components_page, load_scene_inspector_header,
};
use super::{current_scene_session_key, log_scene_duration};
use crate::domain::analysis_models::{
    RuntimeSceneObjectChildrenTaskState,
    RuntimeSceneObjectInspectorTaskState,
};
use crate::services::analysis::runtime_session_service::{
    ensure_attached_session, ensure_scene_bridge_session_started,
    execute_runtime_operation,
};
use crate::state::AppState;
use std::time::Instant;
use tauri::{AppHandle, Manager};

const TREE_CHILDREN_PAGE_SIZE: usize = 24;
const INSPECTOR_CHILDREN_PAGE_SIZE: usize = 64;
const INSPECTOR_COMPONENTS_PAGE_SIZE: usize = 64;

pub fn start_scene_object_children_analysis(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneObjectChildrenTaskState, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;
    let session_key = current_scene_session_key(state);

    let task_start = state
        .scene_module
        .children
        .start_task(object_address.to_string(), session_key.clone());
    emit_scene_children_task_state(app, &task_start.state);
    if task_start.should_spawn {
        let app_handle = app.clone();
        let object_address = object_address.to_string();
        let task_id = task_start.state.task_id;
        let mutation_epoch = task_start.state.mutation_epoch;
        let session_key = session_key.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let state = app_handle.state::<AppState>();
            run_scene_object_children_task(
                &app_handle,
                &state,
                &object_address,
                task_id,
                mutation_epoch,
                session_key.as_deref(),
            );
        });
    }

    log_scene_duration(
        "start_scene_object_children_analysis",
        started_at,
        &format!(
            "object_address={object_address} task_id={} spawn={}",
            task_start.state.task_id,
            task_start.should_spawn
        ),
    );
    Ok(task_start.state)
}

pub fn get_scene_object_children_state(
    state: &AppState,
    object_address: &str,
) -> Option<RuntimeSceneObjectChildrenTaskState> {
    let session_key = current_scene_session_key(state);
    state
        .scene_module
        .children
        .current(object_address, session_key.as_deref())
}

pub fn cancel_scene_object_children_analysis(
    state: &AppState,
    object_address: &str,
    task_id: Option<u64>,
) -> Option<RuntimeSceneObjectChildrenTaskState> {
    let session_key = current_scene_session_key(state);
    state
        .scene_module
        .children
        .cancel(object_address, task_id, session_key.as_deref())
}

pub fn start_scene_object_inspector_analysis(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> Result<RuntimeSceneObjectInspectorTaskState, String> {
    let started_at = Instant::now();
    ensure_attached_session(state)?;
    ensure_scene_bridge_session_started(app, state)?;
    let session_key = current_scene_session_key(state);

    let task_start = state
        .scene_module
        .inspector
        .start_task(object_address.to_string(), session_key.clone());
    emit_scene_inspector_task_state(app, &task_start.state);
    if !task_start.use_cached {
        let app_handle = app.clone();
        let object_address = object_address.to_string();
        let task_id = task_start.state.task_id;
        let mutation_epoch = task_start.state.mutation_epoch;
        let session_key = session_key.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let state = app_handle.state::<AppState>();
            run_scene_object_inspector_task(
                &app_handle,
                &state,
                &object_address,
                task_id,
                mutation_epoch,
                session_key.as_deref(),
            );
        });
    }

    log_scene_duration(
        "start_scene_object_inspector_analysis",
        started_at,
        &format!(
            "object_address={object_address} task_id={} cached={}",
            task_start.state.task_id,
            task_start.use_cached
        ),
    );
    Ok(task_start.state)
}

pub fn get_scene_object_inspector_state(
    state: &AppState,
) -> Option<RuntimeSceneObjectInspectorTaskState> {
    let session_key = current_scene_session_key(state);
    state.scene_module.inspector.current(session_key.as_deref())
}

pub fn cancel_scene_object_inspector_analysis(
    state: &AppState,
    task_id: Option<u64>,
) -> Option<RuntimeSceneObjectInspectorTaskState> {
    let session_key = current_scene_session_key(state);
    state
        .scene_module
        .inspector
        .cancel(task_id, session_key.as_deref())
}

fn run_scene_object_children_task(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    task_id: u64,
    mutation_epoch: u64,
    session_key: Option<&str>,
) {
    let mut child_offset = 0usize;
    loop {
        let page = match execute_runtime_operation(state, || {
            load_scene_children_page(
                app,
                state,
                object_address,
                child_offset,
                TREE_CHILDREN_PAGE_SIZE,
            )
        }) {
            Ok(snapshot) => snapshot,
            Err(error) => {
                if let Some(task_state) = state.scene_module.children.fail(
                    object_address,
                    task_id,
                    mutation_epoch,
                    session_key,
                    error,
                ) {
                    emit_scene_children_task_state(app, &task_state);
                }
                return;
            }
        };

        let next_offset = page.next_offset;
        let Some(task_state) = state.scene_module.children.apply_children(
            object_address,
            task_id,
            mutation_epoch,
            session_key,
            page.children,
            page.total_count,
            next_offset,
        ) else {
            return;
        };
        emit_scene_children_task_state(app, &task_state);

        match next_offset {
            Some(next) => child_offset = next,
            None => break,
        }
    }

    if let Some(task_state) = state
        .scene_module
        .children
        .complete(object_address, task_id, mutation_epoch, session_key)
    {
        emit_scene_children_task_state(app, &task_state);
    }
}

fn run_scene_object_inspector_task(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    task_id: u64,
    mutation_epoch: u64,
    session_key: Option<&str>,
) {
    let header = match execute_runtime_operation(state, || {
        load_scene_inspector_header(app, state, object_address)
    }) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            if let Some(task_state) = state
                .scene_module
                .inspector
                .fail(task_id, mutation_epoch, session_key, error)
            {
                emit_scene_inspector_task_state(app, &task_state);
            }
            return;
        }
    };
    let Some(task_state) = state
        .scene_module
        .inspector
        .apply_header(task_id, mutation_epoch, session_key, header)
    else {
        return;
    };
    emit_scene_inspector_task_state(app, &task_state);

    let mut child_offset = 0usize;
    loop {
        let page = match execute_runtime_operation(state, || {
            load_scene_inspector_children_page(
                app,
                state,
                object_address,
                child_offset,
                INSPECTOR_CHILDREN_PAGE_SIZE,
            )
        }) {
            Ok(snapshot) => snapshot,
            Err(error) => {
                if let Some(task_state) = state
                    .scene_module
                    .inspector
                    .fail(task_id, mutation_epoch, session_key, error)
                {
                    emit_scene_inspector_task_state(app, &task_state);
                }
                return;
            }
        };

        let next_offset = page.next_offset;
        let Some(task_state) = state.scene_module.inspector.apply_children(
            task_id,
            mutation_epoch,
            session_key,
            page.children,
            page.total_count,
            next_offset,
        ) else {
            return;
        };
        emit_scene_inspector_task_state(app, &task_state);

        match next_offset {
            Some(next) => child_offset = next,
            None => break,
        }
    }

    let mut component_offset = 0usize;
    loop {
        let page = match execute_runtime_operation(state, || {
            load_scene_inspector_components_page(
                app,
                state,
                object_address,
                component_offset,
                INSPECTOR_COMPONENTS_PAGE_SIZE,
            )
        }) {
            Ok(snapshot) => snapshot,
            Err(error) => {
                if let Some(task_state) = state
                    .scene_module
                    .inspector
                    .fail(task_id, mutation_epoch, session_key, error)
                {
                    emit_scene_inspector_task_state(app, &task_state);
                }
                return;
            }
        };

        let next_offset = page.next_offset;
        let Some(task_state) = state.scene_module.inspector.apply_components(
            task_id,
            mutation_epoch,
            session_key,
            page.components,
            page.total_count,
            next_offset,
        ) else {
            return;
        };
        emit_scene_inspector_task_state(app, &task_state);

        match next_offset {
            Some(next) => component_offset = next,
            None => break,
        }
    }

    if let Some(task_state) = state
        .scene_module
        .inspector
        .complete(task_id, mutation_epoch, session_key)
    {
        emit_scene_inspector_task_state(app, &task_state);
    }
}