import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPendingClassNodeRequest, type ClassBinding, type ClassInfoCatalog, type StudioClassCatalogEntry } from '@/domain/studio/editor';
import type { PendingClassNodeRequest } from '@/domain/studio/editor';
import type { StableId } from '@/domain/contracts/shared-identity';
import type { AnalysisSnapshot, RuntimeClassOverlayDescriptor } from '@/domain/analysis/contracts';
import { useAnalysisInspectorCatalog } from '@/domain/analysis/hooks/useAnalysisInspectorCatalog';
import { useAnalysisInspectorSearch } from '@/domain/analysis/hooks/useAnalysisInspectorSearch';
import type {
  AnalysisClassInfo,
  AnalysisClassSummary,
  AnalysisImageInfo,
} from '@/domain/analysis/view-models';
import type { ActivePage, InspectorTab } from '@/domain/analysis/workspace-types';
import type { InspectorWorkspaceValue } from './InspectorWorkspaceValue';

interface UseInspectorWorkspaceValueOptions {
  attachError: string | null;
  analysisSnapshot: AnalysisSnapshot | null;
  images: AnalysisImageInfo[];
  loadingImages: boolean;
  classesByImage: Record<string, AnalysisClassSummary[]>;
  classDetailsByStableId: Record<string, AnalysisClassInfo>;
  runtimeOverlays: Record<string, RuntimeClassOverlayDescriptor>;
  runtimeFieldErrorByKey: Record<string, string | null>;
  loadingRuntimeByKey: Record<string, boolean>;
  ensureRuntimeOverlayLoaded: (classStableId: StableId) => void;
  setActivePage: (page: ActivePage) => void;
  queuePendingClassNode: (request: PendingClassNodeRequest) => void;
  workspaceResetRevision: string | number;
}

interface UseInspectorWorkspaceValueResult {
  value: InspectorWorkspaceValue;
  classInfoCatalogByStableId: Record<string, ClassInfoCatalog>;
  studioClassCatalogEntries: StudioClassCatalogEntry[];
  staticFieldAddressByClassAndMember: Record<string, Record<string, string | null>>;
  handleOpenInspectorForBinding: (binding: ClassBinding) => void;
}

export function useInspectorWorkspaceValue({
  attachError,
  analysisSnapshot,
  images,
  loadingImages,
  classesByImage,
  classDetailsByStableId,
  runtimeOverlays,
  runtimeFieldErrorByKey,
  loadingRuntimeByKey,
  ensureRuntimeOverlayLoaded,
  setActivePage,
  queuePendingClassNode,
  workspaceResetRevision,
}: UseInspectorWorkspaceValueOptions): UseInspectorWorkspaceValueResult {
  const [selectedImageStableId, setSelectedImageStableId] = useState<StableId | null>(null);
  const [tabs, setTabs] = useState<InspectorTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(-1);
  const [imageSearch, setImageSearch] = useState('');
  const [classSearch, setClassSearch] = useState('');
  const [pendingScrollImageStableId, setPendingScrollImageStableId] = useState<StableId | null>(null);
  const [pendingScrollClassStableId, setPendingScrollClassStableId] = useState<StableId | null>(null);

  const openTabForClass = useCallback((entry: InspectorTab) => {
    setTabs((previous) => {
      const existingIndex = previous.findIndex((tab) => tab.imageStableId === entry.imageStableId && tab.classStableId === entry.classStableId);
      if (existingIndex >= 0) {
        setActiveTabIndex(existingIndex);
        return previous;
      }

      setActiveTabIndex(previous.length);
      return [...previous, entry];
    });
  }, []);

  const handleCloseTab = useCallback((index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    setTabs((previous) => {
      const next = [...previous];
      next.splice(index, 1);
      if (next.length === 0) {
        setActiveTabIndex(-1);
      } else {
        setActiveTabIndex((current) => {
          if (current >= index) {
            return Math.max(0, current - 1);
          }

          return current;
        });
      }

      return next;
    });
  }, []);

  const {
    classLookupMap,
    studioClassCatalogEntries,
    classBindingByStableId,
    classInfoCatalogByStableId,
    staticFieldAddressByClassAndMember,
    filteredImages,
    selectedImage,
    currentClasses,
    filteredClasses,
    activeTab,
    selectedClass,
    displayStaticFields,
    displayFields,
    activeRuntimeFieldError,
    isLoadingRuntimeFields,
  } = useAnalysisInspectorCatalog({
    analysisSnapshot,
    images,
    classesByImage,
    classDetailsByStableId,
    runtimeOverlays,
    runtimeFieldErrorByKey,
    loadingRuntimeByKey,
    ensureRuntimeOverlayLoaded,
    selectedImageStableId,
    setSelectedImageStableId,
    imageSearch,
    classSearch,
    tabs,
    activeTabIndex,
  });

  const imagesByStableId = useMemo(() => new Map(images.map((image) => [image.stableId, image])), [images]);

  const clearPendingScrollTarget = useCallback(() => {
    setPendingScrollImageStableId(null);
    setPendingScrollClassStableId(null);
  }, []);

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
  }, [openTabForClass, setActivePage]);

  const {
    isGlobalSearchOpen,
    setGlobalSearchOpen,
    globalSearchMode,
    setGlobalSearchMode,
    globalSearchQuery,
    setGlobalSearchQuery,
    globalSearchResults,
    isGlobalSearching,
    handleGlobalSearchResultClick,
    isReferenceOpen,
    setReferenceOpen,
    referenceSearchMode,
    setReferenceSearchMode,
    referenceTargetInput,
    setReferenceTargetInput,
    referenceTargetError,
    referenceResults,
    isReferenceSearching,
    executeReferenceSearch,
    handleReferenceResultClick,
    setReferenceTargetFromClass,
    resetSearchState,
  } = useAnalysisInspectorSearch({
    classDetailsByStableId,
    classLookupMap,
    classBindingByStableId,
    imagesByStableId,
    activeTab,
    openTabForClass,
    setSelectedImageStableId,
    setPendingScrollImageStableId,
    setPendingScrollClassStableId,
  });

  const handleAddClassToStudio = useCallback((binding: ClassBinding) => {
    if (!classInfoCatalogByStableId[binding.classStableId]) {
      return;
    }

    queuePendingClassNode(createPendingClassNodeRequest(binding));
    setActivePage('studio');
    setReferenceOpen(false);
    setGlobalSearchOpen(false);
  }, [classInfoCatalogByStableId, queuePendingClassNode, setActivePage, setGlobalSearchOpen, setReferenceOpen]);

  const resetInspectorWorkspaceState = useCallback(() => {
    setSelectedImageStableId(null);
    setTabs([]);
    setActiveTabIndex(-1);
    setImageSearch('');
    setClassSearch('');
    clearPendingScrollTarget();
    resetSearchState();
  }, [clearPendingScrollTarget, resetSearchState]);

  useEffect(() => {
    resetInspectorWorkspaceState();
  }, [resetInspectorWorkspaceState, workspaceResetRevision]);

  const value = useMemo<InspectorWorkspaceValue>(() => ({
    attachError,
    images,
    classLookupMap,
    selectedImageStableId,
    setSelectedImageStableId,
    loadingImages,
    imageSearch,
    setImageSearch,
    classSearch,
    setClassSearch,
    filteredImages,
    selectedImage,
    currentClasses,
    filteredClasses,
    tabs,
    activeTabIndex,
    setActiveTabIndex,
    openTabForClass,
    handleCloseTab,
    activeTab,
    selectedClass,
    displayStaticFields,
    displayFields,
    activeRuntimeFieldError,
    isLoadingRuntimeFields,
    isGlobalSearchOpen,
    setGlobalSearchOpen,
    globalSearchMode,
    setGlobalSearchMode,
    globalSearchQuery,
    setGlobalSearchQuery,
    globalSearchResults,
    isGlobalSearching,
    handleGlobalSearchResultClick,
    isReferenceOpen,
    setReferenceOpen,
    referenceSearchMode,
    setReferenceSearchMode,
    referenceTargetInput,
    setReferenceTargetInput,
    referenceTargetError,
    referenceResults,
    isReferenceSearching,
    executeReferenceSearch,
    handleReferenceResultClick,
    setReferenceTargetFromClass,
    handleAddClassToStudio,
    pendingScrollImageStableId,
    pendingScrollClassStableId,
    clearPendingScrollTarget,
  }), [
    activeRuntimeFieldError,
    activeTab,
    activeTabIndex,
    attachError,
    classLookupMap,
    classSearch,
    clearPendingScrollTarget,
    currentClasses,
    displayFields,
    displayStaticFields,
    executeReferenceSearch,
    filteredClasses,
    filteredImages,
    globalSearchMode,
    globalSearchQuery,
    globalSearchResults,
    handleAddClassToStudio,
    handleCloseTab,
    handleGlobalSearchResultClick,
    handleReferenceResultClick,
    imageSearch,
    loadingImages,
    images,
    isGlobalSearchOpen,
    isGlobalSearching,
    isLoadingRuntimeFields,
    isReferenceOpen,
    isReferenceSearching,
    openTabForClass,
    pendingScrollClassStableId,
    pendingScrollImageStableId,
    referenceResults,
    referenceSearchMode,
    referenceTargetError,
    referenceTargetInput,
    selectedClass,
    selectedImage,
    selectedImageStableId,
    setGlobalSearchOpen,
    setReferenceOpen,
    setReferenceSearchMode,
    setReferenceTargetFromClass,
    tabs,
  ]);

  return {
    value,
    classInfoCatalogByStableId,
    studioClassCatalogEntries,
    staticFieldAddressByClassAndMember,
    handleOpenInspectorForBinding,
  };
}