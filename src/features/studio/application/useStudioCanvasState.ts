import { useStudioServices } from '@/features/studio/application/StudioServicesContext';

export function useStudioCanvasState() {
  const { graph, ui } = useStudioServices();

  return {
    nodes: graph.nodes,
    canvasMode: ui.canvasMode,
    transform: ui.transform,
    setTransform: ui.setTransform,
    openAddModal: ui.openAddModal,
    registerCanvasElement: ui.registerCanvasElement,
    clearSelectedNodes: ui.clearSelectedNodes,
    setSelectedNodeIds: ui.setSelectedNodeIds,
    getNodeElement: ui.getNodeElement,
    beginCanvasPan: ui.beginCanvasPan,
    updateCanvasPan: ui.updateCanvasPan,
    beginMarqueeSelection: ui.beginMarqueeSelection,
    updateMarqueeSelection: ui.updateMarqueeSelection,
    endCanvasInteraction: ui.endCanvasInteraction,
  };
}