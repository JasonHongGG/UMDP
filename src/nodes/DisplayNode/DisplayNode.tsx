import React from 'react';
import { Eye } from 'lucide-react';
import { createFlowPort, createJsonPort, GENERIC_JSON_SCHEMA } from '../../core/studio/contracts';
import { defineStudioNode } from '../../core/studio/NodeRegistry';
import type { INodeDefinition, IPort, StudioNodeRuntimeState, NodeExecutionOutputMap } from '../../core/studio/types';
import { getIncomingEdges } from '../../core/studio/runtimeGraph';
import type { DisplayNodeQueryState, NodeQueryIssue } from '../../domain/studio/contracts';
import { parseDisplayNodeDocumentState } from '../../domain/studio/contracts';
import type { StudioNodeQueryContext } from '../../core/studio/queryTypes';
import { materializeNodeQuerySnapshot } from '../../core/studio/graphInterpreter';
import DisplayNodeCanvas from './DisplayNodeCanvas';
import { createDisplayNodeData, createPayloadSummary, hydrateDisplayNodeData, toDisplayNodeDocumentState, type DisplayNodeData } from './displayNodeModel';

const DISPLAY_INPUTS: IPort[] = [
  createFlowPort('flow-in', 'Flow In', 'Control input for runtime execution.', { direction: 'input', required: false }),
  createJsonPort('payload-in', 'Payload In', GENERIC_JSON_SCHEMA, 'Any upstream JSON envelope to observe on the canvas.', {
    direction: 'input',
    required: true,
  }),
];

const DISPLAY_OUTPUTS: IPort[] = [
  createFlowPort('flow-out', 'Flow Out', 'Passes control to downstream runtime nodes after the payload has been observed.', {
    cardinality: 'multiple',
  }),
];

function createQueryIssue(code: string, message: string, severity: NodeQueryIssue['severity'] = 'info'): NodeQueryIssue {
  return {
    severity,
    code,
    message,
    targetPortId: 'payload-in',
  };
}

function buildDisplayQueryState(
  node: import('../../core/studio/types').StudioNode<DisplayNodeData>,
  context: StudioNodeQueryContext,
): DisplayNodeQueryState {
  const incomingDataEdges = context.edges.filter((edge) => edge.targetNodeId === node.id && edge.channel === 'data');
  const boundEdge = incomingDataEdges.find((edge) => edge.targetPortId === 'payload-in');

  if (!boundEdge) {
    if (incomingDataEdges.length > 0) {
      return {
        kind: 'port-mismatch',
        sourceKind: 'preview',
        sourceNodeId: null,
        sourcePortId: null,
        envelope: null,
        summary: null,
        issues: [createQueryIssue('query.display.port-mismatch', 'Incoming data is connected, but not to Payload In.', 'warning')],
      };
    }

    return {
      kind: 'missing-edge',
      sourceKind: 'preview',
      sourceNodeId: null,
      sourcePortId: null,
      envelope: null,
      summary: null,
      issues: [createQueryIssue('query.display.missing-edge', 'Connect a data output to Payload In to preview the result.')],
    };
  }

  const upstreamSnapshot = materializeNodeQuerySnapshot(boundEdge.sourceNodeId, context, new Set<string>());
  const envelope = upstreamSnapshot?.outputs[boundEdge.sourcePortId] ?? null;

  if (!envelope) {
    return {
      kind: 'payload-unavailable',
      sourceKind: 'preview',
      sourceNodeId: boundEdge.sourceNodeId,
      sourcePortId: boundEdge.sourcePortId,
      envelope: null,
      summary: null,
      issues: [createQueryIssue('query.display.payload-unavailable', 'The upstream payload is not available yet.', 'warning')],
    };
  }

  return {
    kind: 'resolved',
    sourceKind: 'preview',
    sourceNodeId: boundEdge.sourceNodeId,
    sourcePortId: boundEdge.sourcePortId,
    envelope,
    summary: createPayloadSummary(envelope.payload, node.data.truncateAt),
    issues: [],
  };
}

const DisplayNodeDefinition: INodeDefinition<DisplayNodeData> = {
  manifest: {
    type: 'display',
    typeVersion: 1,
    family: 'runtime',
    displayName: 'Display',
    description: 'Observe runtime or preview payloads directly on the canvas.',
    category: 'Runtime',
    tags: ['display', 'inspect', 'debug', 'output'],
    inputs: DISPLAY_INPUTS.map((port) => ({
      key: port.id,
      displayName: port.label,
      direction: 'input',
      channel: port.channel,
      cardinality: port.cardinality,
      dataType: port.dataType,
      required: port.required,
    })),
    outputs: DISPLAY_OUTPUTS.map((port) => ({
      key: port.id,
      displayName: port.label,
      direction: 'output',
      channel: port.channel,
      cardinality: port.cardinality,
      dataType: port.dataType,
    })),
    parameters: [
      {
        name: 'expandedByDefault',
        displayName: 'Expanded by Default',
        valueType: 'boolean',
        expressionSupport: 'disabled',
        defaultValue: false,
        ui: {
          section: 'Display',
          helperText: 'Expand the payload section when the node first renders.',
        },
      },
      {
        name: 'truncateAt',
        displayName: 'Truncate Length',
        valueType: 'number',
        expressionSupport: 'disabled',
        defaultValue: 180,
        ui: {
          section: 'Display',
          helperText: 'Maximum characters to show in compact summary text.',
        },
      },
      {
        name: 'showSchema',
        displayName: 'Show Schema',
        valueType: 'boolean',
        expressionSupport: 'disabled',
        defaultValue: true,
        ui: {
          section: 'Display',
        },
      },
      {
        name: 'showMeta',
        displayName: 'Show Meta',
        valueType: 'boolean',
        expressionSupport: 'disabled',
        defaultValue: true,
        ui: {
          section: 'Display',
        },
      },
    ],
  },
  icon: Eye,
  createInitialData: createDisplayNodeData,
  resolveDisplayName: (data) => data.nodeName?.trim() || undefined,
  hydrateData: (instance, baseData) => hydrateDisplayNodeData(baseData, instance),
  dehydrateData: (data) => ({
    displayName: data.nodeName?.trim() || undefined,
    parameters: {
      expandedByDefault: data.expandedByDefault,
      truncateAt: data.truncateAt,
      showSchema: data.showSchema,
      showMeta: data.showMeta,
    },
    bindings: {},
    documentState: toDisplayNodeDocumentState(data),
  }),
  createRuntimeState: (node) => ({
    displayName: node.data.nodeName?.trim() || undefined,
    parameters: {
      expandedByDefault: node.data.expandedByDefault,
      truncateAt: node.data.truncateAt,
      showSchema: node.data.showSchema,
      showMeta: node.data.showMeta,
    },
    bindings: {},
    documentState: toDisplayNodeDocumentState(node.data),
  } satisfies StudioNodeRuntimeState),
  buildQueryState: buildDisplayQueryState,
  executionContract: {
    validate: ({ resolvedInputs }) => {
      const payloads = resolvedInputs['payload-in'] ?? [];
      if (payloads.length === 0) {
        return [{
          severity: 'error',
          code: 'display.payload.missing',
          message: 'Display node requires an incoming payload on Payload In.',
          target: 'payload-in',
        }];
      }

      return [];
    },
    execute: ({ resolvedInputs }) => {
      const payloads = resolvedInputs['payload-in'] ?? [];
      if (payloads.length === 0) {
        return {
          state: 'error',
          outputs: {} as NodeExecutionOutputMap,
          issues: [{
            severity: 'error',
            code: 'display.payload.missing',
            message: 'Display node requires an incoming payload on Payload In.',
            target: 'payload-in',
          }],
        };
      }

      return {
        state: 'success',
        outputs: {},
      };
    },
  },
  CanvasComponent: DisplayNodeCanvas,
};

export const DisplayNodeDef = defineStudioNode(DisplayNodeDefinition);

export default DisplayNodeDef;