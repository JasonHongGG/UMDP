import { useMemo } from 'react';
import type { StableId } from '@/domain/contracts/shared-identity';
import type { AnalysisSnapshot } from '../contracts';
import type { AnalysisClassInfo, AnalysisClassSummary, AnalysisImageInfo } from '../view-models';
import { createAnalysisClassInfo, createAnalysisClassSummary } from '../view-models';

export function useAnalysisCatalogProjection(analysisSnapshot: AnalysisSnapshot | null) {
  const images = useMemo<AnalysisImageInfo[]>(() => analysisSnapshot?.images ?? [], [analysisSnapshot]);

  const imagesByStableId = useMemo(() => {
    return new Map(images.map((image) => [image.stableId, image]));
  }, [images]);

  const classesByImage = useMemo<Record<string, AnalysisClassSummary[]>>(() => {
    if (!analysisSnapshot) {
      return {};
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

  const classDetailsByStableId = useMemo<Record<string, AnalysisClassInfo>>(() => {
    if (!analysisSnapshot) {
      return {};
    }

    return Object.fromEntries(
      Object.values(analysisSnapshot.classes).map((descriptor) => [descriptor.stableId, createAnalysisClassInfo(descriptor)]),
    );
  }, [analysisSnapshot]);

  return {
    images,
    classesByImage,
    classDetailsByStableId,
  };
}