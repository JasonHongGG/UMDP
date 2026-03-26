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

export function createTauriAnalysisRepository(): AnalysisRepository {
  return {
    attachToProcess(request: AttachToProcessRequest) {
      return invoke<ProcessSession>('attach_to_process', request as unknown as Record<string, unknown>);
    },
    getContractVersions() {
      return invoke<SystemContractVersions>('get_contract_versions');
    },
    getWorkspaceLifecycle() {
      return invoke<WorkspaceLifecycleState>('get_workspace_lifecycle');
    },
    loadAllMetadata() {
      return invoke<AnalysisSnapshot>('load_all_metadata');
    },
    startSceneRefresh() {
      return invoke<SceneWorkspaceState>('start_scene_refresh');
    },
    getSceneWorkspaceState() {
      return invoke<SceneWorkspaceState>('get_scene_workspace_state');
    },
    getSceneObjectChildren(objectAddress: string) {
      return invoke<RuntimeSceneChildrenSnapshot>('get_scene_object_children', { objectAddress });
    },
    getSceneObjectInspector(objectAddress: string) {
      return invoke<RuntimeSceneObjectInspectorSnapshot>('get_scene_object_inspector', { objectAddress });
    },
    getRuntimeStaticFields(classStableId: string) {
      return invoke<RuntimeOverlaySnapshot>('get_runtime_static_fields', { classStableId });
    },
    getRuntimeInstanceFields(request: RuntimeInstanceFieldsRequest) {
      return invoke<RuntimeInstanceFieldSnapshot>('get_runtime_instance_fields', request as unknown as Record<string, unknown>);
    },
  };
}
