import { useMemo } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useAnalysisWorkspace } from '../../domain/analysis/AnalysisWorkspaceContext';
import { deriveWorkspaceLifecycle } from '../shell/workspaceLifecycle';

export function useWorkspaceShellFacade() {
  const {
    processSession,
    attachError,
    analysisSnapshot,
    loadingImages,
    activePage,
    setActivePage,
  } = useAnalysisWorkspace();

  const workspace = useMemo(() => deriveWorkspaceLifecycle({
    processSession,
    analysisSnapshot,
    loadingImages,
    attachError,
  }), [analysisSnapshot, attachError, loadingImages, processSession]);

  const openSelector = async () => {
    const selector = await WebviewWindow.getByLabel('process-selector');
    if (selector) {
      await selector.show();
      await selector.setFocus();
      await selector.emit('refresh-processes');
    }
  };

  return {
    workspace,
    processSession,
    activePage,
    setActivePage,
    openSelector,
  };
}
