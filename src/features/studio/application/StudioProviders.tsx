import React from 'react';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import { StudioProvider } from '@/features/studio/core/StudioContext';
import type { StudioRuntimeDataState } from '@/features/studio/core/runtimeData';
import { StudioFeedbackProvider } from './feedback/StudioFeedbackContext';

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
    <StudioFeedbackProvider>
      <StudioProvider runtimeData={runtimeData} workspaceLifecycle={workspaceLifecycle}>
        {children}
      </StudioProvider>
    </StudioFeedbackProvider>
  );
}