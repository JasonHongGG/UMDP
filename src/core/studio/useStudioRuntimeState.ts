import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { executeStudioFlow } from './executionEngine';
import { NodeExecutionSnapshot, NodeExecutionState, StudioEdge, StudioNode, WorkflowDocument } from './types';

export interface StudioRuntimeState {
  nodeStates: Record<string, NodeExecutionState>;
  nodeSnapshots: Record<string, NodeExecutionSnapshot>;
  executeFlow: (startNodeId: string) => void;
}

export function useStudioRuntimeState(document: WorkflowDocument, nodes: StudioNode[], edges: StudioEdge[]): StudioRuntimeState {
  const [nodeStates, setNodeStates] = useState<Record<string, NodeExecutionState>>({});
  const [nodeSnapshots, setNodeSnapshots] = useState<Record<string, NodeExecutionSnapshot>>({});
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
  }, [document]);

  const executeFlow = useCallback((startNodeId: string) => {
    executionCleanupRef.current?.();
    executionCleanupRef.current = executeStudioFlow({
      startNodeId,
      nodes,
      edges,
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
  }, [edges, nodes]);

  return useMemo(() => ({
    nodeStates,
    nodeSnapshots,
    executeFlow,
  }), [executeFlow, nodeSnapshots, nodeStates]);
}
