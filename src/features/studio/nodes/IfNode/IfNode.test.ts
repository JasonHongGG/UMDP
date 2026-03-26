import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInputExpressionSource, createLiteralExpressionSource } from '@/features/studio/core/expression';
import { executeStudioFlow } from '@/features/studio/application/runtime/executeStudioFlow';
import { initializeStudioNodeRegistry } from '@/features/studio/core/NodeRegistry';
import { getNodeQueryState, type StudioNodeQueryContext } from '@/features/studio/application/query/nodeQueryService';
import { createEnvelope, GENERIC_JSON_SCHEMA } from '@/features/studio/core/contracts';
import type { StudioRuntimeDataState } from '@/features/studio/core/runtimeData';
import type { StudioNodeDefinition } from '@/features/studio/core/types';
import type { IfNodeQueryState } from '@/domain/studio/contracts';
import IfNodeDef from './IfNode';

function createRuntimeData(): StudioRuntimeDataState {
  return {
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
  };
}

function createPassiveSourceDefinition(type: string, payload: unknown): StudioNodeDefinition {
  return {
    manifest: {
      type,
      typeVersion: 1,
      family: 'data',
      displayName: type,
      description: 'Passive test source',
      category: 'Test',
      inputs: [],
      outputs: [{ key: 'json-out', displayName: 'Json Out', direction: 'output', channel: 'data', cardinality: 'single', dataType: GENERIC_JSON_SCHEMA.id }],
      preview: {
        mode: 'supported',
      },
      parameters: [],
    },
    icon: () => null,
    buildQueryOutputs: () => ({
      'json-out': createEnvelope(GENERIC_JSON_SCHEMA, payload),
    }),
    executionContract: {
      validate: () => [],
      execute: () => ({
        state: 'success',
        outputs: {
          'json-out': createEnvelope(GENERIC_JSON_SCHEMA, payload),
        },
      }),
    },
    CanvasComponent: () => null,
  };
}

describe('IfNode', () => {
  beforeEach(() => {
    initializeStudioNodeRegistry([
      createPassiveSourceDefinition('stats-a', { hp: 50, maxHp: 25, name: 'Boss' }),
      createPassiveSourceDefinition('stats-b', { threshold: 40, targetName: 'Bo' }),
      IfNodeDef,
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    initializeStudioNodeRegistry([]);
  });

  it('builds query state for expression-vs-expression comparisons', () => {
    const context: StudioNodeQueryContext = {
      nodes: [
        { id: 'stats-a-1', type: 'stats-a', position: { x: 0, y: 0 }, data: {} },
        { id: 'stats-b-1', type: 'stats-b', position: { x: 120, y: 0 }, data: {} },
        {
          id: 'if-1',
          type: 'if',
          position: { x: 240, y: 0 },
          data: {
            leftSource: createInputExpressionSource('stats-a-1', 'json-out', ['hp'], 'stats-a.hp'),
            operator: 'gt',
            rightMode: 'expression',
            rightSource: createInputExpressionSource('stats-b-1', 'json-out', ['threshold'], 'stats-b.threshold'),
          },
        },
      ],
      edges: [
        { id: 'edge-a', channel: 'data', sourceNodeId: 'stats-a-1', sourcePortId: 'json-out', targetNodeId: 'if-1', targetPortId: 'value-in' },
        { id: 'edge-b', channel: 'data', sourceNodeId: 'stats-b-1', sourcePortId: 'json-out', targetNodeId: 'if-1', targetPortId: 'value-in' },
      ],
      nodeSnapshots: {},
      runtimeData: createRuntimeData(),
    };

    const queryState = getNodeQueryState<IfNodeQueryState>('if-1', context);

    expect(queryState).toMatchObject({
      kind: 'resolved',
      predictedResult: true,
      summary: 'stats-a.hp greater than stats-b.threshold',
      leftPreview: { value: 50, scalarKind: 'number' },
      rightPreview: { value: 40, scalarKind: 'number' },
    });
  });

  it('keeps plain string payloads out of address comparison mode', () => {
    const context: StudioNodeQueryContext = {
      nodes: [
        { id: 'stats-a-1', type: 'stats-a', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'if-1',
          type: 'if',
          position: { x: 240, y: 0 },
          data: {
            leftSource: createInputExpressionSource('stats-a-1', 'json-out', ['name'], 'stats-a.name'),
            operator: 'contains',
            rightMode: 'literal',
            rightSource: createLiteralExpressionSource('ea', 'string'),
          },
        },
      ],
      edges: [
        { id: 'edge-a', channel: 'data', sourceNodeId: 'stats-a-1', sourcePortId: 'json-out', targetNodeId: 'if-1', targetPortId: 'value-in' },
      ],
      nodeSnapshots: {},
      runtimeData: createRuntimeData(),
    };

    const queryState = getNodeQueryState<IfNodeQueryState>('if-1', context);
    expect(queryState).not.toBeNull();

    expect(queryState).toMatchObject({
      kind: 'resolved',
      predictedResult: false,
      leftPreview: { value: 'Boss', scalarKind: 'string' },
      rightPreview: { value: 'ea', scalarKind: 'string' },
    });
    expect(queryState!.availableOperators.map((operator) => operator.value)).toContain('contains');
  });

  it('routes runtime execution to the true branch based on resolved operands', async () => {
    vi.useFakeTimers();

    const trueSpy = vi.fn(() => ({ state: 'success' as const, outputs: {} }));
    const falseSpy = vi.fn(() => ({ state: 'success' as const, outputs: {} }));

    initializeStudioNodeRegistry([
      {
        manifest: {
          type: 'trigger',
          typeVersion: 1,
          family: 'control',
          displayName: 'Trigger',
          description: 'Flow start',
          category: 'Test',
          inputs: [],
          outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
          parameters: [],
        },
        icon: () => null,
        executionContract: { validate: () => [], execute: () => ({ state: 'success', outputs: {} }) },
        CanvasComponent: () => null,
      },
      createPassiveSourceDefinition('stats-a', { hp: 50 }),
      IfNodeDef,
      {
        manifest: {
          type: 'true-sink',
          typeVersion: 1,
          family: 'control',
          displayName: 'True Sink',
          description: 'True sink',
          category: 'Test',
          inputs: [{ key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' }],
          outputs: [],
          parameters: [],
        },
        icon: () => null,
        executionContract: { validate: () => [], execute: trueSpy },
        CanvasComponent: () => null,
      },
      {
        manifest: {
          type: 'false-sink',
          typeVersion: 1,
          family: 'control',
          displayName: 'False Sink',
          description: 'False sink',
          category: 'Test',
          inputs: [{ key: 'flow-in', displayName: 'Flow In', direction: 'input', channel: 'control', cardinality: 'single' }],
          outputs: [],
          parameters: [],
        },
        icon: () => null,
        executionContract: { validate: () => [], execute: falseSpy },
        CanvasComponent: () => null,
      },
    ]);

    executeStudioFlow({
      startNodeId: 'trigger-1',
      nodes: [
        { id: 'trigger-1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
        { id: 'stats-a-1', type: 'stats-a', position: { x: 120, y: 0 }, data: {} },
        {
          id: 'if-1',
          type: 'if',
          position: { x: 240, y: 0 },
          data: {
            leftSource: createInputExpressionSource('stats-a-1', 'json-out', ['hp'], 'stats-a.hp'),
            operator: 'gt',
            rightMode: 'literal',
            rightSource: createLiteralExpressionSource('0', 'number'),
          },
        },
        { id: 'true-1', type: 'true-sink', position: { x: 360, y: 0 }, data: {} },
        { id: 'false-1', type: 'false-sink', position: { x: 360, y: 80 }, data: {} },
      ],
      edges: [
        { id: 'edge-trigger-if', channel: 'control', sourceNodeId: 'trigger-1', sourcePortId: 'flow-out', targetNodeId: 'if-1', targetPortId: 'flow-in' },
        { id: 'edge-stats-if', channel: 'data', sourceNodeId: 'stats-a-1', sourcePortId: 'json-out', targetNodeId: 'if-1', targetPortId: 'value-in' },
        { id: 'edge-if-true', channel: 'control', sourceNodeId: 'if-1', sourcePortId: 'true-out', targetNodeId: 'true-1', targetPortId: 'flow-in' },
        { id: 'edge-if-false', channel: 'control', sourceNodeId: 'if-1', sourcePortId: 'false-out', targetNodeId: 'false-1', targetPortId: 'flow-in' },
      ],
      onReset: vi.fn(),
      onNodeStateChange: vi.fn(),
      onNodeSnapshot: vi.fn(),
      stepDelayMs: 25,
    });

    await vi.runAllTimersAsync();

    expect(trueSpy).toHaveBeenCalledTimes(1);
    expect(falseSpy).not.toHaveBeenCalled();
  });
});