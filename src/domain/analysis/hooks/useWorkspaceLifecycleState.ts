import { useCallback, useEffect, useState } from 'react';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import { EMPTY_WORKSPACE_LIFECYCLE } from '@/app/shell/workspaceLifecycle';
import type { AnalysisRepository } from '../repository/AnalysisRepository';

interface UseWorkspaceLifecycleStateOptions {
  repository: AnalysisRepository;
}

function mergeWorkspaceLifecycle(
  previous: WorkspaceLifecycleState,
  fallback: Partial<WorkspaceLifecycleState>,
): WorkspaceLifecycleState {
  return {
    ...previous,
    ...fallback,
    runtimeSession: fallback.runtimeSession
      ? {
          ...previous.runtimeSession,
          ...fallback.runtimeSession,
        }
      : previous.runtimeSession,
  };
}

export function useWorkspaceLifecycleState({
  repository,
}: UseWorkspaceLifecycleStateOptions) {
  const [workspaceLifecycle, setWorkspaceLifecycle] = useState<WorkspaceLifecycleState>(EMPTY_WORKSPACE_LIFECYCLE);

  const applyWorkspaceLifecycleFallback = useCallback((fallback: Partial<WorkspaceLifecycleState>) => {
    setWorkspaceLifecycle((previous) => mergeWorkspaceLifecycle(previous, fallback));
  }, []);

  const refreshWorkspaceLifecycle = useCallback(async (reason = 'unspecified') => {
    try {
      const workspace = await repository.getWorkspaceLifecycle();
      setWorkspaceLifecycle(workspace);
    } catch (error) {
      console.error(`Failed to refresh workspace lifecycle (${reason})`, error);
    }
  }, [repository]);

  useEffect(() => {
    refreshWorkspaceLifecycle('initial-mount');
  }, [refreshWorkspaceLifecycle]);

  return {
    applyWorkspaceLifecycleFallback,
    workspaceLifecycle,
    refreshWorkspaceLifecycle,
  };
}