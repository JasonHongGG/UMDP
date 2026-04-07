import type { AnalysisRepository } from '@/domain/analysis/repository/AnalysisRepository';
import type { ActivePage } from '@/domain/analysis/workspace-types';
import type {
  AnalysisSnapshot,
  ProcessSession,
  RuntimeClassOverlayDescriptor,
  RuntimeInstanceFieldSnapshot,
} from '@/domain/analysis/contracts';
import type {
  OperationErrorEnvelope,
  OperationFeedbackEnvelope,
  SystemContractVersions,
  WorkspaceLifecycleState,
  WorkspaceTaskSnapshot,
} from '@/shared/contracts';
import type { PendingClassNodeRequest } from '@/domain/studio/editor';

export interface AppServices {
  analysisRepository: AnalysisRepository;
}

export interface WorkspaceSliceState {
  activePage: ActivePage;
  contractVersions: SystemContractVersions | null;
  lifecycle: WorkspaceLifecycleState;
  previousLifecycle: WorkspaceLifecycleState | null;
  tasksBySource: Record<string, WorkspaceTaskSnapshot[]>;
  feedback: OperationFeedbackEnvelope | null;
}

export interface AnalysisSliceState {
  attachError: OperationErrorEnvelope | null;
  analysisSnapshot: AnalysisSnapshot | null;
  loadingSnapshot: boolean;
  runtimeOverlays: Record<string, RuntimeClassOverlayDescriptor>;
  runtimeInstanceFieldSnapshots: Record<string, RuntimeInstanceFieldSnapshot>;
  runtimeFieldErrorByKey: Record<string, OperationErrorEnvelope | null>;
  loadingRuntimeByKey: Record<string, boolean>;
  runtimeInstanceFieldErrorByKey: Record<string, OperationErrorEnvelope | null>;
  loadingRuntimeInstanceByKey: Record<string, boolean>;
  pendingClassNode: PendingClassNodeRequest | null;
}

export interface AppStateShape {
  workspace: WorkspaceSliceState;
  analysis: AnalysisSliceState;
}

export interface ThunkConfig {
  state: AppStateShape;
  extra: AppServices;
  rejectValue: OperationErrorEnvelope;
}

export interface LoadAnalysisSnapshotRequest {
  processSession: ProcessSession | null;
}