import { describe, expect, it } from 'vitest';
import { createEnvelope, createFlowPort, createJsonPort, GENERIC_JSON_SCHEMA } from './contracts';
import { createNodeExecutionContext, getIncomingJsonInputs, getOutgoingFlowEdges, validateNodeExecution } from './runtimeGraph';
import { StudioNodeDefinition } from './types';

describe('runtimeGraph helpers', () => {
  it('collects only flow edges for downstream execution scheduling', () => {
    const nodes = [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: {
          inputs: [],
          outputs: [createFlowPort('flow-out', 'Flow Out'), createJsonPort('json-out', 'Json Out', GENERIC_JSON_SCHEMA)],
        },
      },
    ];
    const edges = [
      {
        id: 'edge-1',
        sourceNodeId: 'trigger-1',
        sourcePortId: 'flow-out',
        targetNodeId: 'next-1',
        targetPortId: 'flow-in',
      },
      {
        id: 'edge-2',
        sourceNodeId: 'trigger-1',
        sourcePortId: 'json-out',
        targetNodeId: 'next-1',
        targetPortId: 'json-in',
      },
    ];

    expect(getOutgoingFlowEdges('trigger-1', nodes, edges)).toEqual([edges[0]]);
  });

  it('builds incoming JSON inputs from execution snapshots', () => {
    const sourceNode = {
      id: 'source-1',
      type: 'source',
      position: { x: 0, y: 0 },
      data: {
        inputs: [],
        outputs: [createJsonPort('json-out', 'Json Out', GENERIC_JSON_SCHEMA)],
      },
    };
    const targetNode = {
      id: 'target-1',
      type: 'target',
      position: { x: 120, y: 0 },
      data: {
        inputs: [createJsonPort('json-in', 'Json In', GENERIC_JSON_SCHEMA)],
        outputs: [],
      },
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
    const edges = [
      {
        id: 'edge-1',
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
      data: {
        inputs: [],
        outputs: [],
      },
    };
    const context = createNodeExecutionContext('guarded-1', [node], [], {});
    const definition: StudioNodeDefinition = {
      typeId: 'guarded',
      displayName: 'Guarded',
      description: 'Guarded test node',
      icon: () => null,
      defaultInputs: [],
      defaultOutputs: [],
      validateExecution: () => ({ valid: false, error: 'Missing dependency.' }),
      CanvasComponent: () => null,
    };

    expect(context).not.toBeNull();
    expect(validateNodeExecution(context!, definition)).toEqual({ valid: false, error: 'Missing dependency.' });
  });
});
