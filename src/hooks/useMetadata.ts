import { useState, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ImageInfo, ClassSummary, ClassInfo, DumpAllResponse } from '../types';

export function useMetadata() {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [classesByImage, setClassesByImage] = useState<Record<string, ClassSummary[]>>({});
  const [classDetailsByKey, setClassDetailsByKey] = useState<Record<string, ClassInfo>>({});
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);

  const fetchMetadata = useCallback(async () => {
    setLoadingImages(true);
    try {
      const dumpAll = await invoke<DumpAllResponse>('load_all_metadata');
      setImages(dumpAll.images);
      setClassesByImage(dumpAll.classesByImage);
      setClassDetailsByKey(dumpAll.classDetails);
    } catch (e) {
      console.error("Failed to load metadata", e);
    } finally {
      setLoadingImages(false);
    }
  }, []);

  const resetMetadata = useCallback(() => {
    setImages([]);
    setClassesByImage({});
    setClassDetailsByKey({});
    setSelectedImageId(null);
  }, []);

  const classLookupMap = useMemo(() => {
    const map = new Map<string, { imageId: string; classId: string; name: string; namespace: string; imageName: string }>();
    for (const img of images) {
      const classes = classesByImage[img.id];
      if (!classes) continue;
      for (const cls of classes) {
        map.set(cls.full_name, {
          imageId: img.id,
          classId: cls.id,
          name: cls.name,
          namespace: cls.namespace,
          imageName: img.name,
        });
      }
    }
    return map;
  }, [images, classesByImage]);

  return {
    images,
    classesByImage,
    classDetailsByKey,
    selectedImageId,
    setSelectedImageId,
    loadingImages,
    setLoadingImages,
    fetchMetadata,
    resetMetadata,
    classLookupMap
  };
}
