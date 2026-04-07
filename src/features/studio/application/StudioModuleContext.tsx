import React, { createContext, useContext } from 'react';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import { ExpressionDragProvider } from '@/features/studio/core/drag/ExpressionDragContext';
import { StudioGraphStore } from '@/features/studio/core/graphStore';
import { StudioRuntimeDataProvider, type StudioRuntimeDataState } from '@/features/studio/core/runtimeData';
import { useStudioModuleState } from './useStudioModuleState';
import { type StudioQueryState } from './query/useStudioQueryState';
import { type StudioRuntimeState } from './runtime/useStudioRuntimeState';
import { type StudioUiState } from '@/features/studio/core/studioUiState';

const StudioGraphContext = createContext<StudioGraphStore | null>(null);
const StudioUiContext = createContext<StudioUiState | null>(null);
const StudioRuntimeContext = createContext<StudioRuntimeState | null>(null);
const StudioQueryContext = createContext<StudioQueryState | null>(null);

function useRequiredStudioContext<T>(
  context: React.Context<T | null>,
  name: string,
) {
  const value = useContext(context);
  if (!value) {
    throw new Error(`${name} must be used within a StudioProvider`);
  }

  return value;
}

export function useStudioGraph() {
  return useRequiredStudioContext(StudioGraphContext, 'useStudioGraph');
}

export function useStudioUi() {
  return useRequiredStudioContext(StudioUiContext, 'useStudioUi');
}

export function useStudioRuntime() {
  return useRequiredStudioContext(StudioRuntimeContext, 'useStudioRuntime');
}

export function useStudioQuery() {
  return useRequiredStudioContext(StudioQueryContext, 'useStudioQuery');
}

export function StudioProvider({ children, runtimeData, workspaceLifecycle }: { children: React.ReactNode; runtimeData: StudioRuntimeDataState; workspaceLifecycle: WorkspaceLifecycleState }) {
  const { graph, ui, runtime, query } = useStudioModuleState(runtimeData, workspaceLifecycle);

  return (
    <StudioRuntimeDataProvider value={runtimeData}>
      <ExpressionDragProvider>
        <StudioGraphContext.Provider value={graph}>
          <StudioUiContext.Provider value={ui}>
            <StudioRuntimeContext.Provider value={runtime}>
              <StudioQueryContext.Provider value={query}>
                {children}
              </StudioQueryContext.Provider>
            </StudioRuntimeContext.Provider>
          </StudioUiContext.Provider>
        </StudioGraphContext.Provider>
      </ExpressionDragProvider>
    </StudioRuntimeDataProvider>
  );
}