import type { SceneGateway, ReparentSceneObjectRequest } from '@/domain/scene/gateway';
import type {
  ProcessWindowCandidate,
  RuntimeSceneChildrenSnapshot,
  RuntimeSceneMousePickerSnapshot,
  RuntimeSceneMutationResult,
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectInspectorSnapshot,
  RuntimeSceneObjectInspectorTaskState,
  RuntimeSceneTransformUpdate,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import { createTauriIpcClient } from './TauriIpcClient';

export function createTauriSceneGateway(): SceneGateway {
  const client = createTauriIpcClient();

  return {
    startSceneRefresh() {
      return client.invoke<SceneWorkspaceState>({ label: 'start_scene_refresh', command: 'start_scene_refresh' });
    },
    getSceneWorkspaceState() {
      return client.invoke<SceneWorkspaceState>({ label: 'get_scene_workspace_state', command: 'get_scene_workspace_state' });
    },
    listScenePickerWindows() {
      return client.invoke<ProcessWindowCandidate[]>({ label: 'list_scene_picker_windows', command: 'list_scene_picker_windows' });
    },
    getSceneMousePickerState() {
      return client.invoke<RuntimeSceneMousePickerSnapshot>({ label: 'get_scene_mouse_picker_state', command: 'get_scene_mouse_picker_state', logSuccess: false });
    },
    setSceneMousePickerTarget(windowHandle: string | null) {
      return client.invoke<RuntimeSceneMousePickerSnapshot>({
        label: 'set_scene_mouse_picker_target',
        command: 'set_scene_mouse_picker_target',
        args: { windowHandle },
      });
    },
    startSceneMousePicker() {
      return client.invoke<RuntimeSceneMousePickerSnapshot>({ label: 'start_scene_mouse_picker', command: 'start_scene_mouse_picker' });
    },
    stopSceneMousePicker() {
      return client.invoke<RuntimeSceneMousePickerSnapshot>({ label: 'stop_scene_mouse_picker', command: 'stop_scene_mouse_picker' });
    },
    getSceneObjectChildren(objectAddress: string) {
      return client.invoke<RuntimeSceneChildrenSnapshot>({ label: 'get_scene_object_children', command: 'get_scene_object_children', args: { objectAddress } });
    },
    startSceneObjectChildrenAnalysis(objectAddress: string) {
      return client.invoke<RuntimeSceneObjectChildrenTaskState | null>({ label: 'start_scene_object_children_analysis', command: 'start_scene_object_children_analysis', args: { objectAddress } });
    },
    getSceneObjectChildrenState(objectAddress: string) {
      return client.invoke<RuntimeSceneObjectChildrenTaskState | null>({ label: 'get_scene_object_children_state', command: 'get_scene_object_children_state', args: { objectAddress }, logSuccess: false });
    },
    cancelSceneObjectChildrenAnalysis(objectAddress: string, taskId?: number) {
      return client.invoke<RuntimeSceneObjectChildrenTaskState | null>({ label: 'cancel_scene_object_children_analysis', command: 'cancel_scene_object_children_analysis', args: taskId == null ? { objectAddress } : { objectAddress, taskId } });
    },
    getSceneObjectInspector(objectAddress: string) {
      return client.invoke<RuntimeSceneObjectInspectorSnapshot>({ label: 'get_scene_object_inspector', command: 'get_scene_object_inspector', args: { objectAddress } });
    },
    startSceneObjectInspectorAnalysis(objectAddress: string) {
      return client.invoke<RuntimeSceneObjectInspectorTaskState | null>({ label: 'start_scene_object_inspector_analysis', command: 'start_scene_object_inspector_analysis', args: { objectAddress } });
    },
    getSceneObjectInspectorState() {
      return client.invoke<RuntimeSceneObjectInspectorTaskState | null>({ label: 'get_scene_object_inspector_state', command: 'get_scene_object_inspector_state', logSuccess: false });
    },
    cancelSceneObjectInspectorAnalysis(taskId?: number) {
      return client.invoke<RuntimeSceneObjectInspectorTaskState | null>({ label: 'cancel_scene_object_inspector_analysis', command: 'cancel_scene_object_inspector_analysis', args: taskId == null ? undefined : { taskId } });
    },
    createSceneRoot(sceneHandle: number, name: string) {
      return client.invoke<RuntimeSceneMutationResult>({ label: 'create_scene_root', command: 'create_scene_root', args: { sceneHandle, name } });
    },
    createSceneChild(parentObjectAddress: string, name: string) {
      return client.invoke<RuntimeSceneMutationResult>({ label: 'create_scene_child', command: 'create_scene_child', args: { parentObjectAddress, name } });
    },
    duplicateSceneObject(objectAddress: string) {
      return client.invoke<RuntimeSceneMutationResult>({ label: 'duplicate_scene_object', command: 'duplicate_scene_object', args: { objectAddress } });
    },
    deleteSceneObject(objectAddress: string) {
      return client.invoke<RuntimeSceneMutationResult>({ label: 'delete_scene_object', command: 'delete_scene_object', args: { objectAddress } });
    },
    renameSceneObject(objectAddress: string, name: string) {
      return client.invoke<RuntimeSceneMutationResult>({ label: 'rename_scene_object', command: 'rename_scene_object', args: { objectAddress, name } });
    },
    setSceneObjectTag(objectAddress: string, tag: string) {
      return client.invoke<RuntimeSceneMutationResult>({ label: 'set_scene_object_tag', command: 'set_scene_object_tag', args: { objectAddress, tag } });
    },
    setSceneObjectLayer(objectAddress: string, layer: number) {
      return client.invoke<RuntimeSceneMutationResult>({ label: 'set_scene_object_layer', command: 'set_scene_object_layer', args: { objectAddress, layer } });
    },
    setSceneObjectHideFlags(objectAddress: string, hideFlags: string) {
      return client.invoke<RuntimeSceneMutationResult>({ label: 'set_scene_object_hide_flags', command: 'set_scene_object_hide_flags', args: { objectAddress, hideFlags } });
    },
    reparentSceneObject(request: ReparentSceneObjectRequest) {
      return client.invoke<RuntimeSceneMutationResult>({ label: 'reparent_scene_object', command: 'reparent_scene_object', args: request as unknown as Record<string, unknown> });
    },
    setSceneObjectActive(objectAddress: string, activeSelf: boolean) {
      return client.invoke<RuntimeSceneMutationResult>({ label: 'set_scene_object_active', command: 'set_scene_object_active', args: { objectAddress, activeSelf } });
    },
    setSceneObjectTransform(objectAddress: string, transformUpdate: RuntimeSceneTransformUpdate) {
      return client.invoke<RuntimeSceneMutationResult>({ label: 'set_scene_object_transform', command: 'set_scene_object_transform', args: { objectAddress, transformUpdate } });
    },
    setSceneBehaviourEnabled(componentAddress: string, enabled: boolean) {
      return client.invoke<RuntimeSceneMutationResult>({ label: 'set_scene_behaviour_enabled', command: 'set_scene_behaviour_enabled', args: { componentAddress, enabled } });
    },
    createSceneComponent(objectAddress: string, componentTypeName: string) {
      return client.invoke<RuntimeSceneMutationResult>({ label: 'create_scene_component', command: 'create_scene_component', args: { objectAddress, componentTypeName } });
    },
    deleteSceneComponent(componentAddress: string) {
      return client.invoke<RuntimeSceneMutationResult>({ label: 'delete_scene_component', command: 'delete_scene_component', args: { componentAddress } });
    },
    loadSceneByBuildIndex(buildIndex: number) {
      return client.invoke<RuntimeSceneMutationResult>({ label: 'load_scene_by_build_index', command: 'load_scene_by_build_index', args: { buildIndex } });
    },
  };
}