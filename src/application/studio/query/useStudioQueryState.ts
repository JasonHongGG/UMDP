import { useMemo } from 'react';
import {
  getNodeInputBindingStates,
  getNodeOutputPreview,
  getNodeQuerySnapshot,
  getNodeQueryState,
  type InputPortBindingState,
} from './nodeQueryService';
import type { StudioNodeQueryContext } from '../../../core/studio/queryTypes';
import type { StudioRuntimeDataState } from '../../../core/studio/runtimeData';
import type { NodeExecutionOutputMap, NodeExecutionSnapshot, StudioEdge, StudioNode } from '../../../core/studio/types';

export interface StudioQueryState {
  context: StudioNodeQueryContext;
  getNodeSnapshot: (nodeId: string) => NodeExecutionSnapshot | null;
  getNodeOutputPreview: (nodeId: string) => NodeExecutionOutputMap | null;
  getNodeInputBindingStates: (nodeId: string) => InputPortBindingState[];
  getNodeQueryState: <T>(nodeId: string) => T | null;
}

export function useStudioQueryState(
  nodes: StudioNode[],
  edges: StudioEdge[],
  nodeSnapshots: Record<string, NodeExecutionSnapshot>,
  runtimeData: StudioRuntimeDataState,
): StudioQueryState {
  const context = useMemo<StudioNodeQueryContext>(() => ({
    nodes,
    edges,
    nodeSnapshots,
    runtimeData,
  }), [edges, nodeSnapshots, nodes, runtimeData]);

  return useMemo(() => ({
    context,
    getNodeSnapshot: (nodeId: string) => getNodeQuerySnapshot(nodeId, context),
    getNodeOutputPreview: (nodeId: string) => getNodeOutputPreview(nodeId, context),
    getNodeInputBindingStates: (nodeId: string) => getNodeInputBindingStates(nodeId, context),
    getNodeQueryState: <T,>(nodeId: string) => getNodeQueryState<T>(nodeId, context),
  }), [context]);
}
