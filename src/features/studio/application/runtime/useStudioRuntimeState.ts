import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GraphDocument } from '@/domain/studio/contracts';
import { createDiagnosticsLogger } from '@/shared/diagnostics';
import { executeStudioFlow } from './executeStudioFlow';
import { StudioRuntimeDataState } from '@/features/studio/core/runtimeData';
import type { NodeExecutionSnapshot, NodeExecutionState, StudioEdge, StudioNode } from '@/features/studio/core/types';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import type { StudioExecutionAbortReason } from '@/domain/studio/contracts';
import { useStudioFeedback } from '@/features/studio/application/feedback/StudioFeedbackContext';

const studioRuntimeDiagnostics = createDiagnosticsLogger({
  channel: 'studio',
  origin: 'useStudioRuntimeState',
});

interface StudioExecutionWorkspaceDiagnostics {
  status: WorkspaceLifecycleState['status'];
  hasSnapshot: boolean;
  runtime: WorkspaceLifecycleState['runtime'];
  errorMessage: string | null;
  runtimeSession: {
    status: WorkspaceLifecycleState['runtimeSession']['status'];
    connected: boolean;
    lastError: string | null;
    sessionKey: string | null;
  };
}

interface StudioExecutionWorkspaceReadiness {
  canExecute: boolean;
  blockedReason: string | null;
  diagnostics: StudioExecutionWorkspaceDiagnostics;
}

type StudioExecutionCleanup = (reason?: StudioExecutionAbortReason) => void;

export interface StudioRuntimeState {
  nodeStates: Record<string, NodeExecutionState>;
  nodeSnapshots: Record<string, NodeExecutionSnapshot>;
  canExecuteFlow: boolean;
  executionBlockedReason: string | null;
  executeFlow: (startNodeId: string) => void;
}

function getWorkspaceExecutionReadiness(workspaceLifecycle: WorkspaceLifecycleState): StudioExecutionWorkspaceReadiness {
  const diagnostics: StudioExecutionWorkspaceDiagnostics = {
    status: workspaceLifecycle.status,
    hasSnapshot: workspaceLifecycle.hasSnapshot,
    runtime: workspaceLifecycle.runtime,
    errorMessage: workspaceLifecycle.errorMessage,
    runtimeSession: {
      status: workspaceLifecycle.runtimeSession.status,
      connected: workspaceLifecycle.runtimeSession.connected,
      lastError: workspaceLifecycle.runtimeSession.lastError,
      sessionKey: workspaceLifecycle.runtimeSession.sessionKey,
    },
  };

  if (!workspaceLifecycle.hasSnapshot) {
    return {
      canExecute: false,
      blockedReason: 'Workspace snapshot is unavailable.',
      diagnostics,
    };
  }

  if (workspaceLifecycle.status !== 'ready') {
    return {
      canExecute: false,
      blockedReason: `Workspace is not ready (${workspaceLifecycle.status}).`,
      diagnostics,
    };
  }

  if (!workspaceLifecycle.runtimeSession.connected) {
    return {
      canExecute: false,
      blockedReason: 'Runtime session is disconnected.',
      diagnostics,
    };
  }

  if (workspaceLifecycle.runtimeSession.status !== 'ready' && workspaceLifecycle.runtimeSession.status !== 'degraded') {
    return {
      canExecute: false,
      blockedReason: `Runtime session is not ready (${workspaceLifecycle.runtimeSession.status}).`,
      diagnostics,
    };
  }

  return {
    canExecute: true,
    blockedReason: null,
    diagnostics,
  };
}

function logWorkspaceExecutionInterruption(reason: 'blocked' | 'reset', blockedReason: string, workspaceLifecycle: WorkspaceLifecycleState) {
  const readiness = getWorkspaceExecutionReadiness(workspaceLifecycle);
  const details = {
    context: {
      reason,
      message: blockedReason,
      workspace: readiness.diagnostics,
    },
  };

  if (reason === 'blocked') {
    studioRuntimeDiagnostics.error('Studio execution blocked.', details);
    return;
  }

  studioRuntimeDiagnostics.warn('Studio execution reset.', details);
}

export function useStudioRuntimeState(
  document: GraphDocument,
  nodes: StudioNode[],
  edges: StudioEdge[],
  runtimeData: StudioRuntimeDataState,
  workspaceLifecycle: WorkspaceLifecycleState,
): StudioRuntimeState {
  const [nodeStates, setNodeStates] = useState<Record<string, NodeExecutionState>>({});
  const [nodeSnapshots, setNodeSnapshots] = useState<Record<string, NodeExecutionSnapshot>>({});
  const executionCleanupRef = useRef<StudioExecutionCleanup | null>(null);
  const {
    reportDocumentFeedback,
    reportRuntimeFeedback,
    clearDocumentFeedback,
    clearRuntimeFeedback,
  } = useStudioFeedback();
  const workspaceExecutionReadiness = useMemo(
    () => getWorkspaceExecutionReadiness(workspaceLifecycle),
    [workspaceLifecycle],
  );

  useEffect(() => {
    return () => {
      executionCleanupRef.current?.('component-dispose');
      clearRuntimeFeedback();
    };
  }, [clearRuntimeFeedback]);

  useEffect(() => {
    executionCleanupRef.current?.('document-reset');
    executionCleanupRef.current = null;
    setNodeStates({});
    setNodeSnapshots({});
    clearRuntimeFeedback();
  }, [clearRuntimeFeedback, document]);

  useEffect(() => {
    if (workspaceExecutionReadiness.canExecute) {
      clearDocumentFeedback();
      return;
    }

    if (executionCleanupRef.current) {
      logWorkspaceExecutionInterruption('reset', workspaceExecutionReadiness.blockedReason ?? 'Workspace execution context changed.', workspaceLifecycle);
      reportRuntimeFeedback({
        tone: 'warning',
        title: 'Execution Reset',
        description: workspaceExecutionReadiness.blockedReason ?? 'Runtime state was cleared because the workspace execution context changed.',
      });
    }

    executionCleanupRef.current?.('workspace-reset');
    executionCleanupRef.current = null;
    setNodeStates({});
    setNodeSnapshots({});
    reportDocumentFeedback({
      tone: workspaceLifecycle.status === 'recovering' || workspaceLifecycle.status === 'runtime-error' ? 'warning' : 'info',
      title: 'Studio Runtime Locked',
      description: workspaceExecutionReadiness.blockedReason ?? 'Studio runtime execution is currently unavailable.',
    });
  }, [clearDocumentFeedback, reportDocumentFeedback, reportRuntimeFeedback, workspaceExecutionReadiness, workspaceLifecycle]);

  const executeFlow = useCallback((startNodeId: string) => {
    if (!workspaceExecutionReadiness.canExecute) {
      logWorkspaceExecutionInterruption('blocked', workspaceExecutionReadiness.blockedReason ?? 'Workspace is not ready for execution.', workspaceLifecycle);
      reportRuntimeFeedback({
        tone: 'error',
        title: 'Execution Blocked',
        description: workspaceExecutionReadiness.blockedReason ?? 'Workspace is not ready for execution.',
      });
      return;
    }

    executionCleanupRef.current?.('rerun');
    clearRuntimeFeedback();
    reportDocumentFeedback({
      tone: 'info',
      title: 'Execution Active',
      description: `Executing workflow from ${startNodeId}.`,
    });
    executionCleanupRef.current = executeStudioFlow({
      documentId: document.id,
      startNodeId,
      nodes,
      edges,
      resolveStaticFieldAddress: runtimeData.classCatalog.resolveStaticFieldAddress,
      getClassInfoCatalogByBinding: runtimeData.classCatalog.getByBinding,
      onReset: () => {
        setNodeStates({});
        setNodeSnapshots({});
      },
      onNodeStateChange: (nodeId, state) => {
        setNodeStates((previous) => ({ ...previous, [nodeId]: state }));
      },
      onNodeSnapshot: (snapshot) => {
        setNodeSnapshots((previous) => ({ ...previous, [snapshot.nodeId]: snapshot }));
      },
    });
  }, [clearRuntimeFeedback, document.id, edges, nodes, reportDocumentFeedback, reportRuntimeFeedback, runtimeData, workspaceExecutionReadiness, workspaceLifecycle]);

  return useMemo(() => ({
    nodeStates,
    nodeSnapshots,
    canExecuteFlow: workspaceExecutionReadiness.canExecute,
    executionBlockedReason: workspaceExecutionReadiness.blockedReason,
    executeFlow,
  }), [executeFlow, nodeSnapshots, nodeStates, workspaceExecutionReadiness]);
}
