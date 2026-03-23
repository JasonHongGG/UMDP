import { useStudioServices } from '../../core/studio/StudioContext';

export function useStudioRuntimeViewState() {
  return useStudioServices().runtime;
}