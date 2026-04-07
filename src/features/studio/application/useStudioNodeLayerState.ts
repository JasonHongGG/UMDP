import { getNodePortsByDirection } from '@/features/studio/core/NodeRegistry';
import { getRegisteredStudioNodeCatalog } from '@/features/studio/core/catalog/studioNodeCatalogRuntime';
import { getStudioNodePresentationDefinition } from '@/features/studio/core/types';
import { useStudioGraph, useStudioRuntime } from '@/features/studio/application/StudioModuleContext';

export function useStudioNodeLayerState() {
  const graph = useStudioGraph();
  const runtime = useStudioRuntime();
  const catalog = getRegisteredStudioNodeCatalog();
  const isExecutionActive = Object.values(runtime.nodeStates).some((state) => state === 'running');

  return graph.nodes.map((node) => {
    const definition = catalog.get(node.type);
    if (!definition) {
      return null;
    }

    return {
      node,
      definition,
      Component: getStudioNodePresentationDefinition(definition).CanvasComponent,
      inputs: getNodePortsByDirection(definition, 'input'),
      outputs: getNodePortsByDirection(definition, 'output'),
      executionState: runtime.nodeStates[node.id] ?? 'idle',
      executionSnapshot: runtime.nodeSnapshots[node.id] ?? null,
      isRunActive: isExecutionActive,
    };
  }).filter((entry) => entry !== null);
}