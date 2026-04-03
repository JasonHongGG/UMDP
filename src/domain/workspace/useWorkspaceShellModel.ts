import { useEffect, useMemo, useRef } from 'react';
import type { ActivePage } from '@/domain/analysis/workspace-types';
import type { ProcessSession } from '@/domain/analysis/contracts';
import type { SystemContractVersions, WorkspaceLifecycleState, WorkspaceTaskSnapshot } from '@/shared/contracts';
import {
  createWorkspaceKernelState,
  createWorkspacePresentation,
} from '@/kernel/workspace/derive';

interface UseWorkspaceShellModelArgs {
  processSession: ProcessSession | null;
  contractVersions: SystemContractVersions | null;
  workspaceLifecycle: WorkspaceLifecycleState;
  activePage: ActivePage;
  workspaceTasks: WorkspaceTaskSnapshot[];
}

export function useWorkspaceShellModel({
  processSession,
  contractVersions,
  workspaceLifecycle,
  activePage,
  workspaceTasks,
}: UseWorkspaceShellModelArgs) {
  const previousLifecycleRef = useRef<WorkspaceLifecycleState | null>(null);

  const workspaceKernel = useMemo(() => createWorkspaceKernelState({
    processSession,
    contractVersions,
    workspaceLifecycle,
    activePage,
    workspaceTasks,
    previousLifecycle: previousLifecycleRef.current,
  }), [activePage, contractVersions, processSession, workspaceLifecycle, workspaceTasks]);

  const workspacePresentation = useMemo(() => {
    return createWorkspacePresentation(workspaceKernel);
  }, [workspaceKernel]);

  useEffect(() => {
    previousLifecycleRef.current = workspaceLifecycle;
  }, [workspaceLifecycle]);

  return {
    workspaceKernel,
    workspacePresentation,
  };
}