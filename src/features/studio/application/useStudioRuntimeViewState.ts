import { useStudioServices } from '@/features/studio/core/StudioContext';

export function useStudioRuntimeViewState() {
  return useStudioServices().runtime;
}