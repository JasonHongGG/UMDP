import { useState, useCallback } from 'react';
import type { ClassInfo, ImageInfo, ClassReferenceResult } from '../types';

type ReferenceMode = 'Inheritance' | 'Member' | 'Function';

interface UseClassReferenceParams {
  classDetailsByKey: Record<string, ClassInfo>;
  images: ImageInfo[];
  classesByImage: Record<string, import('../types').ClassSummary[]>;
  classLookupMap: Map<string, { imageId: string; classId: string; name: string; namespace: string; imageName: string }>;
  openTabForClass: (entry: { imageId: string; classId: string; name: string; namespace: string; imageName: string }) => void;
  setSelectedImageId: (id: string) => void;
  setPendingScrollImageId: (id: string | null) => void;
  setPendingScrollClassId: (id: string | null) => void;
}

export function useClassReference({
  classDetailsByKey,
  images,
  classesByImage,
  classLookupMap,
  openTabForClass,
  setSelectedImageId,
  setPendingScrollImageId,
  setPendingScrollClassId,
}: UseClassReferenceParams) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<ReferenceMode>('Inheritance');
  const [targetInput, setTargetInput] = useState('');
  const [targetError, setTargetError] = useState<string | null>(null);
  const [results, setResults] = useState<ClassReferenceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const executeSearch = useCallback(() => {
    const query = targetInput.trim();
    if (!query) {
      setTargetError('Please enter a class name.');
      return;
    }

    // Validate that the target exists in the lookup map
    if (!classLookupMap.has(query)) {
      setTargetError(`Class "${query}" not found. Use full name (namespace + name).`);
      setResults([]);
      return;
    }

    setTargetError(null);
    setIsSearching(true);

    const found: ClassReferenceResult[] = [];

    for (const [key, classInfo] of Object.entries(classDetailsByKey)) {
      const [imageId, classId] = key.split('::');
      const img = images.find(i => i.id === imageId);
      if (!img) continue;

      // Skip self
      if (classInfo.full_name === query) continue;

      if (searchMode === 'Inheritance') {
        // Check if this class inherits from the target
        for (const node of classInfo.inheritance) {
          if (node.name === query) {
            found.push({
              imageId,
              classId,
              imageName: img.name,
              className: classInfo.full_name,
              matchType: 'Inheritance',
              matchDetail: `inherits ${query}`,
            });
            break;
          }
        }
      } else if (searchMode === 'Member') {
        // Check fields and static_fields
        for (const f of classInfo.fields) {
          if (f.field_type === query) {
            found.push({
              imageId,
              classId,
              imageName: img.name,
              className: classInfo.full_name,
              matchType: 'Member',
              matchDetail: f.name,
            });
            break; // one match per class is enough
          }
        }
        // If not already added from fields, check static_fields
        if (!found.some(r => r.imageId === imageId && r.classId === classId)) {
          for (const f of classInfo.static_fields) {
            if (f.field_type === query) {
              found.push({
                imageId,
                classId,
                imageName: img.name,
                className: classInfo.full_name,
                matchType: 'Member',
                matchDetail: f.name,
              });
              break;
            }
          }
        }
      } else if (searchMode === 'Function') {
        // Check method signatures for the target type
        for (const m of classInfo.methods) {
          if (m.signature.includes(query)) {
            found.push({
              imageId,
              classId,
              imageName: img.name,
              className: classInfo.full_name,
              matchType: 'Function',
              matchDetail: m.name,
            });
            break; // one match per class is enough
          }
        }
      }
    }

    // Sort: className alphabetically
    found.sort((a, b) => a.className.localeCompare(b.className));

    setResults(found);
    setIsSearching(false);
  }, [targetInput, searchMode, classDetailsByKey, images, classLookupMap]);

  const setTargetFromClass = useCallback((fullName: string) => {
    setTargetInput(fullName);
    setTargetError(null);
    setResults([]);
    setIsOpen(true);
  }, []);

  const handleResultClick = useCallback((result: ClassReferenceResult) => {
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
  }, [classesByImage, openTabForClass, setSelectedImageId, setPendingScrollImageId, setPendingScrollClassId]);

  return {
    isOpen,
    setIsOpen,
    searchMode,
    setSearchMode,
    targetInput,
    setTargetInput,
    targetError,
    results,
    isSearching,
    executeSearch,
    setTargetFromClass,
    handleResultClick,
  };
}
