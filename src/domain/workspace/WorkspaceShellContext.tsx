import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ProcessSession } from '@/domain/analysis/contracts';
import type { ActivePage } from '@/domain/analysis/workspace-types';
import type { SystemContractVersions, WorkspaceLifecycleState, WorkspaceTaskSnapshot } from '@/shared/contracts';
import type { WorkspaceKernelState, WorkspacePresentation } from '@/kernel/workspace/derive';

export interface WorkspaceShellContextValue {
  processSession: ProcessSession | null;
  contractVersions: SystemContractVersions | null;
  workspaceLifecycle: WorkspaceLifecycleState;
  workspaceKernel: WorkspaceKernelState;
  workspacePresentation: WorkspacePresentation;
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;
  workspaceTasks: WorkspaceTaskSnapshot[];
  setWorkspaceTasks: (sourceKey: string, tasks: WorkspaceTaskSnapshot[]) => void;
}

const WorkspaceShellContext = createContext<WorkspaceShellContextValue | null>(null);

export function useWorkspaceTaskRegistry() {
  const [workspaceTasksBySource, setWorkspaceTasksBySource] = useState<Record<string, WorkspaceTaskSnapshot[]>>({});

  const resetWorkspaceTasks = useCallback(() => {
    setWorkspaceTasksBySource({});
  }, []);

  const setWorkspaceTasks = useCallback((sourceKey: string, tasks: WorkspaceTaskSnapshot[]) => {
    setWorkspaceTasksBySource((previous) => {
      if (tasks.length === 0) {
        if (!Object.prototype.hasOwnProperty.call(previous, sourceKey)) {
          return previous;
        }

        const next = { ...previous };
        delete next[sourceKey];
        return next;
      }

      return {
        ...previous,
        [sourceKey]: tasks,
      };
    });
  }, []);

  const workspaceTasks = useMemo(() => {
    return Object.values(workspaceTasksBySource).flat();
  }, [workspaceTasksBySource]);

  return {
    workspaceTasks,
    setWorkspaceTasks,
    resetWorkspaceTasks,
  };
}

export function WorkspaceShellProvider({
  value,
  children,
}: {
  value: WorkspaceShellContextValue;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceShellContext.Provider value={value}>
      {children}
    </WorkspaceShellContext.Provider>
  );
}

export function useWorkspaceShellState() {
  const context = useContext(WorkspaceShellContext);
  if (!context) {
    throw new Error('useWorkspaceShellState must be used within a WorkspaceShellProvider');
  }
  return context;
}