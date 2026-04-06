use super::common::current_scene_session_key;
use super::events::emit_scene_mouse_picker_state;
use crate::domain::analysis_models::{
    ProcessWindowCandidate, RuntimeSceneMousePickerSnapshot, RuntimeSceneMouseTargetHit,
    RuntimeScreenPoint, RuntimeScreenRect,
};
use crate::domain::operation::{OperationError, OperationResult};
use crate::infrastructure::native::windowing;
use crate::kernel::runtime::access::ensure_runtime_session_ready;
use crate::kernel::scene::query as native_scene;
use crate::kernel::workspace::access::ensure_attached_session;
use crate::state::AppState;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const SCENE_MOUSE_PICKER_POLL_INTERVAL_MS: u64 = 100;

pub fn list_scene_picker_windows(state: &AppState) -> OperationResult<Vec<ProcessWindowCandidate>> {
    let attached = ensure_attached_session(state)?;
    windowing::enumerate_process_windows(attached.pid).map_err(OperationError::from)
}

pub fn get_scene_mouse_picker_state(state: &AppState) -> RuntimeSceneMousePickerSnapshot {
    let session_key = current_scene_session_key(state);
    state.scene().picker().current_for(session_key.as_deref())
}

pub fn set_scene_mouse_picker_target(
    app: &AppHandle,
    state: &AppState,
    window_handle: Option<&str>,
) -> OperationResult<RuntimeSceneMousePickerSnapshot> {
    let attached = ensure_attached_session(state)?;
    let session_key = current_scene_session_key(state);

    let target_window = match window_handle {
        Some(window_handle) => {
            let parsed_handle = parse_window_handle(window_handle)?;
            let window = windowing::inspect_process_window(attached.pid, parsed_handle)
                .map_err(OperationError::from)?
                .ok_or_else(|| {
                    OperationError::capability_unavailable(
                        "Selected game window is no longer available.",
                    )
                })?;
            Some(window)
        }
        None => None,
    };

    let snapshot = state
        .scene()
        .picker()
        .set_target_window(session_key, target_window);
    emit_scene_mouse_picker_state(app, &snapshot);
    Ok(snapshot)
}

pub fn start_scene_mouse_picker(
    app: &AppHandle,
    state: &AppState,
) -> OperationResult<RuntimeSceneMousePickerSnapshot> {
    ensure_attached_session(state)?;
    ensure_runtime_session_ready(state)?;
    let session_key = current_scene_session_key(state);
    let start = state
        .scene()
        .picker()
        .start(session_key.clone())
        .map_err(OperationError::capability_unavailable)?;

    emit_scene_mouse_picker_state(app, &start.snapshot);

    if let (Some(worker_id), Some(cancel_flag)) = (start.worker_id, start.cancel_flag) {
        let app_handle = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let state = app_handle.state::<AppState>();
            run_scene_mouse_picker_worker(
                &app_handle,
                &state,
                worker_id,
                session_key,
                cancel_flag,
            );
        });
    }

    Ok(start.snapshot)
}

pub fn stop_scene_mouse_picker(
    app: &AppHandle,
    state: &AppState,
) -> RuntimeSceneMousePickerSnapshot {
    let session_key = current_scene_session_key(state);
    let snapshot = state.scene().picker().stop(session_key.as_deref());
    emit_scene_mouse_picker_state(app, &snapshot);
    snapshot
}

fn run_scene_mouse_picker_worker(
    app: &AppHandle,
    state: &AppState,
    worker_id: u64,
    session_key: Option<String>,
    cancel_flag: Arc<AtomicBool>,
) {
    let mut was_escape_down = false;

    while !cancel_flag.load(Ordering::Relaxed) {
        let Some(target_window) = state
            .scene()
            .picker()
            .current_target_window(worker_id, session_key.as_deref())
        else {
            break;
        };

        let refreshed_window = match refresh_target_window(&target_window) {
            Ok(window) => window,
            Err(error) => {
                emit_picker_failure(app, state, worker_id, session_key.as_deref(), error);
                return;
            }
        };

        let cursor_screen_position = match windowing::get_cursor_screen_position() {
            Ok(point) => point,
            Err(error) => {
                emit_picker_failure(app, state, worker_id, session_key.as_deref(), error);
                return;
            }
        };
        let escape_key_state = windowing::get_escape_key_state();
        let just_pressed_escape = escape_key_state.pressed_since_last_poll
            || (escape_key_state.is_down && !was_escape_down);
        was_escape_down = escape_key_state.is_down;

        if just_pressed_escape {
            if let Some(snapshot) = state.scene().picker().cancel(
                worker_id,
                session_key.as_deref(),
                "Picker cancelled.".to_string(),
            ) {
                emit_scene_mouse_picker_state(app, &snapshot);
            }
            break;
        }

        if refreshed_window.is_minimized {
            emit_picker_observation(
                app,
                state,
                worker_id,
                session_key.as_deref(),
                refreshed_window,
                cursor_screen_position,
                None,
                None,
                "Restore the target window to continue picking.".to_string(),
            );
            thread::sleep(Duration::from_millis(SCENE_MOUSE_PICKER_POLL_INTERVAL_MS));
            continue;
        }

        let cursor_client_position = screen_to_client_position(
            &cursor_screen_position,
            &refreshed_window.client_rect,
        );
        let hover_hit = match &cursor_client_position {
            Some(cursor_client_position) => {
                match pick_scene_mouse_hit(
                    state,
                    cursor_client_position.clone(),
                    cursor_screen_position.clone(),
                    refreshed_window.client_rect.height,
                ) {
                    Ok(hit) => hit,
                    Err(error) => {
                        emit_picker_failure(app, state, worker_id, session_key.as_deref(), error);
                        return;
                    }
                }
            }
            None => None,
        };

        let observation_detail = match (&cursor_client_position, &hover_hit) {
            (Some(_), Some(hit)) => format!(
                "Observing {}. Recent refreshes automatically. Press Escape to stop.",
                hit.object_name
            ),
            (Some(_), None) => {
                "No collider-backed world object is under the cursor. Press Escape to stop.".to_string()
            }
            (None, _) => "Move the cursor inside the target window. Press Escape to stop.".to_string(),
        };
        emit_picker_observation(
            app,
            state,
            worker_id,
            session_key.as_deref(),
            refreshed_window,
            cursor_screen_position,
            cursor_client_position,
            hover_hit.clone(),
            observation_detail,
        );

        thread::sleep(Duration::from_millis(SCENE_MOUSE_PICKER_POLL_INTERVAL_MS));
    }

    if let Some(snapshot) = state
        .scene()
        .picker()
        .finish_worker(worker_id, session_key.as_deref())
    {
        emit_scene_mouse_picker_state(app, &snapshot);
    }
}

fn emit_picker_observation(
    app: &AppHandle,
    state: &AppState,
    worker_id: u64,
    session_key: Option<&str>,
    target_window: ProcessWindowCandidate,
    cursor_screen_position: RuntimeScreenPoint,
    cursor_client_position: Option<RuntimeScreenPoint>,
    hover_hit: Option<RuntimeSceneMouseTargetHit>,
    detail: String,
) {
    if let Some(snapshot) = state.scene().picker().apply_observation(
        worker_id,
        session_key,
        target_window,
        cursor_screen_position,
        cursor_client_position,
        hover_hit,
        detail,
    ) {
        emit_scene_mouse_picker_state(app, &snapshot);
    }
}

fn emit_picker_failure(
    app: &AppHandle,
    state: &AppState,
    worker_id: u64,
    session_key: Option<&str>,
    error_message: String,
) {
    if let Some(snapshot) = state
        .scene()
        .picker()
        .fail(worker_id, session_key, error_message)
    {
        emit_scene_mouse_picker_state(app, &snapshot);
    }
}

fn refresh_target_window(target_window: &ProcessWindowCandidate) -> Result<ProcessWindowCandidate, String> {
    let window_handle = parse_window_handle(&target_window.window_handle)?;
    windowing::inspect_process_window(target_window.pid, window_handle)?.ok_or_else(|| {
        "Selected game window is no longer available.".to_string()
    })
}

fn pick_scene_mouse_hit(
    state: &AppState,
    client_position: RuntimeScreenPoint,
    screen_position: RuntimeScreenPoint,
    client_height: i32,
) -> Result<Option<RuntimeSceneMouseTargetHit>, String> {
    let runtime_session = ensure_runtime_session_ready(state).map_err(|error| error.to_string())?;
    native_scene::pick_scene_object_at(
        runtime_session.as_ref(),
        client_position,
        screen_position,
        client_height,
    )
}

fn screen_to_client_position(
    screen_point: &RuntimeScreenPoint,
    client_rect: &RuntimeScreenRect,
) -> Option<RuntimeScreenPoint> {
    if screen_point.x < client_rect.left
        || screen_point.x >= client_rect.right
        || screen_point.y < client_rect.top
        || screen_point.y >= client_rect.bottom
    {
        return None;
    }

    Some(RuntimeScreenPoint {
        x: screen_point.x - client_rect.left,
        y: screen_point.y - client_rect.top,
    })
}

fn parse_window_handle(value: &str) -> Result<usize, OperationError> {
    let trimmed = value.trim();
    let normalized = trimmed.strip_prefix("0x").unwrap_or(trimmed);
    usize::from_str_radix(normalized, if trimmed.starts_with("0x") { 16 } else { 10 })
        .map_err(|error| {
            OperationError::invalid_address(format!("Invalid window handle '{value}': {error}"))
        })
}