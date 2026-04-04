import React, { useEffect, useRef } from 'react';
import { Provider } from 'react-redux';
import { useAppInfrastructure } from '@/app/AppInfrastructureContext';
import { createAppStore, attachToProcess, loadContractVersions, refreshWorkspaceLifecycle, type AppStore } from './store';

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const { analysisRepository, workspaceAttachIntentChannel } = useAppInfrastructure();
  const storeRef = useRef<AppStore | null>(null);

  if (storeRef.current == null) {
    storeRef.current = createAppStore({
      analysisRepository,
    });
  }

  const store = storeRef.current;

  useEffect(() => {
    store.dispatch(loadContractVersions());
    store.dispatch(refreshWorkspaceLifecycle('workspace.initial-mount'));

    let disposed = false;
    let disposeAttach: (() => void) | undefined;

    workspaceAttachIntentChannel.onAttachIntent(async (process) => {
      store.dispatch(attachToProcess(process));
    }).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }

      disposeAttach = dispose;
    }).catch(() => undefined);

    const refreshOnVisibility = () => {
      const state = store.getState();
      if (document.visibilityState !== 'visible' || !state.workspace.lifecycle.processSession || state.analysis.loadingSnapshot) {
        return;
      }

      store.dispatch(refreshWorkspaceLifecycle('workspace.document-visible'));
    };

    const refreshOnFocus = () => {
      const state = store.getState();
      if (!state.workspace.lifecycle.processSession || state.analysis.loadingSnapshot) {
        return;
      }

      store.dispatch(refreshWorkspaceLifecycle('workspace.window-focus'));
    };

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisibility);

    return () => {
      disposed = true;
      disposeAttach?.();
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, [analysisRepository, store, workspaceAttachIntentChannel]);

  return <Provider store={store}>{children}</Provider>;
}
