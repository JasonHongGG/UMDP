import { useStudioWorkspace } from '../../domain/analysis/AnalysisWorkspaceContext';

export function useStudioPageFacade() {
  const {
    studioRuntimeData,
    pendingClassNode,
    clearPendingClassNode,
  } = useStudioWorkspace();

  return {
    studioRuntimeData,
    pendingClassNode,
    clearPendingClassNode,
  };
}
