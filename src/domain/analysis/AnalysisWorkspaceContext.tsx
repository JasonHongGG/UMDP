import React, { createContext, useContext } from 'react';
import { WorkspaceShellProvider } from '@/domain/workspace/WorkspaceShellContext';
import { InspectorWorkspaceProvider } from '@/domain/inspector/InspectorWorkspaceContext';
import type { AnalysisWorkspaceContextValue } from './AnalysisWorkspaceContext.types';
import { useAnalysisWorkspaceModel } from './composition/useAnalysisWorkspaceModel';

const AnalysisWorkspaceContext = createContext<AnalysisWorkspaceContextValue | null>(null);

export function AnalysisWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const {
    analysisWorkspaceValue,
    workspaceShellValue,
    inspectorWorkspaceValue,
  } = useAnalysisWorkspaceModel();

  return (
    <WorkspaceShellProvider value={workspaceShellValue}>
      <AnalysisWorkspaceContext.Provider value={analysisWorkspaceValue}>
        <InspectorWorkspaceProvider value={inspectorWorkspaceValue}>
          {children}
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
