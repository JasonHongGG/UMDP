import { describe, expect, it, vi } from 'vitest';
import type { StudioNodeCatalog } from '@/features/studio/core/catalog/StudioNodeCatalog';
import { StudioNodeCatalog as StudioNodeCatalogImpl } from '@/features/studio/core/catalog/StudioNodeCatalog';
import type { StudioRuntimeDataState } from '@/features/studio/core/runtimeData';
import type { StudioEdge, StudioNode, StudioNodeDefinition } from '@/features/studio/core/types';
import { collectStudioNodeReconciliations, observeStudioNodes } from './StudioNodeLifecycle';

const runtimeData = {
  classes: [],
  classCatalog: {
    createNodeRequest: () => null,
    getByBinding: () => null,
    resolveStaticFieldAddress: () => null,
    resolveMemberValues: () => undefined,
    ensureOverlayLoaded: () => undefined,
    ensureInstanceFieldsLoaded: () => undefined,
  },
  expressions: {
    resolveSource: () => undefined,
  },
} satisfies StudioRuntimeDataState;

const nodes: StudioNode[] = [{ id: 'node-1', type: 'display', position: { x: 10, y: 20 }, data: {} }];
const edges: StudioEdge[] = [];

function createCatalog(nodeDef: StudioNodeDefinition): StudioNodeCatalog {
  const catalog = new StudioNodeCatalogImpl();
  catalog.register(nodeDef);
  return catalog;
}

describe('StudioNodeLifecycle', () => {
  it('runs node observers outside StudioContext', () => {
    const observeGraphNode = vi.fn();
    const catalog = createCatalog({
      manifest: { type: 'display', typeVersion: 1, family: 'data', displayName: 'Display', description: '', category: 'Data', inputs: [], outputs: [], parameters: [], preview: { mode: 'supported' } },
      icon: () => null,
      CanvasComponent: () => null,
      observeGraphNode,
    });

    observeStudioNodes({ catalog, nodes, edges, runtimeData });

    expect(observeGraphNode).toHaveBeenCalledTimes(1);
    expect(observeGraphNode).toHaveBeenCalledWith(nodes[0], expect.objectContaining({ nodes, edges, runtimeData }));
  });

  it('collects only non-empty reconciliation patches', () => {
    const catalog = createCatalog({
      manifest: { type: 'display', typeVersion: 1, family: 'data', displayName: 'Display', description: '', category: 'Data', inputs: [], outputs: [], parameters: [], preview: { mode: 'supported' } },
      icon: () => null,
      CanvasComponent: () => null,
      reconcileData: () => ({ nodeName: 'Renamed' }),
    });

    expect(collectStudioNodeReconciliations({ catalog, nodes, edges, runtimeData })).toEqual([
      { nodeId: 'node-1', patch: { nodeName: 'Renamed' } },
    ]);
  });
});