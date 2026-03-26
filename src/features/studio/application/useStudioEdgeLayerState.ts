import { useStudioServices } from '@/features/studio/core/StudioContext';

export function useStudioEdgeLayerState() {
  const { graph, runtime, ui } = useStudioServices();

  return {
    edges: graph.edges,
    nodes: graph.nodes,
    disconnectEdge: graph.disconnectEdge,
    nodeStates: runtime.nodeStates,
    nodeSnapshots: runtime.nodeSnapshots,
    transform: ui.transform,
    draftConnection: ui.draftConnection,
    canvasElement: ui.canvasElement,
    getPortElement: ui.getPortElement,
  };
}