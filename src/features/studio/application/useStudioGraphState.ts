import { useStudioGraph } from '@/features/studio/application/StudioModuleContext';

export function useStudioGraphState() {
  return useStudioGraph();
}