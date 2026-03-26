import type {
  AnalysisSnapshot,
  ProcessSession,
  RuntimeFieldSetRequest,
  RuntimeFieldSetResult,
  RuntimeInstanceFieldSnapshot,
  RuntimeMethodInvokeRequest,
  RuntimeMethodInvokeResult,
  RuntimeOverlaySnapshot,
} from '../../analysis/contracts';
import type { SystemContractVersions, WorkspaceLifecycleState } from '@/shared/contracts';

export interface StudioAttachRequest {
  pid: number;
  name: string;
}

export interface RuntimeInstanceFieldsRequest {
  classStableId: string;
  instanceAddress: string;
}

export interface StudioBridgeFacade {
  attachToProcess(request: StudioAttachRequest): Promise<ProcessSession>;
  getContractVersions(): Promise<SystemContractVersions>;
  getWorkspaceLifecycle(): Promise<WorkspaceLifecycleState>;
  loadAnalysisSnapshot(): Promise<AnalysisSnapshot>;
  loadRuntimeOverlay(classStableId: string): Promise<RuntimeOverlaySnapshot>;
  loadRuntimeInstanceFields(request: RuntimeInstanceFieldsRequest): Promise<RuntimeInstanceFieldSnapshot>;
  invokeRuntimeMethod(request: RuntimeMethodInvokeRequest): Promise<RuntimeMethodInvokeResult>;
  setRuntimeFieldValue(request: RuntimeFieldSetRequest): Promise<RuntimeFieldSetResult>;
}