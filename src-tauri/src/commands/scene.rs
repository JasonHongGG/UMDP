use crate::application::scene as scene_application;
use crate::domain::analysis_models::{
    ProcessWindowCandidate, RuntimeSceneChildrenSnapshot, RuntimeSceneMousePickerSnapshot,
    RuntimeSceneMutationResult, RuntimeSceneObjectChildrenTaskState,
    RuntimeSceneObjectComponentsTaskState, RuntimeSceneObjectHeaderTaskState,
    RuntimeSceneTransformUpdate, SceneWorkspaceState,
};
use crate::domain::operation::{
    background_task_failure, command_result, command_success, AsyncCommandResult, CommandEnvelope,
};
use crate::infrastructure::logging::{self, DiagnosticsField};
use crate::state::AppState;
use std::fmt::Display;
use std::time::Instant;
use tauri::{AppHandle, Manager, State};

fn field(name: &'static str, value: impl ToString) -> DiagnosticsField {
    (name, value.to_string())
}

fn log_scene_command_result<T, E, F>(
    command: &'static str,
    started_at: Instant,
    result: &Result<T, E>,
    base_fields: Vec<DiagnosticsField>,
    on_success: F,
) where
    E: Display,
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
) -> AsyncCommandResult<SceneWorkspaceState> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.start-refresh")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.start-refresh", error),
    })
}

#[tauri::command]
pub fn get_scene_workspace_state(state: State<'_, AppState>) -> CommandEnvelope<SceneWorkspaceState> {
    command_success(scene_application::get_scene_workspace_state(&state))
}

#[tauri::command]
pub fn list_scene_picker_windows(
    state: State<'_, AppState>,
) -> CommandEnvelope<Vec<ProcessWindowCandidate>> {
    command_result(
        scene_application::list_scene_picker_windows(&state),
        "scene.list-picker-windows",
    )
}

#[tauri::command]
pub fn get_scene_mouse_picker_state(
    state: State<'_, AppState>,
) -> CommandEnvelope<RuntimeSceneMousePickerSnapshot> {
    command_success(scene_application::get_scene_mouse_picker_state(&state))
}

#[tauri::command]
pub fn set_scene_mouse_picker_target(
    app: AppHandle,
    state: State<'_, AppState>,
    window_handle: Option<String>,
) -> CommandEnvelope<RuntimeSceneMousePickerSnapshot> {
    let started_at = Instant::now();
    let result = scene_application::set_scene_mouse_picker_target(
        &app,
        &state,
        window_handle.as_deref(),
    );
    log_scene_command_result(
        "set_scene_mouse_picker_target",
        started_at,
        &result,
        vec![field(
            "windowHandle",
            window_handle.clone().unwrap_or_else(|| "null".to_string()),
        )],
        |snapshot| {
            vec![field(
                "status",
                format!("{:?}", snapshot.status),
            )]
        },
    );
    command_result(result, "scene.set-mouse-picker-target")
}

#[tauri::command]
pub fn start_scene_mouse_picker(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandEnvelope<RuntimeSceneMousePickerSnapshot> {
    let started_at = Instant::now();
    let result = scene_application::start_scene_mouse_picker(&app, &state);
    log_scene_command_result(
        "start_scene_mouse_picker",
        started_at,
        &result,
        Vec::new(),
        |snapshot| vec![field("status", format!("{:?}", snapshot.status))],
    );
    command_result(result, "scene.start-mouse-picker")
}

#[tauri::command]
pub fn stop_scene_mouse_picker(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandEnvelope<RuntimeSceneMousePickerSnapshot> {
    command_success(scene_application::stop_scene_mouse_picker(&app, &state))
}

#[tauri::command]
pub fn start_scene_object_children_analysis(
    app: AppHandle,
    state: State<'_, AppState>,
    object_address: String,
) -> CommandEnvelope<RuntimeSceneObjectChildrenTaskState> {
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
    command_result(result, "scene.start-children-analysis")
}

#[tauri::command]
pub fn get_scene_object_children_state(
    state: State<'_, AppState>,
    object_address: String,
) -> CommandEnvelope<Option<RuntimeSceneObjectChildrenTaskState>> {
    command_success(scene_application::get_scene_object_children_state(&state, &object_address))
}

#[tauri::command]
pub fn cancel_scene_object_children_analysis(
    state: State<'_, AppState>,
    object_address: String,
    task_id: Option<u64>,
) -> CommandEnvelope<Option<RuntimeSceneObjectChildrenTaskState>> {
    command_success(scene_application::cancel_scene_object_children_analysis(&state, &object_address, task_id))
}

#[tauri::command]
pub fn start_scene_object_header_analysis(
    app: AppHandle,
    state: State<'_, AppState>,
    object_address: String,
) -> CommandEnvelope<RuntimeSceneObjectHeaderTaskState> {
    let started_at = Instant::now();
    let result =
        scene_application::start_scene_object_header_analysis(&app, &state, &object_address);
    log_scene_command_result(
        "start_scene_object_header_analysis",
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
    command_result(result, "scene.start-object-header-analysis")
}

#[tauri::command]
pub fn get_scene_object_header_state(
    state: State<'_, AppState>,
    object_address: String,
) -> CommandEnvelope<Option<RuntimeSceneObjectHeaderTaskState>> {
    command_success(scene_application::get_scene_object_header_state(
        &state,
        &object_address,
    ))
}

#[tauri::command]
pub fn cancel_scene_object_header_analysis(
    state: State<'_, AppState>,
    object_address: String,
    task_id: Option<u64>,
) -> CommandEnvelope<Option<RuntimeSceneObjectHeaderTaskState>> {
    command_success(scene_application::cancel_scene_object_header_analysis(
        &state,
        &object_address,
        task_id,
    ))
}

#[tauri::command]
pub fn start_scene_object_components_analysis(
    app: AppHandle,
    state: State<'_, AppState>,
    object_address: String,
) -> CommandEnvelope<RuntimeSceneObjectComponentsTaskState> {
    let started_at = Instant::now();
    let result = scene_application::start_scene_object_components_analysis(
        &app,
        &state,
        &object_address,
    );
    log_scene_command_result(
        "start_scene_object_components_analysis",
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
    command_result(result, "scene.start-object-components-analysis")
}

#[tauri::command]
pub fn get_scene_object_components_state(
    state: State<'_, AppState>,
    object_address: String,
) -> CommandEnvelope<Option<RuntimeSceneObjectComponentsTaskState>> {
    command_success(scene_application::get_scene_object_components_state(
        &state,
        &object_address,
    ))
}

#[tauri::command]
pub fn cancel_scene_object_components_analysis(
    state: State<'_, AppState>,
    object_address: String,
    task_id: Option<u64>,
) -> CommandEnvelope<Option<RuntimeSceneObjectComponentsTaskState>> {
    command_success(scene_application::cancel_scene_object_components_analysis(
        &state,
        &object_address,
        task_id,
    ))
}

#[tauri::command]
pub async fn get_scene_object_children(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
) -> AsyncCommandResult<RuntimeSceneChildrenSnapshot> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.get-children")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.get-children", error),
    })
}

#[tauri::command]
pub async fn create_scene_child(
    app: AppHandle,
    _state: State<'_, AppState>,
    parent_object_address: String,
    name: String,
) -> AsyncCommandResult<RuntimeSceneMutationResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.create-child")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.create-child", error),
    })
}

#[tauri::command]
pub async fn create_scene_root(
    app: AppHandle,
    _state: State<'_, AppState>,
    scene_handle: i32,
    name: String,
) -> AsyncCommandResult<RuntimeSceneMutationResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.create-root")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.create-root", error),
    })
}

#[tauri::command]
pub async fn duplicate_scene_object(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
) -> AsyncCommandResult<RuntimeSceneMutationResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.duplicate")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.duplicate", error),
    })
}

#[tauri::command]
pub async fn delete_scene_object(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
) -> AsyncCommandResult<RuntimeSceneMutationResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.delete")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.delete", error),
    })
}

#[tauri::command]
pub async fn rename_scene_object(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    name: String,
) -> AsyncCommandResult<RuntimeSceneMutationResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.rename")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.rename", error),
    })
}

#[tauri::command]
pub async fn set_scene_object_tag(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    tag: String,
) -> AsyncCommandResult<RuntimeSceneMutationResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.set-tag")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.set-tag", error),
    })
}

#[tauri::command]
pub async fn set_scene_object_layer(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    layer: i32,
) -> AsyncCommandResult<RuntimeSceneMutationResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.set-layer")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.set-layer", error),
    })
}

#[tauri::command]
pub async fn set_scene_object_hide_flags(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    hide_flags: String,
) -> AsyncCommandResult<RuntimeSceneMutationResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.set-hide-flags")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.set-hide-flags", error),
    })
}

#[tauri::command]
pub async fn reparent_scene_object(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    parent_object_address: Option<String>,
    parent_path: Option<String>,
) -> AsyncCommandResult<RuntimeSceneMutationResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.reparent")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.reparent", error),
    })
}

#[tauri::command]
pub async fn set_scene_object_active(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    active_self: bool,
) -> AsyncCommandResult<RuntimeSceneMutationResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.set-active")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.set-active", error),
    })
}

#[tauri::command]
pub async fn set_scene_object_transform(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    transform_update: RuntimeSceneTransformUpdate,
) -> AsyncCommandResult<RuntimeSceneMutationResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.set-transform")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.set-transform", error),
    })
}

#[tauri::command]
pub async fn set_scene_behaviour_enabled(
    app: AppHandle,
    _state: State<'_, AppState>,
    component_address: String,
    enabled: bool,
) -> AsyncCommandResult<RuntimeSceneMutationResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.set-behaviour-enabled")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.set-behaviour-enabled", error),
    })
}

#[tauri::command]
pub async fn create_scene_component(
    app: AppHandle,
    _state: State<'_, AppState>,
    object_address: String,
    component_type_name: String,
) -> AsyncCommandResult<RuntimeSceneMutationResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.create-component")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.create-component", error),
    })
}

#[tauri::command]
pub async fn delete_scene_component(
    app: AppHandle,
    _state: State<'_, AppState>,
    component_address: String,
) -> AsyncCommandResult<RuntimeSceneMutationResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.delete-component")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.delete-component", error),
    })
}

#[tauri::command]
pub async fn load_scene_by_build_index(
    app: AppHandle,
    _state: State<'_, AppState>,
    build_index: i32,
) -> AsyncCommandResult<RuntimeSceneMutationResult> {
    let app_handle = app.clone();
    Ok(match tauri::async_runtime::spawn_blocking(move || {
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
        command_result(result, "scene.load-by-build-index")
    })
    .await
    {
        Ok(result) => result,
        Err(error) => background_task_failure("scene.load-by-build-index", error),
    })
}
