import { useStudioGraph, useStudioUi } from '@/features/studio/application/StudioModuleContext';

export function useStudioCanvasState() {
  const graph = useStudioGraph();
  const ui = useStudioUi();

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