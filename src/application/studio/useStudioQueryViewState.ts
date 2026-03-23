import { useStudioServices } from '../../core/studio/StudioContext';

export function useStudioQueryViewState() {
  return useStudioServices().query;
}