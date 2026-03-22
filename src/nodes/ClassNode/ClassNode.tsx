import { Box } from 'lucide-react';
import { formatHexAddress } from '../../core/addressFormat';
import {
  CLASS_INFO_SCHEMA,
  getInstanceReferencePayloadFromValue,
  INSTANCE_REFERENCE_SCHEMA,
  createClassInfoEnvelope,
  createFlowPort,
  createJsonPort,
  type ResolvedMemberRuntimeValue,
} from '../../core/studio/contracts';
import { defineStudioNode } from '../../core/studio/NodeRegistry';
import type { INodeDefinition, IPort, NodeExecutionOutputMap, StudioNodeRuntimeState } from '../../core/studio/types';
import type { StudioNodeLifecycleContext } from '../../core/studio/nodeCapabilities';
import type { RuntimeInstanceFieldSnapshot } from '../../domain/analysis/contracts';
import type { ValidationIssue, WorkflowJsonValue } from '../../domain/studio/contracts';
import { parseClassNodeDocumentState } from '../../domain/studio/contracts';
import { reconcileClassInfoSelection } from '../../domain/studio/editor';
import { getRuntimeInstanceFields } from '../../infrastructure/tauri/TauriRuntimeGateway';
import type { StudioNodeQueryContext } from '../../core/studio/queryTypes';
import { ClassNodeBindingEditor } from './ClassNodeBindingEditor';
import { ClassNodeCanvas } from './ClassNodeCanvas';
import { ClassNodeSelectionEditor } from './ClassNodeSelectionEditor';
import {
  createClassNodeData,
  createClassNodeDocumentState,
  createEmptyCatalog,
  fromClassBindingReference,
  fromClassExportSelection,
  hasResolvedExecutionValue,
  parseClassNodeDataFromDocumentState,
  type ClassNodeData,
} from './classNodeModel';

const CLASS_INFO_OUTPUT: IPort = createJsonPort(
  'info-out',
  'Info',
  CLASS_INFO_SCHEMA,
  'Selected class metadata wrapped in the studio JSON envelope.',
  { cardinality: 'multiple' },
);

const CLASS_NODE_INPUTS: IPort[] = [
  createFlowPort('flow-in', 'Flow In'),
  createJsonPort(
    'instance-in',
    'Instance Ref',
    INSTANCE_REFERENCE_SCHEMA,
    'Canonical instance reference used to supply instance address data to this class node.',
  ),
];

const CLASS_NODE_OUTPUTS: IPort[] = [
  createFlowPort('flow-out', 'Flow Out', undefined, { cardinality: 'multiple' }),
  CLASS_INFO_OUTPUT,
];

function createResolvedMemberValueMap(
  snapshot: RuntimeInstanceFieldSnapshot,
): Record<string, ResolvedMemberRuntimeValue> {
  return Object.fromEntries(
    snapshot.fields.map((field) => [
      field.stableId,
      {
        address: formatHexAddress(field.address),
        value: field.value,
      },
    ]),
  );
}

function buildClassNodeQuerySnapshot(
  node: import('../../core/studio/types').StudioNode<ClassNodeData>,
  context: StudioNodeQueryContext,
  dependencySnapshots: Record<string, import('../../core/studio/types').NodeExecutionSnapshot>,
): NodeExecutionOutputMap | null {
  const availableInfo = context.runtimeData.classCatalog.getByBinding(node.data.binding) ?? createEmptyCatalog();
  const selection = reconcileClassInfoSelection(node.data.infoSelection, availableInfo);
  const instanceInputEdge = context.edges.find(
    (edge) => edge.targetNodeId === node.id && edge.targetPortId === 'instance-in' && edge.channel === 'data',
  );
  const connectedInstanceReference = instanceInputEdge
    ? getInstanceReferencePayloadFromValue(dependencySnapshots[instanceInputEdge.sourceNodeId]?.outputs[instanceInputEdge.sourcePortId]?.payload)
    : null;
  const resolvedInstanceAddress = connectedInstanceReference?.address
    ?? (node.data.instanceSource
      ? context.runtimeData.expressions.resolveSource(node.data.instanceSource, dependencySnapshots)
      : null);
  const resolvedMemberValues = node.data.binding
    ? context.runtimeData.classCatalog.resolveMemberValues(node.data.binding.classStableId, resolvedInstanceAddress ?? null)
    : undefined;

  return {
    'info-out': createClassInfoEnvelope(
      node.data.binding,
      availableInfo,
      selection,
      resolvedInstanceAddress ?? null,
      resolvedMemberValues,
    ),
  };
}

function observeClassNodeGraph(
  node: import('../../core/studio/types').StudioNode<ClassNodeData>,
  context: StudioNodeLifecycleContext,
) {
  if (!node.data.binding) {
    return;
  }

  context.runtimeData.classCatalog.ensureOverlayLoaded(node.data.binding.classStableId);
}

function reconcileClassNodeData(
  node: import('../../core/studio/types').StudioNode<ClassNodeData>,
  context: StudioNodeLifecycleContext,
): Partial<ClassNodeData> | null {
  if (!node.data.binding) {
    return null;
  }

  const resolvedCatalog = context.runtimeData.classCatalog.getByBinding(node.data.binding);
  if (!resolvedCatalog) {
    return null;
  }

  const reconciledSelection = reconcileClassInfoSelection(node.data.infoSelection, resolvedCatalog);
  const selectionChanged =
    reconciledSelection.members.length !== node.data.infoSelection.members.length
    || reconciledSelection.statics.length !== node.data.infoSelection.statics.length
    || reconciledSelection.functions.length !== node.data.infoSelection.functions.length
    || reconciledSelection.members.some((item, index) => item !== node.data.infoSelection.members[index])
    || reconciledSelection.statics.some((item, index) => item !== node.data.infoSelection.statics[index])
    || reconciledSelection.functions.some((item, index) => item !== node.data.infoSelection.functions[index]);

  return selectionChanged ? { infoSelection: reconciledSelection } : null;
}

const ClassNodeDefinition: INodeDefinition<ClassNodeData> = {
  manifest: {
    type: 'class-ref',
    typeVersion: 1,
    family: 'runtime',
    displayName: 'Class Reference',
    description: 'Resolves a concrete class binding and wraps selected metadata into a fixed info JSON output.',
    category: 'Runtime',
    tags: ['class', 'metadata', 'json', 'unity'],
    inputs: CLASS_NODE_INPUTS.map((port) => ({
      key: port.id,
      displayName: port.label,
      direction: 'input',
      channel: port.channel,
      cardinality: port.cardinality,
      dataType: port.dataType,
    })),
    outputs: CLASS_NODE_OUTPUTS.map((port) => ({
      key: port.id,
      displayName: port.label,
      direction: 'output',
      channel: port.channel,
      cardinality: port.cardinality,
      dataType: port.dataType,
    })),
    parameters: [],
    preview: {
      mode: 'supported',
      description: 'Class metadata and selected exports can be materialized without a live execution run.',
    },
  },
  icon: Box,
  createInitialData: createClassNodeData,
  resolveDisplayName: (data) => data.nodeName?.trim() || data.binding?.name || undefined,
  hydrateData: (instance, baseData) => parseClassNodeDataFromDocumentState(baseData, instance),
  dehydrateData: (data) => {
    const bindings: StudioNodeRuntimeState['bindings'] = {};
    if (data.instanceSource) {
      bindings.instanceSource = data.instanceSource;
    }

    return {
      displayName: data.nodeName?.trim() || undefined,
      parameters: {},
      bindings,
      documentState: {
        ...createClassNodeDocumentState(data),
      },
    };
  },
  createRuntimeState: (node) => {
    const bindings: StudioNodeRuntimeState['bindings'] = {};
    if (node.data.instanceSource) {
      bindings.instanceSource = node.data.instanceSource;
    }

    return {
      displayName: node.data.nodeName?.trim() || undefined,
      parameters: {},
      bindings,
      documentState: {
        ...createClassNodeDocumentState(node.data),
      },
    };
  },
  observeGraphNode: observeClassNodeGraph,
  reconcileData: reconcileClassNodeData,
  buildQueryOutputs: buildClassNodeQuerySnapshot,
  executionContract: {
    validate: (context) => {
      const classDocumentState = parseClassNodeDocumentState(context.documentState);
      const binding = fromClassBindingReference(classDocumentState.classBinding);
      const availableInfo = context.getClassInfoCatalogByBinding(binding);
      const selection = availableInfo
        ? reconcileClassInfoSelection(fromClassExportSelection(classDocumentState.exportSelection), availableInfo)
        : fromClassExportSelection(classDocumentState.exportSelection);
      const hasIncomingInstance = typeof getInstanceReferencePayloadFromValue(context.resolvedInputs['instance-in']?.[0])?.address === 'string';
      const hasOwnInstanceBinding = hasResolvedExecutionValue(context.resolvedBindings.instanceSource);
      const requiresInstance = selection.members.length > 0;

      if (requiresInstance && !hasIncomingInstance && !hasOwnInstanceBinding) {
        return [
          {
            severity: 'error',
            code: 'class.instance.required',
            message:
              'Class node requires an incoming instance reference or an instance source expression when exporting runtime member values.',
            target: 'instance-in',
          },
        ];
      }

      return [];
    },
    execute: async ({ documentState, resolvedBindings, resolvedInputs, getClassInfoCatalogByBinding }) => {
      const classDocumentState = parseClassNodeDocumentState(documentState);
      const binding = fromClassBindingReference(classDocumentState.classBinding);
      const availableInfo = getClassInfoCatalogByBinding(binding);

      if (!availableInfo) {
        return {
          state: 'error',
          issues: [
            {
              severity: 'error',
              code: 'class.catalog.unavailable',
              message:
                'Canonical class catalog is unavailable for this binding. Re-run analysis or rebind the class node.',
              target: 'binding',
            },
          ],
          outputs: {},
        };
      }

      const selection = reconcileClassInfoSelection(
        fromClassExportSelection(classDocumentState.exportSelection),
        availableInfo,
      );
      const inputInstanceReference = getInstanceReferencePayloadFromValue(resolvedInputs['instance-in']?.[0]);
      const resolvedInstanceAddress = inputInstanceReference?.address
        ?? (resolvedBindings.instanceSource as WorkflowJsonValue | undefined)
        ?? null;
      const normalizedInstanceAddress =
        typeof resolvedInstanceAddress === 'string' ? formatHexAddress(resolvedInstanceAddress) : null;
      let resolvedMemberValues: Record<string, ResolvedMemberRuntimeValue> | undefined;
      let issues: ValidationIssue[] | undefined;

      if (selection.members.length > 0 && !normalizedInstanceAddress) {
        return {
          state: 'error',
          issues: [
            {
              severity: 'error',
              code: 'class.instance.missing-address',
              message: 'Upstream instance reference did not contain a usable instance address.',
              target: 'instance-in',
            },
          ],
          outputs: {},
        };
      }

      if (binding && normalizedInstanceAddress && selection.members.length > 0) {
        try {
          const snapshot = await getRuntimeInstanceFields(binding.classStableId, normalizedInstanceAddress);
          resolvedMemberValues = createResolvedMemberValueMap(snapshot);
        } catch (error) {
          issues = [
            {
              severity: 'warning',
              code: 'class.instance.resolve_failed',
              message: `Failed to resolve runtime member values: ${String(error)}`,
              target: 'instance-in',
            },
          ];
        }
      }

      return {
        state: 'success',
        issues,
        outputs: {
          'info-out': createClassInfoEnvelope(
            binding,
            availableInfo,
            selection,
            normalizedInstanceAddress ?? resolvedInstanceAddress,
            resolvedMemberValues,
          ),
        },
      };
    },
  },
  CanvasComponent: ClassNodeCanvas,
  EditComponent: ClassNodeBindingEditor,
  EditFooterComponent: ClassNodeSelectionEditor,
};

export const ClassNodeDef = defineStudioNode(ClassNodeDefinition);

export default ClassNodeDef;
