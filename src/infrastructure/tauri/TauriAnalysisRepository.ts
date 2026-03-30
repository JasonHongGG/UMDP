import type { AnalysisRepository, AttachToProcessRequest, RuntimeInstanceFieldsRequest } from '@/domain/analysis/repository/AnalysisRepository';
import type {
  AnalysisSnapshot,
  ProcessSession,
  RuntimeInstanceFieldSnapshot,
  RuntimeOverlaySnapshot,
} from '@/domain/analysis/contracts';
import type { SystemContractVersions, WorkspaceLifecycleState } from '@/shared/contracts';
import { createTauriIpcClient } from './TauriIpcClient';

export function createTauriAnalysisRepository(): AnalysisRepository {
  const client = createTauriIpcClient();

  return {
    attachToProcess(request: AttachToProcessRequest) {
      return client.invoke<ProcessSession>({ label: 'attach_to_process', command: 'attach_to_process', args: request as unknown as Record<string, unknown> });
    },
    getContractVersions() {
      return client.invoke<SystemContractVersions>({ label: 'get_contract_versions', command: 'get_contract_versions' });
    },
    getWorkspaceLifecycle() {
      return client.invoke<WorkspaceLifecycleState>({ label: 'get_workspace_lifecycle', command: 'get_workspace_lifecycle' });
    },
    loadAllMetadata() {
      return client.invoke<AnalysisSnapshot>({ label: 'load_all_metadata', command: 'load_all_metadata' });
    },
    getRuntimeStaticFields(classStableId: string) {
      return client.invoke<RuntimeOverlaySnapshot>({ label: 'get_runtime_static_fields', command: 'get_runtime_static_fields', args: { classStableId } });
    },
    getRuntimeInstanceFields(request: RuntimeInstanceFieldsRequest) {
      return client.invoke<RuntimeInstanceFieldSnapshot>({ label: 'get_runtime_instance_fields', command: 'get_runtime_instance_fields', args: request as unknown as Record<string, unknown> });
    },
  };
}
