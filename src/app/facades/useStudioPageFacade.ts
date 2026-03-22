import { useStudioWorkspace } from '../../domain/analysis/AnalysisWorkspaceContext';

export function useStudioPageFacade() {
  const {
    studioRuntimeData,
    pendingClassNode,
    clearPendingClassNode,
    workspaceLifecycle,
  } = useStudioWorkspace();

  return {
    studioRuntimeData,
    pendingClassNode,
    clearPendingClassNode,
    workspaceLifecycle,
  };
}
