import type { AnalysisSnapshot } from '../../domain/analysis/contracts';
import type { ProcessSession, WorkspaceLifecycleState } from '../../shared/contracts';

interface DeriveWorkspaceLifecycleInput {
  processSession: ProcessSession | null;
  analysisSnapshot: AnalysisSnapshot | null;
  loadingImages: boolean;
  attachError: string | null;
}

export function deriveWorkspaceLifecycle({
  processSession,
  analysisSnapshot,
  loadingImages,
  attachError,
}: DeriveWorkspaceLifecycleInput): WorkspaceLifecycleState {
  if (attachError) {
    return {
      status: processSession ? 'recovering' : 'bridge-error',
      processSession,
      runtime: processSession?.runtime ?? 'unknown',
      hasSnapshot: Boolean(analysisSnapshot),
      errorMessage: attachError,
    };
  }

  if (!processSession && loadingImages) {
    return {
      status: 'attaching',
      processSession: null,
      runtime: 'unknown',
      hasSnapshot: false,
      errorMessage: null,
    };
  }

  if (!processSession) {
    return {
      status: 'detached',
      processSession: null,
      runtime: 'unknown',
      hasSnapshot: false,
      errorMessage: null,
    };
  }

  if (loadingImages && !analysisSnapshot) {
    return {
      status: 'snapshot-loading',
      processSession,
      runtime: processSession.runtime,
      hasSnapshot: false,
      errorMessage: null,
    };
  }

  if (!analysisSnapshot) {
    return {
      status: 'attached-without-snapshot',
      processSession,
      runtime: processSession.runtime,
      hasSnapshot: false,
      errorMessage: null,
    };
  }

  return {
    status: 'ready',
    processSession,
    runtime: processSession.runtime,
    hasSnapshot: true,
    errorMessage: null,
  };
}

export function getWorkspaceLifecycleLabel(state: WorkspaceLifecycleState) {
  switch (state.status) {
    case 'detached':
      return 'Detached';
    case 'selecting-process':
      return 'Selecting Process';
    case 'attaching':
      return 'Attaching';
    case 'attached-without-snapshot':
      return 'Attached';
    case 'snapshot-loading':
      return 'Loading Snapshot';
    case 'ready':
      return 'Ready';
    case 'bridge-error':
      return 'Bridge Error';
    case 'recovering':
      return 'Recovering';
    default:
      return 'Unknown';
  }
}

export function getWorkspaceLifecycleTone(state: WorkspaceLifecycleState) {
  switch (state.status) {
    case 'ready':
      return 'ready';
    case 'snapshot-loading':
    case 'attaching':
    case 'selecting-process':
    case 'recovering':
      return 'loading';
    case 'bridge-error':
      return 'error';
    case 'attached-without-snapshot':
      return 'warning';
    case 'detached':
    default:
      return 'idle';
  }
}
