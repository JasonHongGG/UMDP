import { useStudioQuery } from '@/features/studio/application/StudioModuleContext';

export function useStudioQueryViewState() {
  return useStudioQuery();
}