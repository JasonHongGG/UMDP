import { useEffect } from 'react';
import type { StudioNodeCatalog } from '@/features/studio/core/catalog/StudioNodeCatalog';
import type { StudioRuntimeDataState } from '@/features/studio/core/runtimeData';
import type { BaseNodeData, StudioEdge, StudioNode } from '@/features/studio/core/types';
import { getStudioNodeLifecycleDefinition } from '@/features/studio/core/types';

export interface StudioNodeLifecycleServices {
  catalog: StudioNodeCatalog;
  nodes: StudioNode[];
  edges: StudioEdge[];
  runtimeData: StudioRuntimeDataState;
}

export interface StudioNodeReconciliation {
  nodeId: string;
  patch: Partial<BaseNodeData>;
}

export function observeStudioNodes({ catalog, nodes, edges, runtimeData }: StudioNodeLifecycleServices) {
  for (const node of nodes) {
    const nodeDef = catalog.get(node.type);
    const lifecycle = nodeDef ? getStudioNodeLifecycleDefinition(nodeDef) : null;
    lifecycle?.observeGraphNode?.(node as never, { nodes, edges, runtimeData });
  }
}

export function collectStudioNodeReconciliations({ catalog, nodes, edges, runtimeData }: StudioNodeLifecycleServices): StudioNodeReconciliation[] {
  const reconciliations: StudioNodeReconciliation[] = [];

  for (const node of nodes) {
    const nodeDef = catalog.get(node.type);
    const lifecycle = nodeDef ? getStudioNodeLifecycleDefinition(nodeDef) : null;
    const patch = lifecycle?.reconcileData?.(node as never, { nodes, edges, runtimeData });
    if (!patch || Object.keys(patch).length === 0) {
      continue;
    }

    reconciliations.push({ nodeId: node.id, patch });
  }

  return reconciliations;
}

export function useStudioNodeLifecycle(
  services: StudioNodeLifecycleServices,
  updateNodeData: (nodeId: string, patch: Partial<BaseNodeData>) => void,
) {
  useEffect(() => {
    observeStudioNodes(services);
  }, [services]);

  useEffect(() => {
    const reconciliations = collectStudioNodeReconciliations(services);
    for (const reconciliation of reconciliations) {
      updateNodeData(reconciliation.nodeId, reconciliation.patch);
    }
  }, [services, updateNodeData]);
}