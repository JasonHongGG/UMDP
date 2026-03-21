import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useAnalysisWorkspace } from '../../domain/analysis/AnalysisWorkspaceContext';

export function useWorkspaceShellFacade() {
  const {
    processSession,
    workspaceLifecycle,
    activePage,
    setActivePage,
  } = useAnalysisWorkspace();

  const openSelector = async () => {
    const selector = await WebviewWindow.getByLabel('process-selector');
    if (selector) {
      await selector.show();
      await selector.setFocus();
      await selector.emit('refresh-processes');
    }
  };

  return {
    workspace: workspaceLifecycle,
    processSession,
    activePage,
    setActivePage,
    openSelector,
  };
}
