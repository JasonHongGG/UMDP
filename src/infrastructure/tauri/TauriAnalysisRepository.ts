import { invoke } from '@tauri-apps/api/core';
import type { AnalysisRepository, AttachToProcessRequest, RuntimeInstanceFieldsRequest } from '@/domain/analysis/repository/AnalysisRepository';
import type {
  AnalysisSnapshot,
  ProcessSession,
  RuntimeInstanceFieldSnapshot,
  RuntimeOverlaySnapshot,
  RuntimeSceneChildrenSnapshot,
  RuntimeSceneMutationResult,
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectInspectorTaskState,
  RuntimeSceneObjectInspectorSnapshot,
  RuntimeSceneTransformUpdate,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import type { SystemContractVersions, WorkspaceLifecycleState } from '@/shared/contracts';

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

async function timedInvoke<T>(
  label: string,
  command: string,
  args?: Record<string, unknown>,
  options?: { logSuccess?: boolean },
): Promise<T> {
  const startedAt = nowMs();
  const logSuccess = options?.logSuccess ?? true;

  try {
    const result = await invoke<T>(command, args);
    if (logSuccess) {
      console.log(`[perf][tauri] ${label} completed in ${(nowMs() - startedAt).toFixed(1)}ms`);
    }
    return result;
  } catch (error) {
    console.log(`[perf][tauri] ${label} failed in ${(nowMs() - startedAt).toFixed(1)}ms`, error);
    throw error;
  }
}

export function createTauriAnalysisRepository(): AnalysisRepository {
  return {
    attachToProcess(request: AttachToProcessRequest) {
      return timedInvoke<ProcessSession>('attach_to_process', 'attach_to_process', request as unknown as Record<string, unknown>);
    },
    getContractVersions() {
      return timedInvoke<SystemContractVersions>('get_contract_versions', 'get_contract_versions');
    },
    getWorkspaceLifecycle() {
      return timedInvoke<WorkspaceLifecycleState>('get_workspace_lifecycle', 'get_workspace_lifecycle');
    },
    loadAllMetadata() {
      return timedInvoke<AnalysisSnapshot>('load_all_metadata', 'load_all_metadata');
    },
    startSceneRefresh() {
      return timedInvoke<SceneWorkspaceState>('start_scene_refresh', 'start_scene_refresh');
    },
    getSceneWorkspaceState() {
      return timedInvoke<SceneWorkspaceState>('get_scene_workspace_state', 'get_scene_workspace_state');
    },
    getSceneObjectChildren(objectAddress: string) {
      return timedInvoke<RuntimeSceneChildrenSnapshot>('get_scene_object_children', 'get_scene_object_children', { objectAddress });
    },
    startSceneObjectChildrenAnalysis(objectAddress: string) {
      return timedInvoke<RuntimeSceneObjectChildrenTaskState | null>('start_scene_object_children_analysis', 'start_scene_object_children_analysis', { objectAddress });
    },
    getSceneObjectChildrenState(objectAddress: string) {
      return timedInvoke<RuntimeSceneObjectChildrenTaskState | null>(
        'get_scene_object_children_state',
        'get_scene_object_children_state',
        { objectAddress },
        { logSuccess: false },
      );
    },
    cancelSceneObjectChildrenAnalysis(objectAddress: string, taskId?: number) {
      return timedInvoke<RuntimeSceneObjectChildrenTaskState | null>(
        'cancel_scene_object_children_analysis',
        'cancel_scene_object_children_analysis',
        taskId == null ? { objectAddress } : { objectAddress, taskId },
      );
    },
    getSceneObjectInspector(objectAddress: string) {
      return timedInvoke<RuntimeSceneObjectInspectorSnapshot>('get_scene_object_inspector', 'get_scene_object_inspector', { objectAddress });
    },
    startSceneObjectInspectorAnalysis(objectAddress: string) {
      return timedInvoke<RuntimeSceneObjectInspectorTaskState | null>('start_scene_object_inspector_analysis', 'start_scene_object_inspector_analysis', { objectAddress });
    },
    getSceneObjectInspectorState() {
      return timedInvoke<RuntimeSceneObjectInspectorTaskState | null>(
        'get_scene_object_inspector_state',
        'get_scene_object_inspector_state',
        undefined,
        { logSuccess: false },
      );
    },
    cancelSceneObjectInspectorAnalysis(taskId?: number) {
      return timedInvoke<RuntimeSceneObjectInspectorTaskState | null>('cancel_scene_object_inspector_analysis', 'cancel_scene_object_inspector_analysis', taskId == null ? undefined : { taskId });
    },
    createSceneChild(parentObjectAddress: string, name: string) {
      return timedInvoke<RuntimeSceneMutationResult>('create_scene_child', 'create_scene_child', { parentObjectAddress, name });
    },
    duplicateSceneObject(objectAddress: string) {
      return timedInvoke<RuntimeSceneMutationResult>('duplicate_scene_object', 'duplicate_scene_object', { objectAddress });
    },
    deleteSceneObject(objectAddress: string) {
      return timedInvoke<RuntimeSceneMutationResult>('delete_scene_object', 'delete_scene_object', { objectAddress });
    },
    setSceneObjectActive(objectAddress: string, activeSelf: boolean) {
      return timedInvoke<RuntimeSceneMutationResult>('set_scene_object_active', 'set_scene_object_active', { objectAddress, activeSelf });
    },
    setSceneObjectTransform(objectAddress: string, transformUpdate: RuntimeSceneTransformUpdate) {
      return timedInvoke<RuntimeSceneMutationResult>('set_scene_object_transform', 'set_scene_object_transform', { objectAddress, transformUpdate });
    },
    createSceneComponent(objectAddress: string, componentTypeName: string) {
      return timedInvoke<RuntimeSceneMutationResult>('create_scene_component', 'create_scene_component', { objectAddress, componentTypeName });
    },
    deleteSceneComponent(componentAddress: string) {
      return timedInvoke<RuntimeSceneMutationResult>('delete_scene_component', 'delete_scene_component', { componentAddress });
    },
    getRuntimeStaticFields(classStableId: string) {
      return timedInvoke<RuntimeOverlaySnapshot>('get_runtime_static_fields', 'get_runtime_static_fields', { classStableId });
    },
    getRuntimeInstanceFields(request: RuntimeInstanceFieldsRequest) {
      return timedInvoke<RuntimeInstanceFieldSnapshot>('get_runtime_instance_fields', 'get_runtime_instance_fields', request as unknown as Record<string, unknown>);
    },
  };
}
