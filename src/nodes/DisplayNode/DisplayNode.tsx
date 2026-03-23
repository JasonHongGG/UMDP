import React from 'react';
import { formatHexAddress } from '../../core/addressFormat';
import { Eye } from 'lucide-react';
import {
  createClassInfoEnvelope,
  createFlowPort,
  createJsonPort,
  GENERIC_JSON_SCHEMA,
  type ResolvedMemberRuntimeValue,
} from '../../core/studio/contracts';
import { defineStudioNode } from '../../core/studio/NodeRegistry';
import type {
  IPort,
  NodeExecutionOutputMap,
  StudioNodeDefinition,
  StudioNodeExecutionDefinition,
  StudioNodePresentationDefinition,
  StudioNodeQueryDefinition,
  StudioNodeRuntimeState,
  StudioNodeSerializationDefinition,
} from '../../core/studio/types';
import type { DisplayNodeQueryState, ExpressionSource, NodeQueryIssue, ClassInfoPayload } from '../../domain/studio/contracts';
import type { StudioNodeQueryContext } from '../../core/studio/queryTypes';
import { materializeNodeQuerySnapshot } from '../../core/studio/graphInterpreter';
import type { RuntimeInstanceFieldSnapshot, RuntimeOverlaySnapshot } from '../../domain/analysis/contracts';
import type { ClassBinding, ClassInfoCatalog, ClassInfoSelection } from '../../domain/studio/editor';
import type { StableId } from '../../domain/contracts/shared-identity';
import DisplayNodeCanvas from './DisplayNodeCanvas';
import DisplayNodeEditor from './DisplayNodeEditor';
import {
  buildDisplayAvailableFields,
  createDisplayNodeData,
  hydrateDisplayNodeData,
  resolveDisplaySelectedFields,
  toDisplayNodeDocumentState,
  type DisplayNodeData,
} from './displayNodeModel';
import { getClassInfoPayloadFromValue } from '../CallFunctionNode/callFunctionNodeModel';
import { getStudioRuntimeInstanceFields, getStudioRuntimeStaticFields } from '../../application/studio/runtime/StudioRuntimeBridge';

function createResolvedMemberValueMap(snapshot: RuntimeInstanceFieldSnapshot): Record<string, ResolvedMemberRuntimeValue> {
  return Object.fromEntries(
    snapshot.fields.map((field) => [field.stableId, {
      address: formatHexAddress(field.address),
      value: field.value,
    }]),
  );
}

function deriveClassBindingFromPayload(payload: ClassInfoPayload): ClassBinding | null {
  const runtimeRef = payload.members[0]?.runtimeRef ?? payload.statics[0]?.runtimeRef ?? payload.functions[0]?.runtimeRef;
  if (!runtimeRef) {
    return null;
  }

  return {
    imageStableId: runtimeRef.imageStableId as StableId,
    classStableId: runtimeRef.classStableId as StableId,
    fullName: payload.basic.fullName,
    name: payload.basic.className,
    namespace: payload.basic.namespace,
    imageName: payload.basic.imageName,
  };
}

function createSelectionFromPayload(payload: ClassInfoPayload): ClassInfoSelection {
  return {
    members: payload.members.map((field) => field.runtimeRef.memberStableId as StableId),
    statics: payload.statics.map((field) => field.runtimeRef.memberStableId as StableId),
    functions: payload.functions.map((method) => method.runtimeRef.methodStableId as StableId),
  };
}

function mergeCatalogWithStaticOverlay(
  catalog: ClassInfoCatalog,
  overlaySnapshot: RuntimeOverlaySnapshot | null,
  classStableId: string,
): ClassInfoCatalog {
  const overlay = overlaySnapshot?.classes[classStableId as StableId];
  if (!overlay) {
    return catalog;
  }

  const staticFieldById = new Map(overlay.staticFields.map((field) => [field.stableId, field]));
  return {
    ...catalog,
    statics: catalog.statics.map((field) => {
      const refreshed = staticFieldById.get(field.id);
      if (!refreshed) {
        return field;
      }

      return {
        ...field,
        address: refreshed.address,
        value: refreshed.value,
      };
    }),
  };
}

async function refreshObservedClassInfoPayload(
  payloadValue: unknown,
  controlInputs: string[],
  payloadBinding: ExpressionSource | undefined,
  getClassInfoCatalogByBinding: (binding: ClassBinding | null | undefined) => ClassInfoCatalog | null,
): Promise<ClassInfoPayload | null> {
  const classInfo = getClassInfoPayloadFromValue(payloadValue);
  if (!classInfo) {
    return null;
  }

  if (payloadBinding?.kind !== 'input-expression' || !payloadBinding.sourceNodeId || controlInputs.includes(payloadBinding.sourceNodeId)) {
    return null;
  }

  const binding = deriveClassBindingFromPayload(classInfo);
  if (!binding) {
    return null;
  }

  const catalog = getClassInfoCatalogByBinding(binding);
  if (!catalog) {
    return null;
  }

  const selection = createSelectionFromPayload(classInfo);
  const overlaySnapshot = selection.statics.length > 0
    ? await getStudioRuntimeStaticFields(binding.classStableId)
    : null;
  const refreshedCatalog = mergeCatalogWithStaticOverlay(catalog, overlaySnapshot, binding.classStableId);

  let resolvedMemberValues: Record<string, ResolvedMemberRuntimeValue> | undefined;
  const normalizedInstanceAddress = typeof classInfo.instanceAddress === 'string'
    ? formatHexAddress(classInfo.instanceAddress)
    : null;
  if (selection.members.length > 0 && normalizedInstanceAddress) {
    const snapshot = await getStudioRuntimeInstanceFields(binding.classStableId, normalizedInstanceAddress);
    resolvedMemberValues = createResolvedMemberValueMap(snapshot);
  }

  return createClassInfoEnvelope(
    binding,
    refreshedCatalog,
    selection,
    normalizedInstanceAddress ?? classInfo.instanceAddress,
    resolvedMemberValues,
  ).payload;
}

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
        availableFields: [],
        selectedFields: [],
        issues: [createQueryIssue('query.display.port-mismatch', 'Incoming data is connected, but not to Payload In.', 'warning')],
      };
    }

    return {
      kind: 'missing-edge',
      sourceKind: 'preview',
      sourceNodeId: null,
      sourcePortId: null,
      envelope: null,
      availableFields: [],
      selectedFields: [],
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
      availableFields: [],
      selectedFields: [],
      issues: [createQueryIssue('query.display.payload-unavailable', 'The upstream payload is not available yet.', 'warning')],
    };
  }

  return {
    kind: 'resolved',
    sourceKind: 'preview',
    sourceNodeId: boundEdge.sourceNodeId,
    sourcePortId: boundEdge.sourcePortId,
    envelope,
    availableFields: buildDisplayAvailableFields(envelope.payload),
    selectedFields: resolveDisplaySelectedFields(node.data.selectedFields ?? [], envelope.payload),
    issues: [],
  };
}

const DisplayNodePresentation: StudioNodePresentationDefinition<DisplayNodeData> = {
  icon: Eye,
  resolveDisplayName: (data) => data.nodeName?.trim() || undefined,
  CanvasComponent: DisplayNodeCanvas,
  EditComponent: DisplayNodeEditor,
};

const DisplayNodeSerialization: StudioNodeSerializationDefinition<DisplayNodeData> = {
  createInitialData: createDisplayNodeData,
  hydrateData: (instance, baseData) => hydrateDisplayNodeData(baseData, instance),
  dehydrateData: (data) => ({
    displayName: data.nodeName?.trim() || undefined,
    parameters: {},
    bindings: {},
    documentState: toDisplayNodeDocumentState(data) as unknown as Record<string, unknown>,
  }),
  createRuntimeState: (node) => ({
    displayName: node.data.nodeName?.trim() || undefined,
    parameters: {},
    bindings: {},
    documentState: toDisplayNodeDocumentState(node.data) as unknown as Record<string, unknown>,
  } satisfies StudioNodeRuntimeState),
};

const DisplayNodeQuery: StudioNodeQueryDefinition<DisplayNodeData> = {
  buildQueryState: buildDisplayQueryState,
};

const DisplayNodeExecution: StudioNodeExecutionDefinition = {
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
    execute: async ({ resolvedInputs, inputBindings, controlInputs, getClassInfoCatalogByBinding }) => {
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

      const refreshedPayload = await refreshObservedClassInfoPayload(
        payloads[0],
        controlInputs,
        inputBindings['payload-in']?.[0],
        getClassInfoCatalogByBinding,
      );

      return {
        state: 'success',
        outputs: {},
        nextRuntimeState: refreshedPayload ? { observedPayload: refreshedPayload } : undefined,
      };
    },
  },
};

const DisplayNodeDefinition: StudioNodeDefinition<DisplayNodeData> = {
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
    preview: {
      mode: 'degraded',
      description: 'Display nodes can preview upstream payloads when available, but depend on upstream preview support.',
    },
    parameters: [],
  },
  ...DisplayNodePresentation,
  ...DisplayNodeSerialization,
  ...DisplayNodeQuery,
  ...DisplayNodeExecution,
};

export const DisplayNodeDef = defineStudioNode(DisplayNodeDefinition);

export default DisplayNodeDef;