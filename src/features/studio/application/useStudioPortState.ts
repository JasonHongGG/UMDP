import { useStudioServices } from '@/features/studio/application/StudioServicesContext';

export function useStudioPortState() {
  const { graph, ui } = useStudioServices();

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