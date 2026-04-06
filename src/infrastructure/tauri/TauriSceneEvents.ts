import { listen } from '@tauri-apps/api/event';
import type {
  RuntimeSceneMousePickerSnapshot,
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectComponentsTaskState,
  RuntimeSceneObjectHeaderTaskState,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';

export const SCENE_WORKSPACE_STATE_UPDATED_EVENT = 'scene-workspace-state-updated';
export const SCENE_CHILDREN_TASK_UPDATED_EVENT = 'scene-children-task-updated';
export const SCENE_OBJECT_HEADER_TASK_UPDATED_EVENT = 'scene-object-header-task-updated';
export const SCENE_OBJECT_COMPONENTS_TASK_UPDATED_EVENT = 'scene-object-components-task-updated';
export const SCENE_MOUSE_PICKER_STATE_UPDATED_EVENT = 'scene-mouse-picker-state-updated';

export function onSceneWorkspaceStateUpdated(handler: (state: SceneWorkspaceState) => void | Promise<void>) {
  return listen<SceneWorkspaceState>(SCENE_WORKSPACE_STATE_UPDATED_EVENT, (event) => handler(event.payload));
}

export function onSceneObjectChildrenTaskUpdated(handler: (state: RuntimeSceneObjectChildrenTaskState) => void | Promise<void>) {
  return listen<RuntimeSceneObjectChildrenTaskState>(SCENE_CHILDREN_TASK_UPDATED_EVENT, (event) => handler(event.payload));
}

export function onSceneObjectHeaderTaskUpdated(handler: (state: RuntimeSceneObjectHeaderTaskState) => void | Promise<void>) {
  return listen<RuntimeSceneObjectHeaderTaskState>(SCENE_OBJECT_HEADER_TASK_UPDATED_EVENT, (event) => handler(event.payload));
}

export function onSceneObjectComponentsTaskUpdated(handler: (state: RuntimeSceneObjectComponentsTaskState) => void | Promise<void>) {
  return listen<RuntimeSceneObjectComponentsTaskState>(SCENE_OBJECT_COMPONENTS_TASK_UPDATED_EVENT, (event) => handler(event.payload));
}

export function onSceneMousePickerStateUpdated(handler: (state: RuntimeSceneMousePickerSnapshot) => void | Promise<void>) {
  return listen<RuntimeSceneMousePickerSnapshot>(SCENE_MOUSE_PICKER_STATE_UPDATED_EVENT, (event) => handler(event.payload));
}