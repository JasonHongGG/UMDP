import { invoke } from '@tauri-apps/api/core';
import type { AnalysisRepository, AttachToProcessRequest, RuntimeInstanceFieldsRequest } from '@/domain/analysis/repository/AnalysisRepository';
import type {
  AnalysisSnapshot,
  ProcessSession,
  RuntimeInstanceFieldSnapshot,
  RuntimeOverlaySnapshot,
  RuntimeSceneChildrenSnapshot,
  RuntimeSceneObjectInspectorSnapshot,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import type { SystemContractVersions, WorkspaceLifecycleState } from '@/shared/contracts';

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

async function timedInvoke<T>(label: string, command: string, args?: Record<string, unknown>): Promise<T> {
  const startedAt = nowMs();

  try {
    const result = await invoke<T>(command, args);
    console.log(`[perf][tauri] ${label} completed in ${(nowMs() - startedAt).toFixed(1)}ms`);
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
    getSceneObjectInspector(objectAddress: string) {
      return timedInvoke<RuntimeSceneObjectInspectorSnapshot>('get_scene_object_inspector', 'get_scene_object_inspector', { objectAddress });
    },
    getRuntimeStaticFields(classStableId: string) {
      return timedInvoke<RuntimeOverlaySnapshot>('get_runtime_static_fields', 'get_runtime_static_fields', { classStableId });
    },
    getRuntimeInstanceFields(request: RuntimeInstanceFieldsRequest) {
      return timedInvoke<RuntimeInstanceFieldSnapshot>('get_runtime_instance_fields', 'get_runtime_instance_fields', request as unknown as Record<string, unknown>);
    },
  };
}
