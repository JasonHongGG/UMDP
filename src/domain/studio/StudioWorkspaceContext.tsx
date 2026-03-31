import React, { createContext, useContext } from 'react';
import type { PendingClassNodeRequest } from '@/domain/studio/editor';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import type { StudioRuntimeDataState } from '@/features/studio/core/runtimeData';

export interface StudioWorkspaceContextValue {
  studioRuntimeData: StudioRuntimeDataState;
  pendingClassNode: PendingClassNodeRequest | null;
  clearPendingClassNode: () => void;
  workspaceLifecycle: WorkspaceLifecycleState;
}

const StudioWorkspaceContext = createContext<StudioWorkspaceContextValue | null>(null);

export function StudioWorkspaceProvider({
  value,
  children,
}: {
  value: StudioWorkspaceContextValue;
  children: React.ReactNode;
}) {
  return (
    <StudioWorkspaceContext.Provider value={value}>
      {children}
    </StudioWorkspaceContext.Provider>
  );
}

export function useStudioWorkspace() {
  const context = useContext(StudioWorkspaceContext);
  if (!context) {
    throw new Error('useStudioWorkspace must be used within a StudioWorkspaceProvider');
  }

  return context;
}