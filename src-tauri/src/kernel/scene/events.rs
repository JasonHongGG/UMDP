use crate::domain::analysis_models::{
    RuntimeSceneMousePickerSnapshot, RuntimeSceneObjectChildrenTaskState,
    RuntimeSceneObjectComponentsTaskState, RuntimeSceneObjectHeaderTaskState,
    SceneWorkspaceState,
};
use crate::infrastructure::logging;
use tauri::{AppHandle, Emitter};

const SCENE_WORKSPACE_STATE_UPDATED_EVENT: &str = "scene-workspace-state-updated";
const SCENE_CHILDREN_TASK_UPDATED_EVENT: &str = "scene-children-task-updated";
const SCENE_OBJECT_HEADER_TASK_UPDATED_EVENT: &str = "scene-object-header-task-updated";
const SCENE_OBJECT_COMPONENTS_TASK_UPDATED_EVENT: &str = "scene-object-components-task-updated";
const SCENE_MOUSE_PICKER_STATE_UPDATED_EVENT: &str = "scene-mouse-picker-state-updated";

pub(crate) fn emit_scene_workspace_state(app: &AppHandle, workspace: &SceneWorkspaceState) {
    if let Err(error) = app.emit(SCENE_WORKSPACE_STATE_UPDATED_EVENT, workspace.clone()) {
        logging::error(
            "scene",
            "scene_events",
            "Scene workspace state event emission failed.",
            vec![
                ("event", SCENE_WORKSPACE_STATE_UPDATED_EVENT.to_string()),
                ("error", error.to_string()),
            ],
        );
    }
}

pub(crate) fn emit_scene_children_task_state(
    app: &AppHandle,
    task_state: &RuntimeSceneObjectChildrenTaskState,
) {
    if let Err(error) = app.emit(SCENE_CHILDREN_TASK_UPDATED_EVENT, task_state.clone()) {
        logging::error(
            "scene",
            "scene_events",
            "Scene children task event emission failed.",
            vec![
                ("event", SCENE_CHILDREN_TASK_UPDATED_EVENT.to_string()),
                ("error", error.to_string()),
            ],
        );
    }
}

pub(crate) fn emit_scene_object_header_task_state(
    app: &AppHandle,
    task_state: &RuntimeSceneObjectHeaderTaskState,
) {
    if let Err(error) = app.emit(SCENE_OBJECT_HEADER_TASK_UPDATED_EVENT, task_state.clone()) {
        logging::error(
            "scene",
            "scene_events",
            "Scene object header task event emission failed.",
            vec![
                ("event", SCENE_OBJECT_HEADER_TASK_UPDATED_EVENT.to_string()),
                ("error", error.to_string()),
            ],
        );
    }
}

pub(crate) fn emit_scene_object_components_task_state(
    app: &AppHandle,
    task_state: &RuntimeSceneObjectComponentsTaskState,
) {
    if let Err(error) = app.emit(SCENE_OBJECT_COMPONENTS_TASK_UPDATED_EVENT, task_state.clone()) {
        logging::error(
            "scene",
            "scene_events",
            "Scene object components task event emission failed.",
            vec![
                ("event", SCENE_OBJECT_COMPONENTS_TASK_UPDATED_EVENT.to_string()),
                ("error", error.to_string()),
            ],
        );
    }
}

pub(crate) fn emit_scene_mouse_picker_state(
    app: &AppHandle,
    snapshot: &RuntimeSceneMousePickerSnapshot,
) {
    if let Err(error) = app.emit(SCENE_MOUSE_PICKER_STATE_UPDATED_EVENT, snapshot.clone()) {
        logging::error(
            "scene",
            "scene_events",
            "Scene mouse picker event emission failed.",
            vec![
                ("event", SCENE_MOUSE_PICKER_STATE_UPDATED_EVENT.to_string()),
                ("error", error.to_string()),
            ],
        );
    }
}