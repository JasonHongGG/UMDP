import { useAnalysisWorkspace } from '../../domain/analysis/AnalysisWorkspaceContext';

export function useStudioPageFacade() {
  const {
    studioRuntimeData,
    pendingClassNode,
    clearPendingClassNode,
  } = useAnalysisWorkspace();

  return {
    studioRuntimeData,
    pendingClassNode,
    clearPendingClassNode,
  };
}
