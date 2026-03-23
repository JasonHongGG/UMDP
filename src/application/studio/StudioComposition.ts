import type { WorkspaceLifecycleState } from '../../shared/contracts';
import { getRegisteredStudioNodeCatalog } from '../../core/studio/catalog/studioNodeCatalogRuntime';
import { useStudioGraphStore } from '../../core/studio/graphStore';
import type { StudioRuntimeDataState } from '../../core/studio/runtimeData';
import { useStudioUiState } from '../../core/studio/studioUiState';
import { useStudioNodeLifecycle } from './lifecycle/StudioNodeLifecycle';
import { useStudioQueryState } from './query/useStudioQueryState';
import { useStudioRuntimeState } from './runtime/useStudioRuntimeState';

export function useStudioComposition(runtimeData: StudioRuntimeDataState, workspaceLifecycle: WorkspaceLifecycleState) {
  const catalog = getRegisteredStudioNodeCatalog();
  const graph = useStudioGraphStore(catalog);
  const { nodes, edges, document, connectPorts } = graph;
  const ui = useStudioUiState({ nodes, edges, connectPorts });
  const runtime = useStudioRuntimeState(document, nodes, edges, runtimeData, workspaceLifecycle);
  const query = useStudioQueryState(nodes, edges, runtime.nodeSnapshots, runtimeData);

  useStudioNodeLifecycle({ catalog, nodes, edges, runtimeData }, graph.updateNodeData);

  return {
    graph,
    ui,
    runtime,
    query,
  };
}