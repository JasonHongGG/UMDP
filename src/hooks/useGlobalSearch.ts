import { useState, useEffect } from 'react';
import type { GlobalSearchResult, ClassInfo, ImageInfo, ClassSummary } from '../types';

export function useGlobalSearch(
  classDetailsByKey: Record<string, ClassInfo>,
  images: ImageInfo[],
  classLookupMap: Map<string, { imageId: string, classId: string, name: string, namespace: string, imageName: string }>,
  classesByImage: Record<string, ClassSummary[]>,
  activeImageId: string | null,
  activeClassId: string | null,
  openTabForClass: (entry: { imageId: string, classId: string, name: string, namespace: string, imageName: string }) => void,
  setSelectedImageId: (id: string) => void,
  setPendingScrollImageId: (id: string | null) => void,
  setPendingScrollClassId: (id: string | null) => void
) {
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchMode, setGlobalSearchMode] = useState<'Class' | 'Field' | 'StaticField' | 'Method'>('Class');
  const [globalSearchResults, setGlobalSearchResults] = useState<GlobalSearchResult[]>([]);
  const [isGlobalSearching, setIsGlobalSearching] = useState(false);

  useEffect(() => {
    if (!globalSearchQuery || globalSearchQuery.length < 2) {
      setGlobalSearchResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      setIsGlobalSearching(true);
      const query = globalSearchQuery.toLowerCase();
      let results: GlobalSearchResult[] = [];

      for (const [key, classInfo] of Object.entries(classDetailsByKey)) {
        if (results.length > 100000) break;
        const [imageId, classId] = key.split('::');
        const img = images.find(i => i.id === imageId);
        if (!img) continue;

        if (globalSearchMode === 'Class') {
          if (classInfo.name.toLowerCase().includes(query) || classInfo.namespace.toLowerCase().includes(query)) {
            results.push({ imageId, classId, imageName: img.name, className: classInfo.name, matchType: 'Class', matchText: classInfo.full_name, isInherited: false });
          }
        } else {
          const seenMembers = new Set<string>();
          for (let i = 0; i < classInfo.inheritance.length; i++) {
            const baseName = classInfo.inheritance[i].name;
            const lookup = classLookupMap.get(baseName);
            const targetClass = lookup ? classDetailsByKey[`${lookup.imageId}::${lookup.classId}`] : null;
            const actualClassInfo = i === 0 ? classInfo : targetClass;
            if (!actualClassInfo) continue;

            const arr = globalSearchMode === 'Field' ? actualClassInfo.fields :
              globalSearchMode === 'StaticField' ? actualClassInfo.static_fields :
                actualClassInfo.methods;

            for (const item of arr) {
              if (seenMembers.has(item.name)) continue;
              seenMembers.add(item.name);
              if (item.name.toLowerCase().includes(query)) {
                results.push({ imageId, classId, imageName: img.name, className: classInfo.name, matchType: globalSearchMode, matchText: item.name, isInherited: i > 0 });
              }
            }
          }
        }
      }

      results.sort((a, b) => {
        const aActive = a.imageId === activeImageId && a.classId === activeClassId;
        const bActive = b.imageId === activeImageId && b.classId === activeClassId;
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;

        if (!a.isInherited && b.isInherited) return -1;
        if (a.isInherited && !b.isInherited) return 1;

        const textCmp = a.matchText.localeCompare(b.matchText);
        if (textCmp !== 0) return textCmp;

        const classCmp = a.className.localeCompare(b.className);
        if (classCmp !== 0) return classCmp;

        return a.imageName.localeCompare(b.imageName);
      });

      if (results.length > 2000) {
        results = results.slice(0, 2000);
      }

      setGlobalSearchResults(results);
      setIsGlobalSearching(false);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [globalSearchQuery, globalSearchMode, classDetailsByKey, images, activeImageId, activeClassId, classLookupMap]);

  const handleGlobalSearchResultClick = (result: GlobalSearchResult) => {
    setSelectedImageId(result.imageId);
    const item = classesByImage[result.imageId]?.find(c => c.id === result.classId);
    if (item) {
      openTabForClass({
        imageId: result.imageId,
        classId: result.classId,
        name: item.name,
        namespace: item.namespace,
        imageName: result.imageName,
      });
    }
    setPendingScrollImageId(result.imageId);
    setPendingScrollClassId(result.classId);
  };

  return {
    isGlobalSearchOpen,
    setIsGlobalSearchOpen,
    globalSearchQuery,
    setGlobalSearchQuery,
    globalSearchMode,
    setGlobalSearchMode,
    globalSearchResults,
    isGlobalSearching,
    handleGlobalSearchResultClick
  };
}
