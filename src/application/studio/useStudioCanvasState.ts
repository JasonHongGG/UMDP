import { useStudioServices } from '../../core/studio/StudioContext';

export function useStudioCanvasState() {
  const { graph, ui } = useStudioServices();

  return {
    nodes: graph.nodes,
    transform: ui.transform,
    setTransform: ui.setTransform,
    openAddModal: ui.openAddModal,
    registerCanvasElement: ui.registerCanvasElement,
    clearSelectedNodes: ui.clearSelectedNodes,
    setSelectedNodeIds: ui.setSelectedNodeIds,
    getNodeElement: ui.getNodeElement,
  };
}