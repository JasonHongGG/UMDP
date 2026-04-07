import { useStudioGraph, useStudioUi } from '@/features/studio/application/StudioModuleContext';

export function useStudioPortState() {
  const graph = useStudioGraph();
  const ui = useStudioUi();

  return {
    nodes: graph.nodes,
    edges: graph.edges,
    startConnection: ui.startConnection,
    finishConnection: ui.finishConnection,
    cancelConnection: ui.cancelConnection,
    draftConnection: ui.draftConnection,
    updateConnectionTarget: ui.updateConnectionTarget,
    transform: ui.transform,
    canvasElement: ui.canvasElement,
    registerPortElement: ui.registerPortElement,
  };
}