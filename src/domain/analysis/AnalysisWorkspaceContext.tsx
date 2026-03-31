import React, { createContext, useContext } from 'react';
import {
  WorkspaceShellProvider,
} from '@/domain/workspace/WorkspaceShellContext';
import { InspectorWorkspaceProvider } from '@/domain/inspector/InspectorWorkspaceContext';
import { StudioWorkspaceProvider } from '@/domain/studio/StudioWorkspaceContext';
import type { AnalysisWorkspaceContextValue } from './AnalysisWorkspaceContext.types';
import { useAnalysisWorkspaceComposition } from './hooks/useAnalysisWorkspaceComposition';

const AnalysisWorkspaceContext = createContext<AnalysisWorkspaceContextValue | null>(null);

export function AnalysisWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const {
    analysisWorkspaceValue,
    inspectorWorkspaceValue,
    studioWorkspaceValue,
    workspaceShellValue,
  } = useAnalysisWorkspaceComposition();

  return (
    <WorkspaceShellProvider value={workspaceShellValue}>
      <AnalysisWorkspaceContext.Provider value={analysisWorkspaceValue}>
        <InspectorWorkspaceProvider value={inspectorWorkspaceValue}>
          <StudioWorkspaceProvider value={studioWorkspaceValue}>
            {children}
          </StudioWorkspaceProvider>
        </InspectorWorkspaceProvider>
      </AnalysisWorkspaceContext.Provider>
    </WorkspaceShellProvider>
  );
}

export function useAnalysisWorkspace() {
  const context = useContext(AnalysisWorkspaceContext);
  if (!context) {
    throw new Error('useAnalysisWorkspace must be used within an AnalysisWorkspaceProvider');
  }

  return context;
}
