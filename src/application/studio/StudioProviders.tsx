import React from 'react';
import type { WorkspaceLifecycleState } from '../../shared/contracts';
import { StudioProvider } from '../../core/studio/StudioContext';
import type { StudioRuntimeDataState } from '../../core/studio/runtimeData';

export function StudioProviders({
  children,
  runtimeData,
  workspaceLifecycle,
}: {
  children: React.ReactNode;
  runtimeData: StudioRuntimeDataState;
  workspaceLifecycle: WorkspaceLifecycleState;
}) {
  return (
    <StudioProvider runtimeData={runtimeData} workspaceLifecycle={workspaceLifecycle}>
      {children}
    </StudioProvider>
  );
}