import { useStudioServices } from '../../core/studio/StudioContext';

export function useStudioGraphState() {
  return useStudioServices().graph;
}