import type { StudioRuntimeDataState } from './runtimeData';
import type { BaseNodeData, StudioEdge, StudioNode } from './types';

export interface StudioNodeLifecycleContext {
  nodes: StudioNode[];
  edges: StudioEdge[];
  runtimeData: StudioRuntimeDataState;
}

export type StudioNodeObserver<T extends BaseNodeData> = (
  node: StudioNode<T>,
  context: StudioNodeLifecycleContext,
) => void;

export type StudioNodeReconciler<T extends BaseNodeData> = (
  node: StudioNode<T>,
  context: StudioNodeLifecycleContext,
) => Partial<T> | null;
