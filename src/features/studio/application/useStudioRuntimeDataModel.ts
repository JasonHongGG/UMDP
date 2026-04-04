import { useMemo } from 'react';
import { useAnalysisWorkspace } from '@/app/state/useAnalysisWorkspace';
import { createStudioRuntimeDataState } from '@/features/studio/core/runtimeData';

export function useStudioRuntimeDataModel() {
  const {
    studioClassCatalogEntries,
    classInfoCatalogByStableId,
    staticFieldAddressByClassAndMember,
    runtimeMemberValuesByClassAndAddress,
    ensureRuntimeOverlayLoaded,
    ensureRuntimeInstanceFieldsLoaded,
  } = useAnalysisWorkspace();

  return useMemo(() => createStudioRuntimeDataState({
    classes: studioClassCatalogEntries,
    classInfoCatalogByStableId,
    staticFieldAddressByClassAndMember,
    runtimeMemberValuesByClassAndAddress,
    ensureRuntimeOverlayLoaded,
    ensureRuntimeInstanceFieldsLoaded,
  }), [
    classInfoCatalogByStableId,
    ensureRuntimeInstanceFieldsLoaded,
    ensureRuntimeOverlayLoaded,
    runtimeMemberValuesByClassAndAddress,
    staticFieldAddressByClassAndMember,
    studioClassCatalogEntries,
  ]);
}