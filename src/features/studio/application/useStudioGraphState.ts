import { useStudioServices } from '@/features/studio/core/StudioContext';

export function useStudioGraphState() {
  return useStudioServices().graph;
}