import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStableId } from '../../domain/contracts/shared-identity';
import { initializeStudioNodeRegistry } from './NodeRegistry';
import { createLiteralExpressionSource } from './expression';
import { executeStudioFlow } from '../../application/studio/runtime/executeStudioFlow';
import { getNodeOutputPreview, type StudioNodeQueryContext } from '../../application/studio/query/nodeQueryService';
import type { NodeExecutionSnapshot, StudioNode, StudioNodeDefinition } from './types';
import { studioNodeCatalog } from '../../nodes';

describe('release gate integration', () => {
  beforeEach(() => {
    initializeStudioNodeRegistry(studioNodeCatalog);
  });

  afterEach(() => {
    vi.useRealTimers();
    initializeStudioNodeRegistry([]);
  });

  it('keeps preview and execute payloads aligned for passive parameter providers', async () => {
    vi.useFakeTimers();
    const parameterId = createStableId('symbol', ['params-1', 'speed']);
    const nodes: StudioNode[] = [
      { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
      {
        id: 'params-1',
        type: 'string-params',
        position: { x: 180, y: 0 },
        data: {
          nodeName: 'Params',
          parameters: [{ id: parameterId, name: 'speed', source: createLiteralExpressionSource('2.5', 'number') }],
        },
      },
      { id: 'display-1', type: 'display', position: { x: 360, y: 0 }, data: { truncateAt: 180, expandedByDefault: false, showMeta: false, showSchema: false } },
    ];

    const context: StudioNodeQueryContext = {
      nodes,
      edges: [{ id: 'edge-params-display', channel: 'data', sourceNodeId: 'params-1', sourcePortId: 'params-out', targetNodeId: 'display-1', targetPortId: 'value-in' }],
      nodeSnapshots: {},
      runtimeData: {
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
          resolveSource: () => null,
        },
      },
    };

    const preview = getNodeOutputPreview('params-1', context);
    const snapshots: Record<string, NodeExecutionSnapshot> = {};

    executeStudioFlow({
      documentId: 'doc-gate',
      startNodeId: 'trigger-1',
      nodes,
      edges: [{ id: 'edge-trigger-display', channel: 'control', sourceNodeId: 'trigger-1', sourcePortId: 'flow-out', targetNodeId: 'display-1', targetPortId: 'flow-in' }, ...context.edges],
      resolveStaticFieldAddress: () => null,
      getClassInfoCatalogByBinding: () => null,
      onReset: vi.fn(),
      onNodeStateChange: vi.fn(),
      onNodeSnapshot: (snapshot) => {
        snapshots[snapshot.nodeId] = snapshot;
      },
      stepDelayMs: 0,
    });

    await vi.runAllTimersAsync();

    expect(preview?.['params-out']?.payload).toEqual(snapshots['params-1']?.outputs['params-out']?.payload);
  });

  it('finishes a large linear graph within the release-gate threshold', async () => {
    vi.useFakeTimers();

    const noopNode: StudioNodeDefinition = {
      manifest: {
        type: 'release-gate-noop',
        typeVersion: 1,
        family: 'control',
        displayName: 'Noop',
        description: 'Release gate noop node',
        category: 'Test',
        inputs: [{ key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' }],
        outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [],
        execute: () => ({ state: 'success', outputs: {} }),
      },
      CanvasComponent: () => null,
    };

    initializeStudioNodeRegistry([...studioNodeCatalog, noopNode]);

    const nodes: StudioNode[] = [{ id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} }];
    const edges = [] as Array<{ id: string; channel: 'control'; sourceNodeId: string; sourcePortId: string; targetNodeId: string; targetPortId: string }>;
    let previousNodeId = 'trigger-1';
    for (let index = 0; index < 250; index += 1) {
      const nodeId = `noop-${index}`;
      nodes.push({ id: nodeId, type: 'release-gate-noop', position: { x: index * 24, y: 0 }, data: {} });
      edges.push({ id: `edge-${index}`, channel: 'control', sourceNodeId: previousNodeId, sourcePortId: 'flow-out', targetNodeId: nodeId, targetPortId: 'flow-in' });
      previousNodeId = nodeId;
    }

    const startedAt = performance.now();
    executeStudioFlow({
      documentId: 'doc-perf',
      startNodeId: 'trigger-1',
      nodes,
      edges,
      onReset: vi.fn(),
      onNodeStateChange: vi.fn(),
      onNodeSnapshot: vi.fn(),
      stepDelayMs: 0,
    });

    await vi.runAllTimersAsync();
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(1500);
  });
});