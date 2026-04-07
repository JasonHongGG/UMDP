import { useStudioRuntime } from '@/features/studio/application/StudioModuleContext';

export function useStudioRuntimeViewState() {
  return useStudioRuntime();
}