import { useStudioServices } from '@/features/studio/application/StudioServicesContext';

export function useStudioRuntimeViewState() {
  return useStudioServices().runtime;
}