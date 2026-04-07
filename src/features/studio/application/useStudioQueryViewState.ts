import { useStudioServices } from '@/features/studio/application/StudioServicesContext';

export function useStudioQueryViewState() {
  return useStudioServices().query;
}