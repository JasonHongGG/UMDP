import React from 'react';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import { StudioProvider } from '@/features/studio/core/StudioContext';
import type { StudioRuntimeDataState } from '@/features/studio/core/runtimeData';

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