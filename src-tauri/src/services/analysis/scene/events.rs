use crate::domain::analysis_models::{
    RuntimeSceneObjectChildrenTaskState, RuntimeSceneObjectInspectorTaskState, SceneWorkspaceState,
};
use crate::infrastructure::logging;
use tauri::{AppHandle, Emitter};

const SCENE_WORKSPACE_STATE_UPDATED_EVENT: &str = "scene-workspace-state-updated";
const SCENE_CHILDREN_TASK_UPDATED_EVENT: &str = "scene-children-task-updated";
const SCENE_INSPECTOR_TASK_UPDATED_EVENT: &str = "scene-inspector-task-updated";

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

pub(crate) fn emit_scene_inspector_task_state(
    app: &AppHandle,
    task_state: &RuntimeSceneObjectInspectorTaskState,
) {
    if let Err(error) = app.emit(SCENE_INSPECTOR_TASK_UPDATED_EVENT, task_state.clone()) {
        logging::error(
            "scene",
            "scene_events",
            "Scene inspector task event emission failed.",
            vec![
                ("event", SCENE_INSPECTOR_TASK_UPDATED_EVENT.to_string()),
                ("error", error.to_string()),
            ],
        );
    }
}
