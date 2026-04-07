import { getRegisteredStudioNodeCatalog } from '@/features/studio/core/catalog/studioNodeCatalogRuntime';
import { useStudioServices } from '@/features/studio/application/StudioServicesContext';

export function useStudioEditNodeModalState() {
  const { graph, ui, query } = useStudioServices();
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