import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { GraphDocument } from '../../../domain/studio/contracts';
import { executeStudioFlow } from './executeStudioFlow';
import { StudioRuntimeDataState } from '../../../core/studio/runtimeData';
import type { NodeExecutionSnapshot, NodeExecutionState, StudioEdge, StudioNode } from '../../../core/studio/types';
import type { WorkspaceLifecycleState } from '../../../shared/contracts';
import type { StudioExecutionAbortReason } from '../../../domain/studio/contracts';
import { createTraceEvent } from '../../../domain/studio/kernel';
import {
  createStudioEngineState,
  reduceStudioEngineState,
  selectLatestRun,
  selectRunHistory,
} from '../kernel';

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
  const [engineState, dispatchEngine] = useReducer(reduceStudioEngineState, undefined, () => createStudioEngineState());
  const executionCleanupRef = useRef<StudioExecutionCleanup | null>(null);
  const workspaceExecutionReadiness = useMemo(
    () => getWorkspaceExecutionReadiness(workspaceLifecycle),
    [workspaceLifecycle],
  );
  const activeRun = useMemo(() => selectLatestRun(engineState) as StudioExecutionRun | null, [engineState]);
  const runHistory = useMemo(() => selectRunHistory(engineState).slice(0, 20) as StudioExecutionRun[], [engineState]);

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
    dispatchEngine({ type: 'reset-execution' });
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
    dispatchEngine({ type: 'reset-execution' });
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
        dispatchEngine({ type: 'reset-execution' });
      },
      onNodeStateChange: (nodeId, state) => {
        setNodeStates((previous) => ({ ...previous, [nodeId]: state }));
      },
      onNodeSnapshot: (snapshot) => {
        setNodeSnapshots((previous) => ({ ...previous, [snapshot.nodeId]: snapshot }));
      },
      onRunStart: (run) => {
        dispatchEngine({
          type: 'begin-run',
          run: { ...run, status: 'running' },
          event: createTraceEvent(run.runId, 1, 'run-started', run.startedAt, {
            nodeId: run.startNodeId,
          }),
        });
      },
      onRunComplete: (run) => {
        const completedRun: StudioExecutionRun = run;
        dispatchEngine({
          type: 'complete-run',
          runId: completedRun.runId,
          status: completedRun.status,
          completedAt: completedRun.completedAt ?? completedRun.startedAt,
          event: createTraceEvent(completedRun.runId, 2, 'run-completed', completedRun.completedAt ?? completedRun.startedAt, {
            nodeId: completedRun.startNodeId,
          }),
        });
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
