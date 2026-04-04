import React, { createContext, useContext, useMemo } from 'react';
import type { AnalysisRepository } from '@/domain/analysis/repository/AnalysisRepository';
import type { SceneGateway } from '@/domain/scene/gateway';
import type { WorkspaceAttachIntentChannel } from '@/domain/workspace/ports/WorkspaceAttachIntentChannel';
import { createTauriAnalysisRepository } from '@/infrastructure/tauri/TauriAnalysisRepository';
import { createTauriSceneGateway } from '@/infrastructure/tauri/TauriSceneGateway';
import { createTauriWorkspaceAttachIntentChannel } from '@/infrastructure/tauri/TauriWorkspaceAttachIntentChannel';

interface AppInfrastructureContextValue {
  analysisRepository: AnalysisRepository;
  sceneGateway: SceneGateway;
  workspaceAttachIntentChannel: WorkspaceAttachIntentChannel;
}

const AppInfrastructureContext = createContext<AppInfrastructureContextValue | null>(null);

export function AppInfrastructureProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<AppInfrastructureContextValue>(() => ({
    analysisRepository: createTauriAnalysisRepository(),
    sceneGateway: createTauriSceneGateway(),
    workspaceAttachIntentChannel: createTauriWorkspaceAttachIntentChannel(),
  }), []);

  return (
    <AppInfrastructureContext.Provider value={value}>
      {children}
    </AppInfrastructureContext.Provider>
  );
}

export function useAppInfrastructure() {
  const context = useContext(AppInfrastructureContext);
  if (!context) {
    throw new Error('useAppInfrastructure must be used within an AppInfrastructureProvider');
  }

  return context;
}