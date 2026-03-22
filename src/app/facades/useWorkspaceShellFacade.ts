import { useWorkspaceShellState } from '../../domain/analysis/AnalysisWorkspaceContext';
import { openProcessSelectorWindow } from '../../infrastructure/tauri/TauriWorkspaceGateway';

export function useWorkspaceShellFacade() {
  const {
    processSession,
    contractVersions,
    workspaceLifecycle,
    activePage,
    setActivePage,
  } = useWorkspaceShellState();

  const openSelector = async () => {
    await openProcessSelectorWindow();
  };

  return {
    workspace: workspaceLifecycle,
    contractVersions,
    processSession,
    activePage,
    setActivePage,
    openSelector,
  };
}
