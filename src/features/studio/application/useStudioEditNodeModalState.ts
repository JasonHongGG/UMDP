import { getRegisteredStudioNodeCatalog } from '@/features/studio/core/catalog/studioNodeCatalogRuntime';
import { useStudioGraph, useStudioQuery, useStudioUi } from '@/features/studio/application/StudioModuleContext';

export function useStudioEditNodeModalState() {
  const graph = useStudioGraph();
  const ui = useStudioUi();
  const query = useStudioQuery();
  const catalog = getRegisteredStudioNodeCatalog();

  return {
    catalog,
    nodes: graph.nodes,
    edges: graph.edges,
    updateNodeData: graph.updateNodeData,
    isEditModalOpen: ui.isEditModalOpen,
    closeEditModal: ui.closeEditModal,
    editingNodeId: ui.editingNodeId,
    query,
  };
}