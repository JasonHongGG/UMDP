import type { NodeExecutionSnapshot } from './types';
import type { StudioRuntimeDataState } from './runtimeData';
import type { StudioEdge, StudioNode } from './types';

export interface StudioNodeQueryContext {
  nodes: StudioNode[];
  edges: StudioEdge[];
  nodeSnapshots: Record<string, NodeExecutionSnapshot>;
  runtimeData: StudioRuntimeDataState;
}
