use crate::application::scene as scene_application;
use crate::domain::analysis_models::{
    RuntimeSceneChildrenSnapshot, RuntimeSceneMutationResult, RuntimeSceneObjectChildrenTaskState,
    RuntimeSceneObjectInspectorSnapshot, RuntimeSceneObjectInspectorTaskState,
    RuntimeSceneTransformUpdate, SceneWorkspaceState,
};
use crate::infrastructure::logging::{self, DiagnosticsField};
use crate::state::AppState;
use std::fmt::Display;
use std::time::Instant;
use tauri::{AppHandle, Manager, State};

fn join_error_message(error: impl Display) -> String {
    format!("Background task failed: {error}")
}

fn field(name: &'static str, value: impl ToString) -> DiagnosticsField {
    (name, value.to_string())
}

fn log_scene_command_result<T, F>(
    command: &'static str,
    started_at: Instant,
    result: &Result<T, String>,
    base_fields: Vec<DiagnosticsField>,
    on_success: F,
) where
    F: FnOnce(&T) -> Vec<DiagnosticsField>,
{
    logging::log_timed_result(
        "tauri",
        "scene_commands",
        command,
        started_at,
        result,
        base_fields,
        on_success,
    );
}

#[tauri::command]
pub async fn start_scene_refresh(
    app: AppHandle,
    _state: State<'_, AppState>,
) -> Result<SceneWorkspaceState, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_application::start_scene_refresh(&app_handle, &state);
        log_scene_command_result(
            "start_scene_refresh",
            started_at,
            &result,
            Vec::new(),
            |workspace| {
                vec![field(
                    "refreshStatus",
                    format!("{:?}", workspace.refresh_status),
                )]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub fn get_scene_workspace_state(state: State<'_, AppState>) -> SceneWorkspaceState {
    scene_application::get_scene_workspace_state(&state)
}

#[tauri::command]
pub fn start_scene_object_children_analysis(
    app: AppHandle,
    state: State<'_, AppState>,
    object_address: String,
) -> Result<RuntimeSceneObjectChildrenTaskState, String> {
    let started_at = Instant::now();
    let result =
        scene_application::start_scene_object_children_analysis(&app, &state, &object_address);
    log_scene_command_result(
        "start_scene_object_children_analysis",
        started_at,
        &result,
        vec![field("objectAddress", object_address.clone())],
        |task| {
            vec![
                field("taskId", task.task_id),
                field("status", format!("{:?}", task.status)),
            ]
        },
    );
    result
}

#[tauri::command]
pub fn get_scene_object_children_state(
    state: State<'_, AppState>,
    object_address: String,
) -> Option<RuntimeSceneObjectChildrenTaskState> {
    scene_application::get_scene_object_children_state(&state, &object_address)
}

#[tauri::command]
pub fn cancel_scene_object_children_analysis(
    state: State<'_, AppState>,
    object_address: String,
    task_id: Option<u64>,
) -> Option<RuntimeSceneObjectChildrenTaskState> {
    scene_application::cancel_scene_object_children_analysis(&state, &object_address, task_id)
}

#[tauri::command]
pub fn start_scene_object_inspector_analysis(
    app: AppHandle,
    state: State<'_, AppState>,
    object_address: String,
) -> Result<RuntimeSceneObjectInspectorTaskState, String> {
    let started_at = Instant::now();
    let result =
        scene_application::start_scene_object_inspector_analysis(&app, &state, &object_address);
    log_scene_command_result(
        "start_scene_object_inspector_analysis",
        started_at,
        &result,
        vec![field("objectAddress", object_address.clone())],
        |task| {
            vec![
                field("taskId", task.task_id),
                field("status", format!("{:?}", task.status)),
            ]
        },
    );
    result
}

#[tauri::command]
pub fn get_scene_object_inspector_state(
    state: State<'_, AppState>,
) -> Option<RuntimeSceneObjectInspectorTaskState> {
    scene_application::get_scene_object_inspector_state(&state)
}

#[tauri::command]
pub fn cancel_scene_object_inspector_analysis(
    state: State<'_, AppState>,
    task_id: Option<u64>,
) -> Option<RuntimeSceneObjectInspectorTaskState> {
    scene_application::cancel_scene_object_inspector_analysis(&state, task_id)
}

#[tauri::command]
pub async fn get_scene_object_children(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
) -> Result<RuntimeSceneChildrenSnapshot, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result =
            scene_application::get_scene_object_children(&app_handle, &state, &object_address);
        log_scene_command_result(
            "get_scene_object_children",
            started_at,
            &result,
            vec![field("objectAddress", object_address.clone())],
            |snapshot| vec![field("childCount", snapshot.children.len())],
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn get_scene_object_inspector(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
) -> Result<RuntimeSceneObjectInspectorSnapshot, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result =
            scene_application::get_scene_object_inspector(&app_handle, &state, &object_address);
        log_scene_command_result(
            "get_scene_object_inspector",
            started_at,
            &result,
            vec![field("objectAddress", object_address.clone())],
            |snapshot| {
                vec![
                    field("children", snapshot.children.len()),
                    field("components", snapshot.components.len()),
                ]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn create_scene_child(
    app: AppHandle,
    _state: State<'_, AppState>,
    parent_object_address: String,
    name: String,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_application::create_scene_child(
            &app_handle,
            &state,
            &parent_object_address,
            &name,
        );
        log_scene_command_result(
            "create_scene_child",
            started_at,
            &result,
            vec![field("parentObjectAddress", parent_object_address.clone())],
            |snapshot| {
                vec![field(
                    "targetObjectAddress",
                    snapshot.target_object_address.as_deref().unwrap_or("null"),
                )]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn create_scene_root(
    app: AppHandle,
    _state: State<'_, AppState>,
    scene_handle: i32,
    name: String,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_application::create_scene_root(&app_handle, &state, scene_handle, &name);
        log_scene_command_result(
            "create_scene_root",
            started_at,
            &result,
            vec![field("sceneHandle", scene_handle)],
            |snapshot| {
                vec![field(
                    "targetObjectAddress",
                    snapshot.target_object_address.as_deref().unwrap_or("null"),
                )]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn duplicate_scene_object(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result =
            scene_application::duplicate_scene_object(&app_handle, &state, &object_address);
        log_scene_command_result(
            "duplicate_scene_object",
            started_at,
            &result,
            vec![field("objectAddress", object_address.clone())],
            |snapshot| {
                vec![field(
                    "targetObjectAddress",
                    snapshot.target_object_address.as_deref().unwrap_or("null"),
                )]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn delete_scene_object(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_application::delete_scene_object(&app_handle, &state, &object_address);
        log_scene_command_result(
            "delete_scene_object",
            started_at,
            &result,
            vec![field("objectAddress", object_address.clone())],
            |snapshot| {
                vec![field(
                    "deletedObjectAddress",
                    snapshot.deleted_object_address.as_deref().unwrap_or("null"),
                )]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn rename_scene_object(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    name: String,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result =
            scene_application::rename_scene_object(&app_handle, &state, &object_address, &name);
        log_scene_command_result(
            "rename_scene_object",
            started_at,
            &result,
            vec![field("objectAddress", object_address.clone())],
            |snapshot| {
                vec![field(
                    "targetObjectAddress",
                    snapshot.target_object_address.as_deref().unwrap_or("null"),
                )]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn set_scene_object_tag(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    tag: String,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result =
            scene_application::set_scene_object_tag(&app_handle, &state, &object_address, &tag);
        log_scene_command_result(
            "set_scene_object_tag",
            started_at,
            &result,
            vec![field("objectAddress", object_address.clone())],
            |snapshot| {
                vec![field(
                    "targetObjectAddress",
                    snapshot.target_object_address.as_deref().unwrap_or("null"),
                )]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn set_scene_object_layer(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    layer: i32,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result =
            scene_application::set_scene_object_layer(&app_handle, &state, &object_address, layer);
        log_scene_command_result(
            "set_scene_object_layer",
            started_at,
            &result,
            vec![field("objectAddress", object_address.clone())],
            |snapshot| {
                vec![field(
                    "targetObjectAddress",
                    snapshot.target_object_address.as_deref().unwrap_or("null"),
                )]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn set_scene_object_hide_flags(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    hide_flags: String,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_application::set_scene_object_hide_flags(
            &app_handle,
            &state,
            &object_address,
            &hide_flags,
        );
        log_scene_command_result(
            "set_scene_object_hide_flags",
            started_at,
            &result,
            vec![field("objectAddress", object_address.clone())],
            |snapshot| {
                vec![field(
                    "targetObjectAddress",
                    snapshot.target_object_address.as_deref().unwrap_or("null"),
                )]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn reparent_scene_object(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    parent_object_address: Option<String>,
    parent_path: Option<String>,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_application::reparent_scene_object(
            &app_handle,
            &state,
            &object_address,
            parent_object_address.as_deref(),
            parent_path.as_deref(),
        );
        log_scene_command_result(
            "reparent_scene_object",
            started_at,
            &result,
            vec![
                field("objectAddress", object_address.clone()),
                field(
                    "parentObjectAddress",
                    parent_object_address.as_deref().unwrap_or("null"),
                ),
                field("parentPath", parent_path.as_deref().unwrap_or("null")),
            ],
            |snapshot| {
                vec![field(
                    "targetObjectAddress",
                    snapshot.target_object_address.as_deref().unwrap_or("null"),
                )]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn set_scene_object_active(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    active_self: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_application::set_scene_object_active(
            &app_handle,
            &state,
            &object_address,
            active_self,
        );
        log_scene_command_result(
            "set_scene_object_active",
            started_at,
            &result,
            vec![
                field("objectAddress", object_address.clone()),
                field("activeSelf", active_self),
            ],
            |snapshot| {
                vec![field(
                    "targetObjectAddress",
                    snapshot.target_object_address.as_deref().unwrap_or("null"),
                )]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn set_scene_object_transform(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    transform_update: RuntimeSceneTransformUpdate,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_application::set_scene_object_transform(
            &app_handle,
            &state,
            &object_address,
            &transform_update,
        );
        log_scene_command_result(
            "set_scene_object_transform",
            started_at,
            &result,
            vec![field("objectAddress", object_address.clone())],
            |snapshot| {
                vec![field(
                    "targetObjectAddress",
                    snapshot.target_object_address.as_deref().unwrap_or("null"),
                )]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn set_scene_behaviour_enabled(
    app: AppHandle,
    _state: State<'_, AppState>,
    component_address: String,
    enabled: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_application::set_scene_behaviour_enabled(
            &app_handle,
            &state,
            &component_address,
            enabled,
        );
        log_scene_command_result(
            "set_scene_behaviour_enabled",
            started_at,
            &result,
            vec![
                field("componentAddress", component_address.clone()),
                field("enabled", enabled),
            ],
            |snapshot| {
                vec![field(
                    "targetObjectAddress",
                    snapshot.target_object_address.as_deref().unwrap_or("null"),
                )]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn create_scene_component(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    component_type_name: String,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_application::create_scene_component(
            &app_handle,
            &state,
            &object_address,
            &component_type_name,
        );
        log_scene_command_result(
            "create_scene_component",
            started_at,
            &result,
            vec![
                field("objectAddress", object_address.clone()),
                field("componentTypeName", component_type_name.clone()),
            ],
            |snapshot| {
                vec![field(
                    "targetObjectAddress",
                    snapshot.target_object_address.as_deref().unwrap_or("null"),
                )]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn delete_scene_component(
    app: AppHandle,
    _state: State<'_, AppState>,
    component_address: String,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result =
            scene_application::delete_scene_component(&app_handle, &state, &component_address);
        log_scene_command_result(
            "delete_scene_component",
            started_at,
            &result,
            vec![field("componentAddress", component_address.clone())],
            |snapshot| {
                vec![field(
                    "targetObjectAddress",
                    snapshot.target_object_address.as_deref().unwrap_or("null"),
                )]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}

#[tauri::command]
pub async fn load_scene_by_build_index(
    app: AppHandle,
    _state: State<'_, AppState>,
    build_index: i32,
) -> Result<RuntimeSceneMutationResult, String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let started_at = Instant::now();
        let state = app_handle.state::<AppState>();
        let result = scene_application::load_scene_by_build_index(&app_handle, &state, build_index);
        log_scene_command_result(
            "load_scene_by_build_index",
            started_at,
            &result,
            vec![field("buildIndex", build_index)],
            |snapshot| {
                vec![field(
                    "targetObjectAddress",
                    snapshot.target_object_address.as_deref().unwrap_or("null"),
                )]
            },
        );
        result
    })
    .await
    .map_err(join_error_message)?
}
