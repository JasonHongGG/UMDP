import { useStudioServices } from '@/features/studio/application/StudioServicesContext';

export function useStudioGraphState() {
  return useStudioServices().graph;
}