import type { WorkspaceLifecycleState } from '@/shared/contracts';
import { getRegisteredStudioNodeCatalog } from '@/features/studio/core/catalog/studioNodeCatalogRuntime';
import { useStudioGraphStore } from '@/features/studio/core/graphStore';
import type { StudioRuntimeDataState } from '@/features/studio/core/runtimeData';
import { useStudioUiState } from '@/features/studio/core/studioUiState';
import { useStudioEngineState } from './engine/useStudioEngineState';
import { useStudioNodeLifecycle } from './lifecycle/StudioNodeLifecycle';
import { useStudioQueryState } from './query/useStudioQueryState';
import { useStudioRuntimeState } from './runtime/useStudioRuntimeState';

export function useStudioModuleState(runtimeData: StudioRuntimeDataState, workspaceLifecycle: WorkspaceLifecycleState) {
  const catalog = getRegisteredStudioNodeCatalog();
  const graph = useStudioGraphStore(catalog);
  const engine = useStudioEngineState();
  const { nodes, edges, document, connectPorts } = graph;
  const ui = useStudioUiState({ nodes, edges, connectPorts }, engine);
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