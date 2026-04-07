import { useStudioGraph, useStudioRuntime, useStudioUi } from '@/features/studio/application/StudioModuleContext';

export function useStudioEdgeLayerState() {
  const graph = useStudioGraph();
  const runtime = useStudioRuntime();
  const ui = useStudioUi();

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