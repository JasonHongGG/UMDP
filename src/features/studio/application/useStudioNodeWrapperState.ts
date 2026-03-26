import { useStudioServices } from '@/features/studio/core/StudioContext';

export function useStudioNodeWrapperState() {
  const { graph, ui } = useStudioServices();

  return {
    nodes: graph.nodes,
    updateNodePosition: graph.updateNodePosition,
    updateNodePositions: graph.updateNodePositions,
    beginNodePositionSession: graph.beginNodePositionSession,
    commitNodePositionSession: graph.commitNodePositionSession,
    deleteNode: graph.deleteNode,
    transform: ui.transform,
    openEditModal: ui.openEditModal,
    selectedNodeIds: ui.selectedNodeIds,
    selectSingleNode: ui.selectSingleNode,
    toggleSelectedNode: ui.toggleSelectedNode,
    registerNodeElement: ui.registerNodeElement,
  };
}