use super::common::{current_scene_session_key, log_scene_duration};
use super::events::{
    emit_scene_children_task_state, emit_scene_object_components_task_state,
    emit_scene_object_header_task_state,
};
use super::refresh::{
    ensure_scene_query_runtime_ready, load_scene_children_page,
    load_scene_inspector_components_page, load_scene_inspector_header,
};
use crate::domain::analysis_models::{
    RuntimeSceneObjectChildrenTaskState, RuntimeSceneObjectComponentsTaskState,
    RuntimeSceneObjectHeaderTaskState,
};
use crate::domain::operation::{OperationError, OperationResult};
use crate::domain::workspace::RuntimeSceneObjectComponentsCapabilityStatus;
use crate::kernel::runtime::access::execute_runtime_operation;
use crate::kernel::runtime::access::ensure_runtime_session_ready;
use crate::kernel::workspace::access::ensure_attached_session;
use crate::state::AppState;
use std::time::Instant;
use tauri::{AppHandle, Manager};

const TREE_CHILDREN_PAGE_SIZE: usize = 24;
const OBJECT_COMPONENTS_PAGE_SIZE: usize = 64;

pub fn start_scene_object_children_analysis(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> OperationResult<RuntimeSceneObjectChildrenTaskState> {
    let started_at = Instant::now();
    ensure_attached_session(state).map(|_| ())?;
    ensure_scene_query_runtime_ready(state)?;
    let session_key = current_scene_session_key(state);

    let task_start = state
        .scene()
        .children()
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
            task_start.state.task_id, task_start.should_spawn
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
        .scene()
        .children()
        .current(object_address, session_key.as_deref())
}

pub fn cancel_scene_object_children_analysis(
    state: &AppState,
    object_address: &str,
    task_id: Option<u64>,
) -> Option<RuntimeSceneObjectChildrenTaskState> {
    let session_key = current_scene_session_key(state);
    state
        .scene()
        .children()
        .cancel(object_address, task_id, session_key.as_deref())
}

pub fn start_scene_object_header_analysis(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> OperationResult<RuntimeSceneObjectHeaderTaskState> {
    let started_at = Instant::now();
    ensure_attached_session(state).map(|_| ())?;
    ensure_scene_query_runtime_ready(state)?;
    let session_key = current_scene_session_key(state);

    let task_start = state
        .scene()
        .header()
        .start_task(object_address.to_string(), session_key.clone());
    emit_scene_object_header_task_state(app, &task_start.state);
    if !task_start.use_cached {
        let app_handle = app.clone();
        let object_address = object_address.to_string();
        let task_id = task_start.state.task_id;
        let mutation_epoch = task_start.state.mutation_epoch;
        let session_key = session_key.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let state = app_handle.state::<AppState>();
            run_scene_object_header_task(
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
        "start_scene_object_header_analysis",
        started_at,
        &format!(
            "object_address={object_address} task_id={} cached={}",
            task_start.state.task_id, task_start.use_cached
        ),
    );
    Ok(task_start.state)
}

pub fn get_scene_object_header_state(
    state: &AppState,
    object_address: &str,
) -> Option<RuntimeSceneObjectHeaderTaskState> {
    let session_key = current_scene_session_key(state);
    state.scene().header().current(object_address, session_key.as_deref())
}

pub fn cancel_scene_object_header_analysis(
    state: &AppState,
    object_address: &str,
    task_id: Option<u64>,
) -> Option<RuntimeSceneObjectHeaderTaskState> {
    let session_key = current_scene_session_key(state);
    state
        .scene()
        .header()
        .cancel(object_address, task_id, session_key.as_deref())
}

pub fn start_scene_object_components_analysis(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
) -> OperationResult<RuntimeSceneObjectComponentsTaskState> {
    let started_at = Instant::now();
    ensure_attached_session(state).map(|_| ())?;
    let runtime_session = ensure_runtime_session_ready(state)?;
    if runtime_session.scene_object_components().status
        != RuntimeSceneObjectComponentsCapabilityStatus::Supported
    {
        return Err(OperationError::scene_component_capability_unavailable(
            runtime_session
                .scene_object_components()
                .reason
                .clone()
                .unwrap_or_else(|| {
                    "Scene object component materialization is unavailable for this runtime session."
                        .to_string()
                }),
        ));
    }
    let session_key = current_scene_session_key(state);

    let task_start = state
        .scene()
        .components()
        .start_task(object_address.to_string(), session_key.clone());
    emit_scene_object_components_task_state(app, &task_start.state);
    if task_start.should_spawn {
        let app_handle = app.clone();
        let object_address = object_address.to_string();
        let task_id = task_start.state.task_id;
        let mutation_epoch = task_start.state.mutation_epoch;
        let session_key = session_key.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let state = app_handle.state::<AppState>();
            run_scene_object_components_task(
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
        "start_scene_object_components_analysis",
        started_at,
        &format!(
            "object_address={object_address} task_id={} spawn={}",
            task_start.state.task_id, task_start.should_spawn
        ),
    );
    Ok(task_start.state)
}

pub fn get_scene_object_components_state(
    state: &AppState,
    object_address: &str,
) -> Option<RuntimeSceneObjectComponentsTaskState> {
    let session_key = current_scene_session_key(state);
    state
        .scene()
        .components()
        .current(object_address, session_key.as_deref())
}

pub fn cancel_scene_object_components_analysis(
    state: &AppState,
    object_address: &str,
    task_id: Option<u64>,
) -> Option<RuntimeSceneObjectComponentsTaskState> {
    let session_key = current_scene_session_key(state);
    state
        .scene()
        .components()
        .cancel(object_address, task_id, session_key.as_deref())
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
            load_scene_children_page(state, object_address, child_offset, TREE_CHILDREN_PAGE_SIZE)
        }) {
            Ok(snapshot) => snapshot,
            Err(error) => {
                if let Some(task_state) = state.scene().children().fail(
                    object_address,
                    task_id,
                    mutation_epoch,
                    session_key,
                    error.to_string(),
                ) {
                    emit_scene_children_task_state(app, &task_state);
                }
                return;
            }
        };

        let next_offset = page.next_offset;
        let page_offset = page.offset;
        let Some(task_state) = state.scene().children().apply_children(
            object_address,
            task_id,
            mutation_epoch,
            session_key,
            page_offset,
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

    if let Some(task_state) =
        state
            .scene()
            .children()
            .complete(object_address, task_id, mutation_epoch, session_key)
    {
        emit_scene_children_task_state(app, &task_state);
    }
}

fn run_scene_object_header_task(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    task_id: u64,
    mutation_epoch: u64,
    session_key: Option<&str>,
) {
    let header = match execute_runtime_operation(state, || {
        load_scene_inspector_header(state, object_address)
    }) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            if let Some(task_state) = state.scene().header().fail(
                object_address,
                task_id,
                mutation_epoch,
                session_key,
                error.to_string(),
            ) {
                emit_scene_object_header_task_state(app, &task_state);
            }
            return;
        }
    };
    let Some(task_state) = state
        .scene()
        .header()
        .apply_header(object_address, task_id, mutation_epoch, session_key, header)
    else {
        return;
    };
    emit_scene_object_header_task_state(app, &task_state);
}

fn run_scene_object_components_task(
    app: &AppHandle,
    state: &AppState,
    object_address: &str,
    task_id: u64,
    mutation_epoch: u64,
    session_key: Option<&str>,
) {
    let mut component_offset = 0usize;
    loop {
        let page = match execute_runtime_operation(state, || {
            load_scene_inspector_components_page(
                state,
                object_address,
                component_offset,
                OBJECT_COMPONENTS_PAGE_SIZE,
            )
        }) {
            Ok(snapshot) => snapshot,
            Err(error) => {
                if let Some(task_state) = state.scene().components().fail(
                    object_address,
                    task_id,
                    mutation_epoch,
                    session_key,
                    error.to_string(),
                ) {
                    emit_scene_object_components_task_state(app, &task_state);
                }
                return;
            }
        };

        let next_offset = page.next_offset;
        let page_offset = page.offset;
        let Some(task_state) = state.scene().components().apply_components(
            object_address,
            task_id,
            mutation_epoch,
            session_key,
            page_offset,
            page.components,
            page.total_count,
            next_offset,
        ) else {
            return;
        };
        emit_scene_object_components_task_state(app, &task_state);

        match next_offset {
            Some(next) => component_offset = next,
            None => break,
        }
    }

    if let Some(task_state) = state
        .scene()
        .components()
        .current(object_address, session_key)
    {
        if task_state.total_count > 0 && task_state.loaded_count == 0 {
            if let Some(failed_state) = state.scene().components().fail(
                object_address,
                task_id,
                mutation_epoch,
                session_key,
                format!(
                    "Scene object reported {} components but none were materialized.",
                    task_state.total_count
                ),
            ) {
                emit_scene_object_components_task_state(app, &failed_state);
            }
            return;
        }

        if task_state.loaded_count < task_state.total_count {
            if let Some(failed_state) = state.scene().components().fail(
                object_address,
                task_id,
                mutation_epoch,
                session_key,
                format!(
                    "Scene object component load was incomplete: loaded {} of {} components.",
                    task_state.loaded_count,
                    task_state.total_count
                ),
            ) {
                emit_scene_object_components_task_state(app, &failed_state);
            }
            return;
        }
    }

    if let Some(task_state) = state
        .scene()
        .components()
        .complete(object_address, task_id, mutation_epoch, session_key)
    {
        emit_scene_object_components_task_state(app, &task_state);
    }
}