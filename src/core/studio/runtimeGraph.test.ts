import { afterEach, describe, expect, it } from 'vitest';
import { initializeStudioNodeRegistry } from './NodeRegistry';
import { createEnvelope, GENERIC_JSON_SCHEMA } from './contracts';
import { createNodeExecutionContext, getIncomingJsonInputs, getOutgoingFlowEdges, validateNodeExecution } from './runtimeGraph';
import { StudioNodeDefinition } from './types';
import type { StudioEdge } from './types';

function registerRuntimeGraphTestNodes() {
  initializeStudioNodeRegistry([
    {
      manifest: {
        type: 'trigger',
        typeVersion: 1,
        family: 'control',
        displayName: 'Trigger',
        description: 'Test trigger node',
        category: 'Test',
        inputs: [],
        outputs: [
          { key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' },
          { key: 'json-out', displayName: 'Json Out', direction: 'output', channel: 'data', cardinality: 'single', dataType: GENERIC_JSON_SCHEMA.id },
        ],
        parameters: [],
      },
      icon: () => null,
      CanvasComponent: () => null,
    },
    {
      manifest: {
        type: 'source',
        typeVersion: 1,
        family: 'data',
        displayName: 'Source',
        description: 'Test source node',
        category: 'Test',
        inputs: [],
        outputs: [{ key: 'json-out', displayName: 'Json Out', direction: 'output', channel: 'data', cardinality: 'single', dataType: GENERIC_JSON_SCHEMA.id }],
        parameters: [],
      },
      icon: () => null,
      CanvasComponent: () => null,
    },
    {
      manifest: {
        type: 'target',
        typeVersion: 1,
        family: 'data',
        displayName: 'Target',
        description: 'Test target node',
        category: 'Test',
        inputs: [{ key: 'json-in', displayName: 'Json In', direction: 'input', channel: 'data', cardinality: 'single', dataType: GENERIC_JSON_SCHEMA.id }],
        outputs: [],
        parameters: [],
      },
      icon: () => null,
      CanvasComponent: () => null,
    },
  ]);
}

describe('runtimeGraph helpers', () => {
  afterEach(() => {
    initializeStudioNodeRegistry([]);
  });

  it('collects only flow edges for downstream execution scheduling', () => {
    registerRuntimeGraphTestNodes();

    const nodes = [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: {},
      },
    ];
    const edges: StudioEdge[] = [
      {
        id: 'edge-1',
        channel: 'control',
        sourceNodeId: 'trigger-1',
        sourcePortId: 'flow-out',
        targetNodeId: 'next-1',
        targetPortId: 'flow-in',
      },
      {
        id: 'edge-2',
        channel: 'data',
        sourceNodeId: 'trigger-1',
        sourcePortId: 'json-out',
        targetNodeId: 'next-1',
        targetPortId: 'json-in',
      },
    ];

    expect(getOutgoingFlowEdges('trigger-1', nodes, edges)).toEqual([edges[0]]);
  });

  it('builds incoming JSON inputs from execution snapshots', () => {
    registerRuntimeGraphTestNodes();

    const sourceNode = {
      id: 'source-1',
      type: 'source',
      position: { x: 0, y: 0 },
      data: {},
    };
    const targetNode = {
      id: 'target-1',
      type: 'target',
      position: { x: 120, y: 0 },
      data: {},
    };
    const snapshots = {
      'source-1': {
        nodeId: 'source-1',
        state: 'success' as const,
        inputs: {},
        outputs: {
          'json-out': createEnvelope(GENERIC_JSON_SCHEMA, { ok: true }),
        },
      },
    };
    const edges: StudioEdge[] = [
      {
        id: 'edge-1',
        channel: 'data',
        sourceNodeId: 'source-1',
        sourcePortId: 'json-out',
        targetNodeId: 'target-1',
        targetPortId: 'json-in',
      },
    ];

    expect(getIncomingJsonInputs('target-1', [sourceNode, targetNode], edges, snapshots)).toEqual({
      'json-in': [snapshots['source-1'].outputs['json-out']],
    });
  });

  it('delegates execution validation to the node definition contract', () => {
    const node = {
      id: 'guarded-1',
      type: 'guarded',
      position: { x: 0, y: 0 },
      data: {},
    };
    const definition: StudioNodeDefinition = {
      manifest: {
        type: 'guarded',
        typeVersion: 1,
        family: 'control',
        displayName: 'Guarded',
        description: 'Guarded test node',
        category: 'Test',
        inputs: [],
        outputs: [],
        parameters: [],
      },
      icon: () => null,
      executionContract: {
        validate: () => [{ severity: 'error', code: 'dependency.missing', message: 'Missing dependency.' }],
        execute: () => ({ state: 'success', outputs: {} }),
      },
      CanvasComponent: () => null,
    };

    initializeStudioNodeRegistry([definition]);

  const registeredContext = createNodeExecutionContext('studio-document', 'guarded-1', [node], [], {});

    expect(registeredContext).not.toBeNull();
    expect(validateNodeExecution(registeredContext!, definition)).toEqual([{ severity: 'error', code: 'dependency.missing', message: 'Missing dependency.' }]);
  });
});
