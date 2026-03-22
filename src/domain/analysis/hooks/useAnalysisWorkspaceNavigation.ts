import { useCallback, useState } from 'react';
import { createPendingClassNodeRequest, type ClassBinding, type ClassInfoCatalog, type PendingClassNodeRequest } from '../../studio/editor';
import type { StableId } from '../../contracts/shared-identity';

type ActivePage = 'inspector' | 'studio';

interface InspectorTabEntry {
  imageStableId: StableId;
  classStableId: StableId;
  name: string;
  namespace: string;
  imageName: string;
}

interface UseAnalysisWorkspaceNavigationOptions {
  classInfoCatalogByStableId: Record<string, ClassInfoCatalog>;
  setSelectedImageStableId: (id: StableId | null) => void;
  openTabForClass: (entry: InspectorTabEntry) => void;
}

export function useAnalysisWorkspaceNavigation({
  classInfoCatalogByStableId,
  setSelectedImageStableId,
  openTabForClass,
}: UseAnalysisWorkspaceNavigationOptions) {
  const [activePage, setActivePage] = useState<ActivePage>('inspector');
  const [pendingClassNode, setPendingClassNode] = useState<PendingClassNodeRequest | null>(null);
  const [pendingScrollImageStableId, setPendingScrollImageStableId] = useState<StableId | null>(null);
  const [pendingScrollClassStableId, setPendingScrollClassStableId] = useState<StableId | null>(null);

  const clearPendingClassNode = useCallback(() => {
    setPendingClassNode(null);
  }, []);

  const clearPendingScrollTarget = useCallback(() => {
    setPendingScrollImageStableId(null);
    setPendingScrollClassStableId(null);
  }, []);

  const handleAddClassToStudio = useCallback((binding: ClassBinding) => {
    const availableInfo = classInfoCatalogByStableId[binding.classStableId];
    if (!availableInfo) {
      return;
    }

    setPendingClassNode(createPendingClassNodeRequest(binding));
    setActivePage('studio');
  }, [classInfoCatalogByStableId]);

  const handleOpenInspectorForBinding = useCallback((binding: ClassBinding) => {
    setSelectedImageStableId(binding.imageStableId);
    openTabForClass({
      imageStableId: binding.imageStableId,
      classStableId: binding.classStableId,
      name: binding.name,
      namespace: binding.namespace,
      imageName: binding.imageName,
    });
    setPendingScrollImageStableId(binding.imageStableId);
    setPendingScrollClassStableId(binding.classStableId);
    setActivePage('inspector');
  }, [openTabForClass, setSelectedImageStableId]);

  return {
    activePage,
    setActivePage,
    pendingClassNode,
    clearPendingClassNode,
    pendingScrollImageStableId,
    pendingScrollClassStableId,
    clearPendingScrollTarget,
    handleAddClassToStudio,
    handleOpenInspectorForBinding,
    setPendingScrollImageStableId,
    setPendingScrollClassStableId,
  };
}