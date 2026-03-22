import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GraphDocument } from '../../../domain/studio/contracts';
import { executeStudioFlow } from './executeStudioFlow';
import { StudioRuntimeDataState } from '../../../core/studio/runtimeData';
import type { NodeExecutionSnapshot, NodeExecutionState, StudioEdge, StudioNode } from '../../../core/studio/types';

export type StudioExecutionRunStatus = 'running' | 'success' | 'error' | 'aborted';

export interface StudioExecutionRun {
  runId: string;
  startNodeId: string;
  startedAt: number;
  completedAt?: number;
  status: StudioExecutionRunStatus;
}

export interface StudioRuntimeState {
  nodeStates: Record<string, NodeExecutionState>;
  nodeSnapshots: Record<string, NodeExecutionSnapshot>;
  activeRun: StudioExecutionRun | null;
  runHistory: StudioExecutionRun[];
  executeFlow: (startNodeId: string) => void;
}

export function useStudioRuntimeState(document: GraphDocument, nodes: StudioNode[], edges: StudioEdge[], runtimeData: StudioRuntimeDataState): StudioRuntimeState {
  const [nodeStates, setNodeStates] = useState<Record<string, NodeExecutionState>>({});
  const [nodeSnapshots, setNodeSnapshots] = useState<Record<string, NodeExecutionSnapshot>>({});
  const [activeRun, setActiveRun] = useState<StudioExecutionRun | null>(null);
  const [runHistory, setRunHistory] = useState<StudioExecutionRun[]>([]);
  const executionCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      executionCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    executionCleanupRef.current?.();
    setNodeStates({});
    setNodeSnapshots({});
    setActiveRun(null);
    setRunHistory([]);
  }, [document]);

  const executeFlow = useCallback((startNodeId: string) => {
    executionCleanupRef.current?.();
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
  }, [document.id, edges, nodes, runtimeData]);

  return useMemo(() => ({
    nodeStates,
    nodeSnapshots,
    activeRun,
    runHistory,
    executeFlow,
  }), [activeRun, executeFlow, nodeSnapshots, nodeStates, runHistory]);
}
