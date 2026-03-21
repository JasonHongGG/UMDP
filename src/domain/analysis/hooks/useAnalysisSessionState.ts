import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useState } from 'react';
import type { AnalysisSnapshot, ProcessInfo, ProcessSession } from '../contracts';
import type { AnalysisRepository } from '../repository/AnalysisRepository';
import type { WorkspaceLifecycleState } from '../../../shared/contracts';
import { EMPTY_WORKSPACE_LIFECYCLE } from '../../../app/shell/workspaceLifecycle';

interface UseAnalysisSessionStateOptions {
  repository: AnalysisRepository;
  onResetWorkspace: () => void;
}

export function useAnalysisSessionState({ repository, onResetWorkspace }: UseAnalysisSessionStateOptions) {
  const [processSession, setProcessSession] = useState<ProcessSession | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [analysisSnapshot, setAnalysisSnapshot] = useState<AnalysisSnapshot | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);
  const [workspaceLifecycle, setWorkspaceLifecycle] = useState<WorkspaceLifecycleState>(EMPTY_WORKSPACE_LIFECYCLE);

  const refreshWorkspaceLifecycle = useCallback(async (fallback?: Partial<WorkspaceLifecycleState>) => {
    try {
      const workspace = await repository.getWorkspaceLifecycle();
      setWorkspaceLifecycle(workspace);
    } catch (error) {
      if (fallback) {
        setWorkspaceLifecycle((previous) => ({
          ...previous,
          ...fallback,
          runtimeSession: fallback.runtimeSession ?? previous.runtimeSession,
        }));
      }
      console.error('Failed to refresh workspace lifecycle', error);
    }
  }, [repository]);

  const fetchMetadata = useCallback(async (session: ProcessSession | null) => {
    setLoadingImages(true);
    await refreshWorkspaceLifecycle();
    try {
      const snapshot = await repository.loadAllMetadata();
      setAnalysisSnapshot({
        ...snapshot,
        process: session,
      });
    } catch (error) {
      console.error('Failed to load metadata', error);
    } finally {
      setLoadingImages(false);
      await refreshWorkspaceLifecycle({
        processSession: session,
        runtime: session?.runtime ?? 'unknown',
      });
    }
  }, [refreshWorkspaceLifecycle, repository]);

  useEffect(() => {
    refreshWorkspaceLifecycle();
  }, [refreshWorkspaceLifecycle]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      refreshWorkspaceLifecycle();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshWorkspaceLifecycle]);

  useEffect(() => {
    const unlisten = listen<ProcessInfo>('process-selected', async (event) => {
      setAttachError(null);
      setLoadingImages(true);
      try {
        const session = await repository.attachToProcess({
          pid: event.payload.pid,
          name: event.payload.name,
        });

        setProcessSession(session);
        setAnalysisSnapshot(null);
        onResetWorkspace();
        await refreshWorkspaceLifecycle({
          status: 'attached-without-snapshot',
          processSession: session,
          runtime: session.runtime,
          hasSnapshot: false,
          errorMessage: null,
        });
        await fetchMetadata(session);
      } catch (error) {
        setProcessSession(null);
        setAnalysisSnapshot(null);
        onResetWorkspace();
        setAttachError(String(error));
        setLoadingImages(false);
        await refreshWorkspaceLifecycle({
          status: 'bridge-error',
          processSession: null,
          runtime: 'unknown',
          hasSnapshot: false,
          errorMessage: String(error),
        });
      }
    });

    return () => {
      unlisten.then((dispose) => dispose());
    };
  }, [fetchMetadata, onResetWorkspace, repository]);

  return {
    processSession,
    attachError,
    analysisSnapshot,
    loadingImages,
    setAnalysisSnapshot,
    workspaceLifecycle,
    refreshWorkspaceLifecycle,
  };
}
