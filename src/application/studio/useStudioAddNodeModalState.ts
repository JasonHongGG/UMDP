import { getRegisteredStudioNodeCatalog } from '../../core/studio/catalog/studioNodeCatalogRuntime';
import { useStudioServices } from '../../core/studio/StudioContext';
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