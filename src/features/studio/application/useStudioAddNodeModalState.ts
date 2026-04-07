import { getRegisteredStudioNodeCatalog } from '@/features/studio/core/catalog/studioNodeCatalogRuntime';
import { useStudioGraph, useStudioUi } from '@/features/studio/application/StudioModuleContext';
import { useStudioRuntimeDataState } from './useStudioRuntimeDataState';

export function useStudioAddNodeModalState() {
  const graph = useStudioGraph();
  const ui = useStudioUi();
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