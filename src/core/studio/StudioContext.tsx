import React, { createContext, useContext, useEffect } from 'react';
import type { GraphDocument } from '../../domain/studio/contracts';
import { getRegisteredStudioNodeCatalog } from './catalog/studioNodeCatalogRuntime';
import { ExpressionDragProvider } from './drag/ExpressionDragContext';
import { StudioGraphStore, useStudioGraphStore } from './graphStore';
import { StudioRuntimeDataProvider, type StudioRuntimeDataState } from './runtimeData';
import type { StudioEdge, StudioNode } from './types';
import { type StudioQueryState, useStudioQueryState } from './studioQueryState';
import { type StudioRuntimeState, useStudioRuntimeState } from './studioRuntimeState';
import { type StudioUiState, useStudioUiState } from './studioUiState';

const StudioGraphContext = createContext<StudioGraphStore | null>(null);
const StudioUiContext = createContext<StudioUiState | null>(null);
const StudioRuntimeContext = createContext<StudioRuntimeState | null>(null);
const StudioQueryContext = createContext<StudioQueryState | null>(null);

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

export function useStudioQuery() {
  const context = useContext(StudioQueryContext);
  if (!context) {
    throw new Error('useStudioQuery must be used within a StudioProvider');
  }

  return context;
}

export function useStudio() {
  return {
    ...useStudioGraph(),
    ...useStudioUi(),
    ...useStudioRuntime(),
    ...useStudioQuery(),
  };
}

export function StudioProvider({ children, runtimeData }: { children: React.ReactNode; runtimeData: StudioRuntimeDataState }) {
  const catalog = getRegisteredStudioNodeCatalog();
  const graphStore = useStudioGraphStore(catalog);
  const { nodes, edges, document, connectPorts } = graphStore;
  const uiValue = useStudioUiState({ nodes, edges, connectPorts });
  const runtimeValue = useStudioRuntimeState(document, nodes, edges, runtimeData);
  const queryValue = useStudioQueryState(nodes, edges, runtimeValue.nodeSnapshots, runtimeData);

  useEffect(() => {
    for (const node of nodes) {
      const nodeDef = catalog.get(node.type);
      nodeDef?.observeGraphNode?.(node as never, { nodes, edges, runtimeData });
    }
  }, [catalog, edges, nodes, runtimeData]);

  useEffect(() => {
    for (const node of nodes) {
      const nodeDef = catalog.get(node.type);
      if (!nodeDef?.reconcileData) {
        continue;
      }

      const patch = nodeDef.reconcileData(node as never, { nodes, edges, runtimeData });
      if (!patch || Object.keys(patch).length === 0) {
        continue;
      }

      graphStore.updateNodeData(node.id, patch);
    }
  }, [catalog, edges, graphStore, nodes, runtimeData]);

  return (
    <StudioRuntimeDataProvider value={runtimeData}>
      <ExpressionDragProvider>
        <StudioGraphContext.Provider value={graphStore}>
          <StudioUiContext.Provider value={uiValue}>
            <StudioRuntimeContext.Provider value={runtimeValue}>
              <StudioQueryContext.Provider value={queryValue}>
                {children}
              </StudioQueryContext.Provider>
            </StudioRuntimeContext.Provider>
          </StudioUiContext.Provider>
        </StudioGraphContext.Provider>
      </ExpressionDragProvider>
    </StudioRuntimeDataProvider>
  );
}