import { useCallback, useEffect, useState } from 'react';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import { EMPTY_WORKSPACE_LIFECYCLE } from '@/app/shell/workspaceLifecycle';
import type { AnalysisRepository } from '../repository/AnalysisRepository';
import type { ProcessSession } from '../contracts';

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function logPerf(label: string, startedAt: number, details?: Record<string, unknown>) {
  const durationMs = nowMs() - startedAt;
  console.log(`[perf][session] ${label} completed in ${durationMs.toFixed(1)}ms`, details ?? {});
}

interface UseWorkspaceLifecycleStateOptions {
  repository: AnalysisRepository;
  processSession: ProcessSession | null;
  loadingImages: boolean;
}

export function useWorkspaceLifecycleState({
  repository,
  processSession,
  loadingImages,
}: UseWorkspaceLifecycleStateOptions) {
  const [workspaceLifecycle, setWorkspaceLifecycle] = useState<WorkspaceLifecycleState>(EMPTY_WORKSPACE_LIFECYCLE);

  const patchWorkspaceLifecycle = useCallback((patch: Partial<WorkspaceLifecycleState>) => {
    setWorkspaceLifecycle((previous) => ({
      ...previous,
      ...patch,
      runtimeSession: patch.runtimeSession ?? previous.runtimeSession,
    }));
  }, []);

  const refreshWorkspaceLifecycle = useCallback(async (fallback?: Partial<WorkspaceLifecycleState>, reason = 'unspecified') => {
    const startedAt = nowMs();
    try {
      const workspace = await repository.getWorkspaceLifecycle();
      setWorkspaceLifecycle(workspace);
      logPerf(`refreshWorkspaceLifecycle:${reason}`, startedAt, {
        status: workspace.status,
        runtimeStatus: workspace.runtimeSession.status,
      });
    } catch (error) {
      if (fallback) {
        setWorkspaceLifecycle((previous) => ({
          ...previous,
          ...fallback,
          runtimeSession: fallback.runtimeSession ?? previous.runtimeSession,
        }));
      }
      console.error(`Failed to refresh workspace lifecycle (${reason})`, error);
    }
  }, [repository]);

  useEffect(() => {
    refreshWorkspaceLifecycle(undefined, 'initial-mount');
  }, [refreshWorkspaceLifecycle]);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (!processSession || loadingImages || document.visibilityState !== 'visible') {
        return;
      }

      refreshWorkspaceLifecycle(undefined, 'window-focus').catch(() => undefined);
    };

    const refreshOnVisible = () => {
      if (!processSession || loadingImages || document.visibilityState !== 'visible') {
        return;
      }

      refreshWorkspaceLifecycle(undefined, 'document-visible').catch(() => undefined);
    };

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisible);

    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisible);
    };
  }, [loadingImages, processSession, refreshWorkspaceLifecycle]);

  return {
    workspaceLifecycle,
    patchWorkspaceLifecycle,
    refreshWorkspaceLifecycle,
  };
}