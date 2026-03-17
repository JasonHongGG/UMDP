import { describe, expect, it } from 'vitest';
import { validateConnection } from './connectionPolicy';
import { createFlowPort, createJsonPort, GENERIC_JSON_SCHEMA } from './contracts';

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
  {
    id: 'class-1',
    type: 'class-ref',
    position: { x: 120, y: 0 },
    data: {
      inputs: [createFlowPort('flow-in', 'Flow In'), createJsonPort('instance-in', 'Instance In', GENERIC_JSON_SCHEMA)],
      outputs: [],
    },
  },
];

describe('connectionPolicy', () => {
  it('rejects connections that do not start from an output handle', () => {
    const result = validateConnection({
      nodeId: 'class-1',
      portId: 'flow-in',
      portType: 'flow',
      handleType: 'target',
    }, {
      nodeId: 'trigger-1',
      portId: 'flow-out',
      portType: 'flow',
      handleType: 'source',
    }, nodes, []);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Connections must start from an output port.');
  });

  it('rejects incompatible handle directions and port types', () => {
    const wrongDirection = validateConnection({
      nodeId: 'trigger-1',
      portId: 'flow-out',
      portType: 'flow',
      handleType: 'source',
    }, {
      nodeId: 'class-1',
      portId: 'instance-in',
      portType: 'json',
      handleType: 'target',
    }, nodes, []);

    expect(wrongDirection.valid).toBe(false);
    expect(wrongDirection.reason).toBe('Port types are incompatible.');
  });

  it('marks the previous inbound edge for replacement when reconnecting the same target port', () => {
    const result = validateConnection({
      nodeId: 'trigger-1',
      portId: 'flow-out',
      portType: 'flow',
      handleType: 'source',
    }, {
      nodeId: 'class-1',
      portId: 'flow-in',
      portType: 'flow',
      handleType: 'target',
    }, nodes, [{
      id: 'edge-1',
      sourceNodeId: 'other-1',
      sourcePortId: 'flow-out',
      targetNodeId: 'class-1',
      targetPortId: 'flow-in',
    }]);

    expect(result).toEqual({
      valid: true,
      replaceEdgeIds: ['edge-1'],
    });
  });
});