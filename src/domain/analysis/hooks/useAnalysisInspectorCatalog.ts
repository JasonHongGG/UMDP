import { useEffect, useMemo } from 'react';
import { formatHexAddress } from '@/core/addressFormat';
import type { AnalysisSnapshot, RuntimeClassOverlayDescriptor } from '../contracts';
import type {
  AnalysisClassInfo,
  AnalysisClassSummary,
  AnalysisFieldInfo,
  AnalysisImageInfo,
  AnalysisStaticFieldInfo,
} from '../view-models';
import { createAnalysisClassInfo } from '../view-models';
import {
  buildStudioClassCatalog,
  createClassInfoCatalogFromClassDescriptor,
  type ClassBinding,
  type ClassInfoCatalog,
  type StudioClassCatalogEntry,
} from '@/domain/studio/editor';
import type { StableId } from '../../contracts/shared-identity';
import type { ClassLookupEntry, InspectorTab } from '../workspace-types';

interface UseAnalysisInspectorCatalogParams {
  analysisSnapshot: AnalysisSnapshot | null;
  images: AnalysisImageInfo[];
  classesByImage: Record<string, AnalysisClassSummary[]>;
  classDetailsByStableId: Record<string, AnalysisClassInfo>;
  runtimeOverlays: Record<string, RuntimeClassOverlayDescriptor>;
  runtimeFieldErrorByKey: Record<string, string | null>;
  loadingRuntimeByKey: Record<string, boolean>;
  ensureRuntimeOverlayLoaded: (classStableId: StableId) => void;
  selectedImageStableId: StableId | null;
  setSelectedImageStableId: (id: StableId | null) => void;
  imageSearch: string;
  classSearch: string;
  tabs: InspectorTab[];
  activeTabIndex: number;
}

interface UseAnalysisInspectorCatalogResult {
  classLookupMap: Map<string, ClassLookupEntry>;
  studioClassCatalogEntries: StudioClassCatalogEntry[];
  classBindingByStableId: Map<string, ClassBinding>;
  classInfoCatalogByStableId: Record<string, ClassInfoCatalog>;
  staticFieldAddressByClassAndMember: Record<string, Record<string, string | null>>;
  filteredImages: AnalysisImageInfo[];
  selectedImage: AnalysisImageInfo | null;
  currentClasses: AnalysisClassSummary[];
  filteredClasses: AnalysisClassSummary[];
  activeTab: InspectorTab | null;
  selectedClass: AnalysisClassInfo | null;
  displayStaticFields: AnalysisStaticFieldInfo[];
  displayFields: AnalysisFieldInfo[];
  activeRuntimeFieldError: string | null;
  isLoadingRuntimeFields: boolean;
}

export function useAnalysisInspectorCatalog({
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
}: UseAnalysisInspectorCatalogParams): UseAnalysisInspectorCatalogResult {
  const classLookupMap = useMemo(() => {
    const lookup = new Map<string, ClassLookupEntry>();
    for (const summaries of Object.values(classesByImage)) {
      for (const classSummary of summaries) {
        lookup.set(classSummary.fullName, {
          imageStableId: classSummary.imageStableId,
          classStableId: classSummary.stableId,
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
    return new Map<string, ClassBinding>(
      studioClassCatalogEntries.map((entry: StudioClassCatalogEntry) => [entry.classStableId, entry as ClassBinding]),
    );
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
  }, [selectedImage, selectedImageStableId, setSelectedImageStableId]);

  useEffect(() => {
    if (selectedImageStableId && !images.some((image) => image.stableId === selectedImageStableId)) {
      setSelectedImageStableId(null);
    }
  }, [images, selectedImageStableId, setSelectedImageStableId]);

  useEffect(() => {
    if (!activeTab) {
      return;
    }

    ensureRuntimeOverlayLoaded(activeTab.classStableId);
  }, [activeTab, ensureRuntimeOverlayLoaded]);

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

  const activeCacheKey = activeTab ? activeTab.classStableId : '';
  const displayStaticFields = activeTab ? (studioClassDetailsByStableId[activeCacheKey]?.staticFields ?? []) : [];
  const displayFields = activeTab ? (studioClassDetailsByStableId[activeCacheKey]?.fields ?? []) : [];
  const activeRuntimeFieldError = runtimeFieldErrorByKey[activeCacheKey] ?? null;
  const isLoadingRuntimeFields = loadingRuntimeByKey[activeCacheKey] ?? false;

  return {
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
  };
}