import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createStudioRuntimeDataState, type StudioRuntimeDataState } from '../../core/studio/runtimeData';
import type {
  AnalysisSnapshot,
  ProcessSession,
  RuntimeClassOverlayDescriptor,
} from './contracts';
import type { WorkspaceLifecycleState } from '../../shared/contracts';
import type { SystemContractVersions } from '../../shared/contracts';
import {
  type ClassBinding,
  type ClassInfoCatalog,
  type PendingClassNodeRequest,
  type StudioClassCatalogEntry,
} from '../studio/editor';
import type { StableId } from '../contracts/shared-identity';
import type { ResolvedMemberRuntimeValue } from '../../core/studio/contracts';
import { useAnalysisInspectorCatalog } from './hooks/useAnalysisInspectorCatalog';
import { useAnalysisInspectorSearch } from './hooks/useAnalysisInspectorSearch';
import { useAnalysisRepository } from './hooks/useAnalysisRepository';
import { useAnalysisWorkspaceNavigation } from './hooks/useAnalysisWorkspaceNavigation';
import { useAnalysisRuntimeState } from './hooks/useAnalysisRuntimeState';
import { useAnalysisSessionState } from './hooks/useAnalysisSessionState';
import type {
  AnalysisClassInfo,
  AnalysisClassSummary,
  AnalysisFieldInfo,
  AnalysisImageInfo,
  AnalysisStaticFieldInfo,
  ClassReferenceResult,
  GlobalSearchResult,
} from './view-models';
import { createAnalysisClassInfo, createAnalysisClassSummary } from './view-models';
import type { ActivePage, ClassLookupEntry, GlobalSearchMode, InspectorTab, ReferenceMode } from './workspace-types';

interface AnalysisWorkspaceContextValue {
  processSession: ProcessSession | null;
  attachError: string | null;
  analysisSnapshot: AnalysisSnapshot | null;
  workspaceLifecycle: WorkspaceLifecycleState;
  contractVersions: SystemContractVersions | null;
  runtimeOverlays: Record<string, RuntimeClassOverlayDescriptor>;
  images: AnalysisImageInfo[];
  classesByImage: Record<string, AnalysisClassSummary[]>;
  classDetailsByStableId: Record<string, AnalysisClassInfo>;
  staticFieldAddressByClassAndMember: Record<string, Record<string, string | null>>;
  studioClassCatalogEntries: StudioClassCatalogEntry[];
  classInfoCatalogByStableId: Record<string, ClassInfoCatalog>;
  studioRuntimeData: StudioRuntimeDataState;
  ensureRuntimeOverlayLoaded: (classStableId: StableId) => void;
  classLookupMap: Map<string, ClassLookupEntry>;
  selectedImageStableId: StableId | null;
  setSelectedImageStableId: (id: StableId | null) => void;
  loadingImages: boolean;
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;
  pendingClassNode: PendingClassNodeRequest | null;
  clearPendingClassNode: () => void;
  imageSearch: string;
  setImageSearch: (value: string) => void;
  classSearch: string;
  setClassSearch: (value: string) => void;
  filteredImages: AnalysisImageInfo[];
  selectedImage: AnalysisImageInfo | null;
  currentClasses: AnalysisClassSummary[];
  filteredClasses: AnalysisClassSummary[];
  tabs: InspectorTab[];
  activeTabIndex: number;
  setActiveTabIndex: (index: number) => void;
  openTabForClass: (entry: InspectorTab) => void;
  handleCloseTab: (index: number, e: React.MouseEvent) => void;
  activeTab: InspectorTab | null;
  selectedClass: AnalysisClassInfo | null;
  displayStaticFields: AnalysisStaticFieldInfo[];
  displayFields: AnalysisFieldInfo[];
  activeRuntimeFieldError: string | null;
  isLoadingRuntimeFields: boolean;
  isGlobalSearchOpen: boolean;
  setGlobalSearchOpen: (open: boolean) => void;
  globalSearchMode: GlobalSearchMode;
  setGlobalSearchMode: (mode: GlobalSearchMode) => void;
  globalSearchQuery: string;
  setGlobalSearchQuery: (query: string) => void;
  globalSearchResults: GlobalSearchResult[];
  isGlobalSearching: boolean;
  handleGlobalSearchResultClick: (result: GlobalSearchResult) => void;
  isReferenceOpen: boolean;
  setReferenceOpen: (open: boolean) => void;
  referenceSearchMode: ReferenceMode;
  setReferenceSearchMode: (mode: ReferenceMode) => void;
  referenceTargetInput: string;
  setReferenceTargetInput: (value: string) => void;
  referenceTargetError: string | null;
  referenceResults: ClassReferenceResult[];
  isReferenceSearching: boolean;
  executeReferenceSearch: () => void;
  handleReferenceResultClick: (result: ClassReferenceResult) => void;
  setReferenceTargetFromClass: (fullName: string) => void;
  handleAddClassToStudio: (binding: ClassBinding) => void;
  handleOpenInspectorForBinding: (binding: ClassBinding) => void;
  pendingScrollImageStableId: StableId | null;
  pendingScrollClassStableId: StableId | null;
  clearPendingScrollTarget: () => void;
}

type WorkspaceShellContextValue = Pick<AnalysisWorkspaceContextValue,
  'processSession'
  | 'contractVersions'
  | 'workspaceLifecycle'
  | 'activePage'
  | 'setActivePage'
>;

type StudioWorkspaceContextValue = Pick<AnalysisWorkspaceContextValue,
  'studioRuntimeData'
  | 'pendingClassNode'
  | 'clearPendingClassNode'
  | 'workspaceLifecycle'
>;

type InspectorWorkspaceContextValue = Pick<AnalysisWorkspaceContextValue,
  'attachError'
  | 'images'
  | 'classLookupMap'
  | 'selectedImageStableId'
  | 'setSelectedImageStableId'
  | 'loadingImages'
  | 'imageSearch'
  | 'setImageSearch'
  | 'classSearch'
  | 'setClassSearch'
  | 'filteredImages'
  | 'selectedImage'
  | 'currentClasses'
  | 'filteredClasses'
  | 'tabs'
  | 'activeTabIndex'
  | 'setActiveTabIndex'
  | 'openTabForClass'
  | 'handleCloseTab'
  | 'activeTab'
  | 'selectedClass'
  | 'displayStaticFields'
  | 'displayFields'
  | 'activeRuntimeFieldError'
  | 'isLoadingRuntimeFields'
  | 'isGlobalSearchOpen'
  | 'setGlobalSearchOpen'
  | 'globalSearchMode'
  | 'setGlobalSearchMode'
  | 'globalSearchQuery'
  | 'setGlobalSearchQuery'
  | 'globalSearchResults'
  | 'isGlobalSearching'
  | 'handleGlobalSearchResultClick'
  | 'isReferenceOpen'
  | 'setReferenceOpen'
  | 'referenceSearchMode'
  | 'setReferenceSearchMode'
  | 'referenceTargetInput'
  | 'setReferenceTargetInput'
  | 'referenceTargetError'
  | 'referenceResults'
  | 'isReferenceSearching'
  | 'executeReferenceSearch'
  | 'handleReferenceResultClick'
  | 'setReferenceTargetFromClass'
  | 'handleAddClassToStudio'
  | 'pendingScrollImageStableId'
  | 'pendingScrollClassStableId'
  | 'clearPendingScrollTarget'
>;

const AnalysisWorkspaceContext = createContext<AnalysisWorkspaceContextValue | null>(null);
const WorkspaceShellContext = createContext<WorkspaceShellContextValue | null>(null);
const StudioWorkspaceContext = createContext<StudioWorkspaceContextValue | null>(null);
const InspectorWorkspaceContext = createContext<InspectorWorkspaceContextValue | null>(null);

export function AnalysisWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [selectedImageStableId, setSelectedImageStableId] = useState<StableId | null>(null);
  const [contractVersions, setContractVersions] = useState<SystemContractVersions | null>(null);

  const [tabs, setTabs] = useState<InspectorTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(-1);

  const [imageSearch, setImageSearch] = useState('');
  const [classSearch, setClassSearch] = useState('');

  const resetNavigationStateRef = useRef<() => void>(() => undefined);
  const resetSearchStateRef = useRef<() => void>(() => undefined);

  const repository = useAnalysisRepository();

  const resetWorkspace = useCallback(() => {
    setSelectedImageStableId(null);
    setTabs([]);
    setActiveTabIndex(-1);
    resetNavigationStateRef.current();
    resetSearchStateRef.current();
  }, []);

  const {
    processSession,
    attachError,
    analysisSnapshot,
    loadingImages,
    workspaceLifecycle,
  } = useAnalysisSessionState({ repository, onResetWorkspace: resetWorkspace });

  useEffect(() => {
    repository
      .getContractVersions()
      .then((versions) => setContractVersions(versions))
      .catch((error) => console.error('Failed to load contract versions', error));
  }, [repository]);

  const {
    runtimeOverlays,
    runtimeFieldErrorByKey,
    loadingRuntimeByKey,
    runtimeInstanceFieldErrorByKey,
    loadingRuntimeInstanceByKey,
    runtimeMemberValuesByClassAndAddress,
    ensureRuntimeOverlayLoaded,
    ensureRuntimeInstanceFieldsLoaded,
  } = useAnalysisRuntimeState({ repository, processSession, analysisSnapshot, workspaceLifecycle });

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

  const handleCloseTab = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const images = useMemo(() => {
    return analysisSnapshot?.images ?? [];
  }, [analysisSnapshot]);

  const imagesByStableId = useMemo(() => {
    return new Map(images.map((image) => [image.stableId, image]));
  }, [images]);

  const classesByImage = useMemo(() => {
    if (!analysisSnapshot) {
      return {} as Record<string, AnalysisClassSummary[]>;
    }

    return Object.fromEntries(
      Object.entries(analysisSnapshot.imageClassIndex).map(([imageStableId, classStableIds]) => {
        const image = imagesByStableId.get(imageStableId as StableId);
        const summaries = classStableIds
          .map((classStableId) => analysisSnapshot.classes[classStableId])
          .filter((descriptor): descriptor is NonNullable<typeof descriptor> => Boolean(descriptor))
          .map((descriptor) => createAnalysisClassSummary(image ?? {
            stableId: descriptor.imageStableId,
            name: '',
            path: '',
          }, descriptor));

        return [imageStableId, summaries];
      }),
    );
  }, [analysisSnapshot, imagesByStableId]);

  const classDetailsByStableId = useMemo(() => {
    if (!analysisSnapshot) {
      return {} as Record<string, AnalysisClassInfo>;
    }

    return Object.fromEntries(
      Object.values(analysisSnapshot.classes).map((descriptor) => [descriptor.stableId, createAnalysisClassInfo(descriptor)]),
    );
  }, [analysisSnapshot]);

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

  const {
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
  } = useAnalysisWorkspaceNavigation({
    classInfoCatalogByStableId,
    setSelectedImageStableId,
    openTabForClass,
  });

  resetNavigationStateRef.current = () => {
    clearPendingClassNode();
    clearPendingScrollTarget();
  };
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

  resetSearchStateRef.current = resetSearchState;

  const handleAddClassToStudioAndClosePanels = useCallback((binding: ClassBinding) => {
    handleAddClassToStudio(binding);
    setReferenceOpen(false);
    setGlobalSearchOpen(false);
  }, [handleAddClassToStudio, setGlobalSearchOpen, setReferenceOpen]);

  const handleOpenInspectorForBindingAndClosePanels = useCallback((binding: ClassBinding) => {
    handleOpenInspectorForBinding(binding);
    setReferenceOpen(false);
    setGlobalSearchOpen(false);
  }, [handleOpenInspectorForBinding, setGlobalSearchOpen, setReferenceOpen]);

  const studioRuntimeData = useMemo(() => createStudioRuntimeDataState({
    classes: studioClassCatalogEntries,
    classInfoCatalogByStableId,
    staticFieldAddressByClassAndMember,
    runtimeMemberValuesByClassAndAddress,
    ensureRuntimeOverlayLoaded,
    ensureRuntimeInstanceFieldsLoaded,
    openInspectorForBinding: handleOpenInspectorForBindingAndClosePanels,
  }), [
    classInfoCatalogByStableId,
    ensureRuntimeInstanceFieldsLoaded,
    ensureRuntimeOverlayLoaded,
    handleOpenInspectorForBindingAndClosePanels,
    runtimeMemberValuesByClassAndAddress,
    staticFieldAddressByClassAndMember,
    studioClassCatalogEntries,
  ]);

  const workspaceShellValue = useMemo<WorkspaceShellContextValue>(() => ({
    processSession,
    contractVersions,
    workspaceLifecycle,
    activePage,
    setActivePage,
  }), [activePage, contractVersions, processSession, workspaceLifecycle]);

  const studioWorkspaceValue = useMemo<StudioWorkspaceContextValue>(() => ({
    studioRuntimeData,
    pendingClassNode,
    clearPendingClassNode,
    workspaceLifecycle,
  }), [clearPendingClassNode, pendingClassNode, studioRuntimeData, workspaceLifecycle]);

  const inspectorWorkspaceValue = useMemo<InspectorWorkspaceContextValue>(() => ({
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
    handleAddClassToStudio: handleAddClassToStudioAndClosePanels,
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
    currentClasses,
    displayFields,
    displayStaticFields,
    executeReferenceSearch,
    filteredClasses,
    filteredImages,
    globalSearchMode,
    globalSearchQuery,
    globalSearchResults,
    clearPendingScrollTarget,
    handleAddClassToStudioAndClosePanels,
    handleCloseTab,
    handleGlobalSearchResultClick,
    handleReferenceResultClick,
    imageSearch,
    images,
    isGlobalSearchOpen,
    isGlobalSearching,
    isLoadingRuntimeFields,
    isReferenceOpen,
    isReferenceSearching,
    loadingImages,
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

  const value = useMemo<AnalysisWorkspaceContextValue>(() => ({
    processSession,
    attachError,
    analysisSnapshot,
    workspaceLifecycle,
    contractVersions,
    runtimeOverlays,
    images,
    classesByImage,
    classDetailsByStableId,
    staticFieldAddressByClassAndMember,
    studioClassCatalogEntries,
    classInfoCatalogByStableId,
    studioRuntimeData,
    ensureRuntimeOverlayLoaded,
    classLookupMap,
    selectedImageStableId,
    setSelectedImageStableId,
    loadingImages,
    activePage,
    setActivePage,
    pendingClassNode,
    clearPendingClassNode,
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
    handleAddClassToStudio: handleAddClassToStudioAndClosePanels,
    handleOpenInspectorForBinding: handleOpenInspectorForBindingAndClosePanels,
    pendingScrollImageStableId,
    pendingScrollClassStableId,
    clearPendingScrollTarget,
  }), [
    activePage,
    activeRuntimeFieldError,
    activeTab,
    activeTabIndex,
    analysisSnapshot,
    attachError,
    classDetailsByStableId,
    classInfoCatalogByStableId,
    classLookupMap,
    classSearch,
    classesByImage,
    contractVersions,
    currentClasses,
    displayFields,
    displayStaticFields,
    clearPendingClassNode,
    clearPendingScrollTarget,
    executeReferenceSearch,
    filteredClasses,
    filteredImages,
    globalSearchMode,
    globalSearchQuery,
    globalSearchResults,
    handleAddClassToStudioAndClosePanels,
    handleCloseTab,
    handleGlobalSearchResultClick,
    handleOpenInspectorForBindingAndClosePanels,
    handleReferenceResultClick,
    imageSearch,
    images,
    isGlobalSearchOpen,
    isGlobalSearching,
    isLoadingRuntimeFields,
    isReferenceOpen,
    isReferenceSearching,
    loadingImages,
    loadingRuntimeByKey,
    openTabForClass,
    pendingClassNode,
    pendingScrollClassStableId,
    pendingScrollImageStableId,
    processSession,
    referenceResults,
    referenceSearchMode,
    referenceTargetError,
    referenceTargetInput,
    runtimeOverlays,
    staticFieldAddressByClassAndMember,
    studioRuntimeData,
    selectedClass,
    selectedImage,
    selectedImageStableId,
    setGlobalSearchOpen,
    setReferenceOpen,
    setReferenceSearchMode,
    setReferenceTargetFromClass,
    studioClassCatalogEntries,
    workspaceLifecycle,
    tabs,
  ]);

  return (
    <WorkspaceShellContext.Provider value={workspaceShellValue}>
      <StudioWorkspaceContext.Provider value={studioWorkspaceValue}>
        <InspectorWorkspaceContext.Provider value={inspectorWorkspaceValue}>
          <AnalysisWorkspaceContext.Provider value={value}>
            {children}
          </AnalysisWorkspaceContext.Provider>
        </InspectorWorkspaceContext.Provider>
      </StudioWorkspaceContext.Provider>
    </WorkspaceShellContext.Provider>
  );
}

export function useWorkspaceShellState() {
  const context = useContext(WorkspaceShellContext);
  if (!context) {
    throw new Error('useWorkspaceShellState must be used within an AnalysisWorkspaceProvider');
  }
  return context;
}

export function useStudioWorkspace() {
  const context = useContext(StudioWorkspaceContext);
  if (!context) {
    throw new Error('useStudioWorkspace must be used within an AnalysisWorkspaceProvider');
  }
  return context;
}

export function useInspectorWorkspace() {
  const context = useContext(InspectorWorkspaceContext);
  if (!context) {
    throw new Error('useInspectorWorkspace must be used within an AnalysisWorkspaceProvider');
  }
  return context;
}

export function useAnalysisWorkspace() {
  const context = useContext(AnalysisWorkspaceContext);
  if (!context) {
    throw new Error('useAnalysisWorkspace must be used within an AnalysisWorkspaceProvider');
  }
  return context;
}