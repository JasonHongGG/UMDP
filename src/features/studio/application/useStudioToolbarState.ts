import { useStudioGraph } from '@/features/studio/application/StudioModuleContext';

export function useStudioToolbarState() {
  const graph = useStudioGraph();

  return {
    nodes: graph.nodes,
    edges: graph.edges,
    canUndo: graph.canUndo,
    canRedo: graph.canRedo,
    hasUnsavedChanges: graph.hasUnsavedChanges,
    hasSavedWorkflow: graph.hasSavedWorkflow,
    lastSavedAt: graph.lastSavedAt,
    lastLoadedAt: graph.lastLoadedAt,
    lastAutosavedAt: graph.lastAutosavedAt,
    undo: graph.undo,
    redo: graph.redo,
    saveWorkflow: graph.saveWorkflow,
    loadSavedWorkflow: graph.loadSavedWorkflow,
    clearWorkflow: graph.clearWorkflow,
  };
}