import { useCallback, useEffect, useState } from 'react';
import type { ClassBinding } from '@/domain/studio/editor';
import type { StableId } from '../../contracts/shared-identity';
import type {
  AnalysisClassInfo,
  AnalysisImageInfo,
  ClassReferenceResult,
  GlobalSearchResult,
} from '../view-models';
import type { ClassLookupEntry, GlobalSearchMode, InspectorTab, ReferenceMode } from '../workspace-types';

interface UseAnalysisInspectorSearchParams {
  classDetailsByStableId: Record<string, AnalysisClassInfo>;
  classLookupMap: Map<string, ClassLookupEntry>;
  classBindingByStableId: Map<string, ClassBinding>;
  imagesByStableId: Map<StableId, AnalysisImageInfo>;
  activeTab: InspectorTab | null;
  openTabForClass: (entry: InspectorTab) => void;
  setSelectedImageStableId: (id: StableId | null) => void;
  setPendingScrollImageStableId: (id: StableId | null) => void;
  setPendingScrollClassStableId: (id: StableId | null) => void;
}

interface UseAnalysisInspectorSearchResult {
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
  resetSearchState: () => void;
}

function openInspectorTarget(
  result: Pick<GlobalSearchResult, 'imageStableId' | 'classStableId'>,
  classBindingByStableId: Map<string, ClassBinding>,
  openTabForClass: (entry: InspectorTab) => void,
  setSelectedImageStableId: (id: StableId | null) => void,
  setPendingScrollImageStableId: (id: StableId | null) => void,
  setPendingScrollClassStableId: (id: StableId | null) => void,
) {
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
}

export function useAnalysisInspectorSearch({
  classDetailsByStableId,
  classLookupMap,
  classBindingByStableId,
  imagesByStableId,
  activeTab,
  openTabForClass,
  setSelectedImageStableId,
  setPendingScrollImageStableId,
  setPendingScrollClassStableId,
}: UseAnalysisInspectorSearchParams): UseAnalysisInspectorSearchResult {
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

  const resetSearchState = useCallback(() => {
    setGlobalSearchQuery('');
    setGlobalSearchResults([]);
    setIsGlobalSearching(false);
    setReferenceTargetInput('');
    setReferenceResults([]);
    setReferenceTargetError(null);
    setIsReferenceSearching(false);
  }, []);

  useEffect(() => {
    if (!globalSearchQuery || globalSearchQuery.length < 2) {
      setGlobalSearchResults([]);
      setIsGlobalSearching(false);
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
    openInspectorTarget(
      result,
      classBindingByStableId,
      openTabForClass,
      setSelectedImageStableId,
      setPendingScrollImageStableId,
      setPendingScrollClassStableId,
    );
  }, [classBindingByStableId, openTabForClass, setPendingScrollClassStableId, setPendingScrollImageStableId, setSelectedImageStableId]);

  const executeReferenceSearch = useCallback(() => {
    const query = referenceTargetInput.trim();
    if (!query) {
      setReferenceTargetError('Please enter a class name.');
      setReferenceResults([]);
      setIsReferenceSearching(false);
      return;
    }

    if (!classLookupMap.has(query)) {
      setReferenceTargetError(`Class "${query}" not found. Use full name (namespace + name).`);
      setReferenceResults([]);
      setIsReferenceSearching(false);
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
    openInspectorTarget(
      result,
      classBindingByStableId,
      openTabForClass,
      setSelectedImageStableId,
      setPendingScrollImageStableId,
      setPendingScrollClassStableId,
    );
  }, [classBindingByStableId, openTabForClass, setPendingScrollClassStableId, setPendingScrollImageStableId, setSelectedImageStableId]);

  const setReferenceTargetFromClass = useCallback((fullName: string) => {
    setReferenceTargetInput(fullName);
    setReferenceTargetError(null);
    setReferenceResults([]);
    setIsReferenceOpen(true);
    setIsGlobalSearchOpen(false);
  }, []);

  return {
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
  };
}