import { invoke } from '@tauri-apps/api/core';
import type { AnalysisRepository, AttachToProcessRequest, RuntimeInstanceFieldsRequest } from '../../domain/analysis/repository/AnalysisRepository';
import type {
  AnalysisSnapshot,
  ProcessSession,
  RuntimeInstanceFieldSnapshot,
  RuntimeOverlaySnapshot,
} from '../../domain/analysis/contracts';
import type { WorkspaceLifecycleState } from '../../shared/contracts';

export function createTauriAnalysisRepository(): AnalysisRepository {
  return {
    attachToProcess(request: AttachToProcessRequest) {
      return invoke<ProcessSession>('attach_to_process', request as unknown as Record<string, unknown>);
    },
    getWorkspaceLifecycle() {
      return invoke<WorkspaceLifecycleState>('get_workspace_lifecycle');
    },
    loadAllMetadata() {
      return invoke<AnalysisSnapshot>('load_all_metadata');
    },
    getRuntimeStaticFields(classStableId: string) {
      return invoke<RuntimeOverlaySnapshot>('get_runtime_static_fields', { classStableId });
    },
    getRuntimeInstanceFields(request: RuntimeInstanceFieldsRequest) {
      return invoke<RuntimeInstanceFieldSnapshot>('get_runtime_instance_fields', request as unknown as Record<string, unknown>);
    },
  };
}
