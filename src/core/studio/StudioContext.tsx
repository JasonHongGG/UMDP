import React, { createContext, useContext } from 'react';
import type { WorkspaceLifecycleState } from '../../shared/contracts';
import { ExpressionDragProvider } from './drag/ExpressionDragContext';
import { StudioGraphStore } from './graphStore';
import { StudioRuntimeDataProvider, type StudioRuntimeDataState } from './runtimeData';
import { useStudioComposition } from '../../application/studio/StudioComposition';
import { type StudioQueryState } from '../../application/studio/query/useStudioQueryState';
import { type StudioRuntimeState } from '../../application/studio/runtime/useStudioRuntimeState';
import { type StudioUiState } from './studioUiState';

export interface StudioServices {
  graph: StudioGraphStore;
  ui: StudioUiState;
  runtime: StudioRuntimeState;
  query: StudioQueryState;
}

const StudioServicesContext = createContext<StudioServices | null>(null);

export function useStudioServices() {
  const context = useContext(StudioServicesContext);
  if (!context) {
    throw new Error('useStudioServices must be used within a StudioProvider');
  }

  return context;
}

export function useStudioGraph() {
  return useStudioServices().graph;
}

export function useStudioUi() {
  return useStudioServices().ui;
}

export function useStudioRuntime() {
  return useStudioServices().runtime;
}

export function useStudioQuery() {
  return useStudioServices().query;
}

export function useStudio() {
  return {
    ...useStudioGraph(),
    ...useStudioUi(),
    ...useStudioRuntime(),
    ...useStudioQuery(),
  };
}

export function StudioProvider({ children, runtimeData, workspaceLifecycle }: { children: React.ReactNode; runtimeData: StudioRuntimeDataState; workspaceLifecycle: WorkspaceLifecycleState }) {
  const { graph, ui, runtime, query } = useStudioComposition(runtimeData, workspaceLifecycle);
  const services: StudioServices = {
    graph,
    ui,
    runtime,
    query,
  };

  return (
    <StudioRuntimeDataProvider value={runtimeData}>
      <ExpressionDragProvider>
        <StudioServicesContext.Provider value={services}>
          {children}
        </StudioServicesContext.Provider>
      </ExpressionDragProvider>
    </StudioRuntimeDataProvider>
  );
}