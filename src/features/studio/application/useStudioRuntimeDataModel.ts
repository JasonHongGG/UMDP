import { useMemo } from 'react';
import { useAnalysisWorkspace } from '@/domain/analysis/AnalysisWorkspaceContext';
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