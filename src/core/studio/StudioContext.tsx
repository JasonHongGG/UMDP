import React, { createContext, useContext } from 'react';
import { StudioGraphStore, useStudioGraphStore } from './graphStore';
import { StudioUiState, useStudioUiState } from './useStudioUiState';
import { StudioRuntimeState, useStudioRuntimeState } from './useStudioRuntimeState';

const StudioGraphContext = createContext<StudioGraphStore | null>(null);
const StudioUiContext = createContext<StudioUiState | null>(null);
const StudioRuntimeContext = createContext<StudioRuntimeState | null>(null);

export function useStudioGraph() {
  const context = useContext(StudioGraphContext);
  if (!context) {
    throw new Error('useStudioGraph must be used within a StudioProvider');
  }

  return context;
}

export function useStudioUi() {
  const context = useContext(StudioUiContext);
  if (!context) {
    throw new Error('useStudioUi must be used within a StudioProvider');
  }

  return context;
}

export function useStudioRuntime() {
  const context = useContext(StudioRuntimeContext);
  if (!context) {
    throw new Error('useStudioRuntime must be used within a StudioProvider');
  }

  return context;
}

export function useStudio() {
  return {
    ...useStudioGraph(),
    ...useStudioUi(),
    ...useStudioRuntime(),
  };
}

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const graphStore = useStudioGraphStore();
  const { nodes, edges, document, connectPorts } = graphStore;
  const uiValue = useStudioUiState({ nodes, edges, connectPorts });
  const runtimeValue = useStudioRuntimeState(document, nodes, edges);

  return (
    <StudioGraphContext.Provider value={graphStore}>
      <StudioUiContext.Provider value={uiValue}>
        <StudioRuntimeContext.Provider value={runtimeValue}>
          {children}
        </StudioRuntimeContext.Provider>
      </StudioUiContext.Provider>
    </StudioGraphContext.Provider>
  );
}