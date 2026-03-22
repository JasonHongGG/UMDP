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
  buildStudioClassCatalog,
  createClassInfoCatalogFromClassDescriptor,
  type ClassBinding,
  type ClassInfoCatalog,
  type PendingClassNodeRequest,
  type StudioClassCatalogEntry,
} from '../studio/editor';
import type { StableId } from '../contracts/shared-identity';
import { formatHexAddress } from '../../core/addressFormat';
import type { ResolvedMemberRuntimeValue } from '../../core/studio/contracts';
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

export interface InspectorTab {
  imageStableId: StableId;
  classStableId: StableId;
  name: string;
  namespace: string;
  imageName: string;
}

type ReferenceMode = 'Inheritance' | 'Member' | 'Function';
type GlobalSearchMode = 'Class' | 'Field' | 'StaticField' | 'Method';
type ActivePage = 'inspector' | 'studio';

interface ClassLookupEntry {
  imageStableId: StableId;
  classStableId: StableId;
  legacyImageId: string;
  legacyClassId: string;
  name: string;
  namespace: string;
  imageName: string;
}

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

  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [globalSearchMode, setGlobalSearchMode] = useState<GlobalSearchMode>('Class');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<GlobalSearchResult[]>([]);
  const [isGlobalSearching, setIsGlobalSearching] = useState(false);

  const [isReferenceOpen, setIsReferenceOpen] = useState(false);
  const [referenceSearchMode, setReferenceSearchMode] = useState<ReferenceMode>('Inheritance');
  const [referenceTargetInput, setReferenceTargetInput] = useState('');
  const [referenceTargetError, setReferenceTargetError] = useState<string | null>(null);
  const [referenceResults, setReferenceResults] = useState<ClassReferenceResult[]>([]);
  const [isReferenceSearching, setIsReferenceSearching] = useState(false);
  const resetNavigationStateRef = useRef<() => void>(() => undefined);

  const repository = useAnalysisRepository();

  const resetWorkspace = useCallback(() => {
    setSelectedImageStableId(null);
    setTabs([]);
    setActiveTabIndex(-1);
    resetNavigationStateRef.current();
    setGlobalSearchQuery('');
    setGlobalSearchResults([]);
    setReferenceTargetInput('');
    setReferenceResults([]);
    setReferenceTargetError(null);
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
  } = useAnalysisRuntimeState({ repository, processSession, analysisSnapshot });

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
            legacyImageId: descriptor.legacyImageId,
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

  const classLookupMap = useMemo(() => {
    const lookup = new Map<string, ClassLookupEntry>();
    for (const summaries of Object.values(classesByImage)) {
      for (const classSummary of summaries) {
        lookup.set(classSummary.fullName, {
          imageStableId: classSummary.imageStableId,
          classStableId: classSummary.stableId,
          legacyImageId: classSummary.legacyImageId,
          legacyClassId: classSummary.legacyClassId,
          name: classSummary.name,
          namespace: classSummary.namespace,
          imageName: classSummary.imageName,
        });
      }
    }
    return lookup;
  }, [classesByImage]);

  const studioClassCatalogEntries = useMemo(() => buildStudioClassCatalog(images, classesByImage), [classesByImage, images]);

  const classBindingByStableId = useMemo(() => {
    return new Map(studioClassCatalogEntries.map((entry) => [entry.classStableId, entry as ClassBinding]));
  }, [studioClassCatalogEntries]);

  const classInfoCatalogByStableId = useMemo(() => {
    if (!analysisSnapshot) {
      return {} as Record<string, ClassInfoCatalog>;
    }

    return Object.fromEntries(
      Object.values(analysisSnapshot.classes).map((descriptor) => [
        descriptor.stableId,
        createClassInfoCatalogFromClassDescriptor(descriptor, runtimeOverlays[descriptor.stableId]),
      ]),
    );
  }, [analysisSnapshot, runtimeOverlays]);

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

  const staticFieldAddressByClassAndMember = useMemo(() => {
    if (!analysisSnapshot) {
      return {} as Record<string, Record<string, string | null>>;
    }

    return Object.fromEntries(
      Object.values(analysisSnapshot.classes).map((descriptor) => {
        const staticFields = runtimeOverlays[descriptor.stableId]?.staticFields ?? descriptor.staticFields;
        return [
          descriptor.stableId,
          Object.fromEntries(staticFields.map((field) => [field.stableId, formatHexAddress(field.address)])),
        ];
      }),
    );
  }, [analysisSnapshot, runtimeOverlays]);

  const filteredImages = useMemo(() => {
    if (!images.length) {
      return [];
    }
    const keyword = imageSearch.trim().toLowerCase();
    return images.filter((image) => image.name.toLowerCase().includes(keyword) || image.path.toLowerCase().includes(keyword));
  }, [imageSearch, images]);

  const selectedImage = useMemo(() => {
    return filteredImages.find((image) => image.stableId === selectedImageStableId)
      ?? images.find((image) => image.stableId === selectedImageStableId)
      ?? null;
  }, [filteredImages, images, selectedImageStableId]);

  const currentClasses = useMemo(() => {
    if (!selectedImageStableId) {
      return [];
    }
    return classesByImage[selectedImageStableId] ?? [];
  }, [classesByImage, selectedImageStableId]);

  const filteredClasses = useMemo(() => {
    if (!currentClasses.length) {
      return [];
    }
    const keyword = classSearch.trim().toLowerCase();
    return currentClasses.filter((item) => item.fullName.toLowerCase().includes(keyword));
  }, [classSearch, currentClasses]);

  const activeTab = activeTabIndex >= 0 && activeTabIndex < tabs.length ? tabs[activeTabIndex] : null;

  const selectedClass = useMemo<AnalysisClassInfo | null>(() => {
    if (!activeTab) {
      return null;
    }
    return classDetailsByStableId[activeTab.classStableId] ?? null;
  }, [activeTab, classDetailsByStableId]);

  useEffect(() => {
    if (!selectedImage && selectedImageStableId !== null) {
      setSelectedImageStableId(null);
    }
  }, [selectedImage, selectedImageStableId]);

  useEffect(() => {
    if (selectedImageStableId && !images.some((image) => image.stableId === selectedImageStableId)) {
      setSelectedImageStableId(null);
    }
  }, [images, selectedImageStableId]);

  useEffect(() => {
    if (!activeTab) {
      return;
    }

    ensureRuntimeOverlayLoaded(activeTab.classStableId);
  }, [activeTab, ensureRuntimeOverlayLoaded]);

  const activeCacheKey = activeTab ? activeTab.classStableId : '';
  const studioClassDetailsByStableId = useMemo(() => {
    if (!analysisSnapshot) {
      return {} as Record<string, AnalysisClassInfo>;
    }

    return Object.fromEntries(
      Object.values(analysisSnapshot.classes).map((descriptor) => [
        descriptor.stableId,
        createAnalysisClassInfo(descriptor, runtimeOverlays[descriptor.stableId]),
      ]),
    );
  }, [analysisSnapshot, runtimeOverlays]);

  const displayStaticFields = activeTab ? (studioClassDetailsByStableId[activeCacheKey]?.staticFields ?? []) : [];
  const displayFields = activeTab ? (studioClassDetailsByStableId[activeCacheKey]?.fields ?? []) : [];
  const activeRuntimeFieldError = runtimeFieldErrorByKey[activeCacheKey] ?? null;
  const isLoadingRuntimeFields = loadingRuntimeByKey[activeCacheKey] ?? false;

  useEffect(() => {
    if (!globalSearchQuery || globalSearchQuery.length < 2) {
      setGlobalSearchResults([]);
      return;
    }

    const timer = window.setTimeout(() => {
      setIsGlobalSearching(true);
      const query = globalSearchQuery.toLowerCase();
      let results: GlobalSearchResult[] = [];

      for (const [classStableId, classInfo] of Object.entries(classDetailsByStableId)) {
        if (results.length > 100000) {
          break;
        }

        const binding = classBindingByStableId.get(classStableId as StableId);
        const image = binding ? imagesByStableId.get(binding.imageStableId) : null;
        if (!image) {
          continue;
        }

        if (globalSearchMode === 'Class') {
          if (classInfo.name.toLowerCase().includes(query) || classInfo.namespace.toLowerCase().includes(query)) {
            results.push({
              imageStableId: image.stableId,
              classStableId: classStableId as StableId,
              imageName: image.name,
              className: classInfo.name,
              matchType: 'Class',
              matchText: classInfo.fullName,
              isInherited: false,
            });
          }
          continue;
        }

        const seenMembers = new Set<string>();
        for (let index = 0; index < classInfo.inheritance.length; index += 1) {
          const baseName = classInfo.inheritance[index].name;
          const lookup = classLookupMap.get(baseName);
          const targetClass = lookup ? classDetailsByStableId[lookup.classStableId] : null;
          const actualClassInfo = index === 0 ? classInfo : targetClass;
          if (!actualClassInfo) {
            continue;
          }

          const members = globalSearchMode === 'Field'
            ? actualClassInfo.fields
            : globalSearchMode === 'StaticField'
              ? actualClassInfo.staticFields
              : actualClassInfo.methods;

          for (const item of members) {
            if (seenMembers.has(item.name)) {
              continue;
            }
            seenMembers.add(item.name);
            if (item.name.toLowerCase().includes(query)) {
              results.push({
                imageStableId: image.stableId,
                classStableId: classStableId as StableId,
                imageName: image.name,
                className: classInfo.name,
                matchType: globalSearchMode,
                matchText: item.name,
                isInherited: index > 0,
              });
            }
          }
        }
      }

      results.sort((left, right) => {
        const leftActive = left.classStableId === activeTab?.classStableId;
        const rightActive = right.classStableId === activeTab?.classStableId;
        if (leftActive && !rightActive) {
          return -1;
        }
        if (!leftActive && rightActive) {
          return 1;
        }
        if (!left.isInherited && right.isInherited) {
          return -1;
        }
        if (left.isInherited && !right.isInherited) {
          return 1;
        }
        const textCompare = left.matchText.localeCompare(right.matchText);
        if (textCompare !== 0) {
          return textCompare;
        }
        const classCompare = left.className.localeCompare(right.className);
        if (classCompare !== 0) {
          return classCompare;
        }
        return left.imageName.localeCompare(right.imageName);
      });

      if (results.length > 2000) {
        results = results.slice(0, 2000);
      }

      setGlobalSearchResults(results);
      setIsGlobalSearching(false);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [activeTab, classBindingByStableId, classDetailsByStableId, classLookupMap, globalSearchMode, globalSearchQuery, imagesByStableId]);

  const handleGlobalSearchResultClick = useCallback((result: GlobalSearchResult) => {
    setSelectedImageStableId(result.imageStableId);
    const item = classBindingByStableId.get(result.classStableId);
    if (item) {
      openTabForClass({
        imageStableId: item.imageStableId,
        classStableId: item.classStableId,
        name: item.name,
        namespace: item.namespace,
        imageName: item.imageName,
      });
    }
    setPendingScrollImageStableId(result.imageStableId);
    setPendingScrollClassStableId(result.classStableId);
  }, [classBindingByStableId, openTabForClass]);

  const executeReferenceSearch = useCallback(() => {
    const query = referenceTargetInput.trim();
    if (!query) {
      setReferenceTargetError('Please enter a class name.');
      return;
    }

    if (!classLookupMap.has(query)) {
      setReferenceTargetError(`Class "${query}" not found. Use full name (namespace + name).`);
      setReferenceResults([]);
      return;
    }

    setReferenceTargetError(null);
    setIsReferenceSearching(true);
    const found: ClassReferenceResult[] = [];

    for (const [classStableId, classInfo] of Object.entries(classDetailsByStableId)) {
      const binding = classBindingByStableId.get(classStableId as StableId);
      const image = binding ? imagesByStableId.get(binding.imageStableId) : null;
      if (!image || classInfo.fullName === query) {
        continue;
      }

      if (referenceSearchMode === 'Inheritance') {
        for (const node of classInfo.inheritance) {
          if (node.name === query) {
            found.push({
              imageStableId: image.stableId,
              classStableId: classStableId as StableId,
              imageName: image.name,
              className: classInfo.fullName,
              matchType: 'Inheritance',
              matchDetail: `inherits ${query}`,
            });
            break;
          }
        }
        continue;
      }

      if (referenceSearchMode === 'Member') {
        for (const field of classInfo.fields) {
          if (field.fieldType === query) {
            found.push({
              imageStableId: image.stableId,
              classStableId: classStableId as StableId,
              imageName: image.name,
              className: classInfo.fullName,
              matchType: 'Member',
              matchDetail: field.name,
            });
            break;
          }
        }

        if (!found.some((item) => item.classStableId === classStableId)) {
          for (const field of classInfo.staticFields) {
            if (field.fieldType === query) {
              found.push({
                imageStableId: image.stableId,
                classStableId: classStableId as StableId,
                imageName: image.name,
                className: classInfo.fullName,
                matchType: 'Member',
                matchDetail: field.name,
              });
              break;
            }
          }
        }
        continue;
      }

      for (const method of classInfo.methods) {
        if (method.signature.includes(query)) {
          found.push({
            imageStableId: image.stableId,
            classStableId: classStableId as StableId,
            imageName: image.name,
            className: classInfo.fullName,
            matchType: 'Function',
            matchDetail: method.name,
          });
          break;
        }
      }
    }

    found.sort((left, right) => left.className.localeCompare(right.className));
    setReferenceResults(found);
    setIsReferenceSearching(false);
  }, [classBindingByStableId, classDetailsByStableId, classLookupMap, imagesByStableId, referenceSearchMode, referenceTargetInput]);

  const handleReferenceResultClick = useCallback((result: ClassReferenceResult) => {
    setSelectedImageStableId(result.imageStableId);
    const item = classBindingByStableId.get(result.classStableId);
    if (item) {
      openTabForClass({
        imageStableId: item.imageStableId,
        classStableId: item.classStableId,
        name: item.name,
        namespace: item.namespace,
        imageName: item.imageName,
      });
    }
    setPendingScrollImageStableId(result.imageStableId);
    setPendingScrollClassStableId(result.classStableId);
  }, [classBindingByStableId, openTabForClass]);

  const setReferenceTargetFromClass = useCallback((fullName: string) => {
    setReferenceTargetInput(fullName);
    setReferenceTargetError(null);
    setReferenceResults([]);
    setIsReferenceOpen(true);
    setIsGlobalSearchOpen(false);
  }, []);

  const handleAddClassToStudioAndClosePanels = useCallback((binding: ClassBinding) => {
    handleAddClassToStudio(binding);
    setIsReferenceOpen(false);
    setIsGlobalSearchOpen(false);
  }, [handleAddClassToStudio]);

  const handleOpenInspectorForBindingAndClosePanels = useCallback((binding: ClassBinding) => {
    handleOpenInspectorForBinding(binding);
    setIsReferenceOpen(false);
    setIsGlobalSearchOpen(false);
  }, [handleOpenInspectorForBinding]);

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

  const setGlobalSearchOpen = useCallback((open: boolean) => {
    setIsGlobalSearchOpen(open);
    if (open) {
      setIsReferenceOpen(false);
    }
  }, []);

  const setReferenceOpen = useCallback((open: boolean) => {
    setIsReferenceOpen(open);
    if (open) {
      setIsGlobalSearchOpen(false);
    }
  }, []);

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