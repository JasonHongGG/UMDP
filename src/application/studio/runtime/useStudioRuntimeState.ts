import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GraphDocument } from '../../../domain/studio/contracts';
import { executeStudioFlow } from './executeStudioFlow';
import { StudioRuntimeDataState } from '../../../core/studio/runtimeData';
import type { NodeExecutionSnapshot, NodeExecutionState, StudioEdge, StudioNode } from '../../../core/studio/types';
import type { WorkspaceLifecycleState } from '../../../shared/contracts';
import type { StudioExecutionAbortReason } from '../../../domain/studio/contracts';

export type StudioExecutionRunStatus = 'running' | 'success' | 'error' | 'aborted';

interface StudioExecutionWorkspaceDiagnostics {
  status: WorkspaceLifecycleState['status'];
  hasSnapshot: boolean;
  runtime: WorkspaceLifecycleState['runtime'];
  errorMessage: string | null;
  runtimeSession: {
    status: WorkspaceLifecycleState['runtimeSession']['status'];
    bridgeConnected: boolean;
    lastError: string | null;
    sessionKey: string | null;
  };
}

interface StudioExecutionWorkspaceReadiness {
  canExecute: boolean;
  blockedReason: string | null;
  diagnostics: StudioExecutionWorkspaceDiagnostics;
}

export interface StudioExecutionRun {
  runId: string;
  startNodeId: string;
  startedAt: number;
  completedAt?: number;
  status: StudioExecutionRunStatus;
  abortReason?: StudioExecutionAbortReason;
}

type StudioExecutionCleanup = (reason?: StudioExecutionAbortReason) => void;

export interface StudioRuntimeState {
  nodeStates: Record<string, NodeExecutionState>;
  nodeSnapshots: Record<string, NodeExecutionSnapshot>;
  activeRun: StudioExecutionRun | null;
  runHistory: StudioExecutionRun[];
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
      bridgeConnected: workspaceLifecycle.runtimeSession.bridgeConnected,
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

  if (!workspaceLifecycle.runtimeSession.bridgeConnected) {
    return {
      canExecute: false,
      blockedReason: 'Runtime bridge is disconnected.',
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
  console.error('[StudioWorkspaceExecution]', {
    reason,
    message: blockedReason,
    workspace: readiness.diagnostics,
  });
}

export function useStudioRuntimeState(document: GraphDocument, nodes: StudioNode[], edges: StudioEdge[], runtimeData: StudioRuntimeDataState, workspaceLifecycle: WorkspaceLifecycleState): StudioRuntimeState {
  const [nodeStates, setNodeStates] = useState<Record<string, NodeExecutionState>>({});
  const [nodeSnapshots, setNodeSnapshots] = useState<Record<string, NodeExecutionSnapshot>>({});
  const [activeRun, setActiveRun] = useState<StudioExecutionRun | null>(null);
  const [runHistory, setRunHistory] = useState<StudioExecutionRun[]>([]);
  const executionCleanupRef = useRef<StudioExecutionCleanup | null>(null);
  const workspaceExecutionReadiness = useMemo(
    () => getWorkspaceExecutionReadiness(workspaceLifecycle),
    [workspaceLifecycle],
  );

  useEffect(() => {
    return () => {
      executionCleanupRef.current?.('component-dispose');
    };
  }, []);

  useEffect(() => {
    executionCleanupRef.current?.('document-reset');
    executionCleanupRef.current = null;
    setNodeStates({});
    setNodeSnapshots({});
    setActiveRun(null);
    setRunHistory([]);
  }, [document]);

  useEffect(() => {
    if (workspaceExecutionReadiness.canExecute) {
      return;
    }

    if (executionCleanupRef.current) {
      logWorkspaceExecutionInterruption('reset', workspaceExecutionReadiness.blockedReason ?? 'Workspace execution context changed.', workspaceLifecycle);
    }

    executionCleanupRef.current?.('workspace-reset');
    executionCleanupRef.current = null;
    setNodeStates({});
    setNodeSnapshots({});
    setActiveRun(null);
  }, [workspaceExecutionReadiness, workspaceLifecycle]);

  const executeFlow = useCallback((startNodeId: string) => {
    if (!workspaceExecutionReadiness.canExecute) {
      logWorkspaceExecutionInterruption('blocked', workspaceExecutionReadiness.blockedReason ?? 'Workspace is not ready for execution.', workspaceLifecycle);
      return;
    }

    executionCleanupRef.current?.('rerun');
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
        setActiveRun(null);
      },
      onNodeStateChange: (nodeId, state) => {
        setNodeStates((previous) => ({ ...previous, [nodeId]: state }));
      },
      onNodeSnapshot: (snapshot) => {
        setNodeSnapshots((previous) => ({ ...previous, [snapshot.nodeId]: snapshot }));
      },
      onRunStart: (run) => {
        setActiveRun({ ...run, status: 'running' });
      },
      onRunComplete: (run) => {
        const completedRun: StudioExecutionRun = run;
        setActiveRun((previous) => previous?.runId === completedRun.runId ? completedRun : previous);
        setRunHistory((previous) => [completedRun, ...previous.filter((entry) => entry.runId !== completedRun.runId)].slice(0, 20));
      },
    });
  }, [document.id, edges, nodes, runtimeData, workspaceExecutionReadiness, workspaceLifecycle]);

  return useMemo(() => ({
    nodeStates,
    nodeSnapshots,
    activeRun,
    runHistory,
    canExecuteFlow: workspaceExecutionReadiness.canExecute,
    executionBlockedReason: workspaceExecutionReadiness.blockedReason,
    executeFlow,
  }), [activeRun, executeFlow, nodeSnapshots, nodeStates, runHistory, workspaceExecutionReadiness]);
}
