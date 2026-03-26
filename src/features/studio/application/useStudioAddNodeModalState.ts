import { getRegisteredStudioNodeCatalog } from '@/features/studio/core/catalog/studioNodeCatalogRuntime';
import { useStudioServices } from '@/features/studio/core/StudioContext';
import { useStudioRuntimeDataState } from './useStudioRuntimeDataState';

export function useStudioAddNodeModalState() {
  const { graph, ui } = useStudioServices();
  const runtimeData = useStudioRuntimeDataState();

  return {
    catalog: getRegisteredStudioNodeCatalog(),
    addNode: graph.addNode,
    isAddModalOpen: ui.isAddModalOpen,
    closeAddModal: ui.closeAddModal,
    addModalPosition: ui.addModalPosition,
    transform: ui.transform,
    classes: runtimeData.classes,
    classCatalog: runtimeData.classCatalog,
  };
}