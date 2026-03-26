import { useStudioGraph, useStudioUi } from '@/features/studio/core/StudioContext';

export function useStudioPageState() {
  const graph = useStudioGraph();
  const ui = useStudioUi();

  return {
    addNode: graph.addNode,
    undo: graph.undo,
    redo: graph.redo,
    saveWorkflow: graph.saveWorkflow,
    deleteNodes: graph.deleteNodes,
    duplicateNodes: graph.duplicateNodes,
    canvasElement: ui.canvasElement,
    transform: ui.transform,
    selectedNodeIds: ui.selectedNodeIds,
    clearSelectedNodes: ui.clearSelectedNodes,
    setSelectedNodeIds: ui.setSelectedNodeIds,
  };
}