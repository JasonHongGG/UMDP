import { useStudioGraph, useStudioUi } from '@/features/studio/application/StudioModuleContext';

export function useStudioNodeWrapperState() {
  const graph = useStudioGraph();
  const ui = useStudioUi();

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