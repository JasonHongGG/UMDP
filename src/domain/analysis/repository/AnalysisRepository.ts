import type {
  AnalysisSnapshot,
  ProcessSession,
  RuntimeInstanceFieldSnapshot,
  RuntimeOverlaySnapshot,
} from '../contracts';
import type { WorkspaceLifecycleState } from '../../../shared/contracts';

export interface AttachToProcessRequest {
  pid: number;
  name: string;
}

export interface RuntimeInstanceFieldsRequest {
  classStableId: string;
  instanceAddress: string;
}

export interface AnalysisRepository {
  attachToProcess(request: AttachToProcessRequest): Promise<ProcessSession>;
  getWorkspaceLifecycle(): Promise<WorkspaceLifecycleState>;
  loadAllMetadata(): Promise<AnalysisSnapshot>;
  getRuntimeStaticFields(classStableId: string): Promise<RuntimeOverlaySnapshot>;
  getRuntimeInstanceFields(request: RuntimeInstanceFieldsRequest): Promise<RuntimeInstanceFieldSnapshot>;
}
