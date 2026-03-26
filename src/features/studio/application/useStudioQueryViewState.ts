import { useStudioServices } from '@/features/studio/core/StudioContext';

export function useStudioQueryViewState() {
  return useStudioServices().query;
}