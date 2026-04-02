import { Code2 } from 'lucide-react';
import {
  CALL_FUNCTION_RESULT_SCHEMA,
  CLASS_INFO_SCHEMA,
  createCallFunctionResultEnvelope,
  createFlowPort,
  createJsonPort,
  INSTANCE_REFERENCE_SCHEMA,
} from '@/features/studio/core/contracts';
import { defineStudioNode } from '@/features/studio/core/NodeRegistry';
import type {
  IPort,
  NodeExecutionOutputMap,
  StudioNodeDefinition,
  StudioNodeExecutionDefinition,
  StudioNodePresentationDefinition,
  StudioNodeQueryDefinition,
  StudioNodeRuntimeState,
  StudioNodeSerializationDefinition,
} from '@/features/studio/core/types';
import type { RuntimeMethodInvokeRequest, RuntimeMethodInvokeResult } from '@/domain/analysis/contracts';
import { parseCallFunctionNodeDocumentState, type CallFunctionClassInfoQueryState, type ValidationIssue, type WorkflowJsonValue } from '@/domain/studio/contracts';
import type { StableId } from '@/domain/contracts/shared-identity';
import { invokeStudioRuntimeMethod } from '@/features/studio/application/runtime/StudioRuntimeGateway';
import type { StudioNodeQueryContext } from '@/features/studio/core/queryTypes';
import { materializeNodeQuerySnapshot } from '@/features/studio/core/graphInterpreter';
import { CallFunctionNodeCanvas } from './CallFunctionNodeCanvas';
import { CallFunctionNodeEditor } from './CallFunctionNodeEditor';
import {
  createCallFunctionNodeData,
  createCallFunctionInstanceReferenceEnvelope,
  findSelectedFunction,
  getClassInfoPayloadFromValue,
  parseCallFunctionNodeDataFromDocumentState,
  toCallFunctionDocumentState,
  toCallFunctionResultPayload,
  toRuntimeInvokeArgument,
  type CallFunctionNodeData,
} from './callFunctionNodeModel';

const CALL_FUNCTION_INPUTS: IPort[] = [
  createFlowPort('flow-in', 'Flow In'),
  createJsonPort('class-info-in', 'Class Info', CLASS_INFO_SCHEMA, 'Structured class info payload from an upstream Class node.', {
    direction: 'input',
    required: true,
  }),
];

const CALL_FUNCTION_OUTPUTS: IPort[] = [
  createFlowPort('flow-out', 'Flow Out', undefined, { cardinality: 'multiple' }),
  createJsonPort('result-out', 'Result', CALL_FUNCTION_RESULT_SCHEMA, 'Method invocation result wrapped in a studio JSON envelope.', { cardinality: 'multiple' }),
  createJsonPort('instance-ref-out', 'Instance Ref', INSTANCE_REFERENCE_SCHEMA, 'Projected instance reference from an object return value.', { cardinality: 'multiple' }),
];

function createValidationError(message: string, target?: string): ValidationIssue {
  return {
    severity: 'error',
    code: 'call-function.invalid',
    message,
    target,
  };
}

function createFailureOutput(
  message: string,
  instanceAddress: WorkflowJsonValue,
  argumentsPayload: Array<{ name: string; typeName: string; value: WorkflowJsonValue }>,
  method: ReturnType<typeof findSelectedFunction>,
  failureKind: 'validation' | 'transport',
) {
  const resultPayload = {
    method,
    instanceAddress,
    arguments: argumentsPayload,
    success: false,
    failureKind,
    error: message,
    exception: null,
    result: null,
  };

  return {
    'result-out': createCallFunctionResultEnvelope(resultPayload),
    'instance-ref-out': createCallFunctionInstanceReferenceEnvelope(resultPayload),
  };
}

function buildCallFunctionQuerySnapshot(
  node: import('@/features/studio/core/types').StudioNode<CallFunctionNodeData>,
  context: StudioNodeQueryContext,
  dependencySnapshots: Record<string, import('@/features/studio/core/types').NodeExecutionSnapshot>,
): NodeExecutionOutputMap | null {
  const incomingEdge = context.edges.find(
    (edge) => edge.targetNodeId === node.id && edge.targetPortId === 'class-info-in' && edge.channel === 'data',
  );
  const classInfoPayload = incomingEdge
    ? getClassInfoPayloadFromValue(dependencySnapshots[incomingEdge.sourceNodeId]?.outputs[incomingEdge.sourcePortId]?.payload)
    : null;

  if (!classInfoPayload) {
    return null;
  }

  const method = findSelectedFunction(classInfoPayload, node.data.selectedMethodStableId);
  if (!method) {
    return null;
  }

  const resultPayload = {
    method,
    instanceAddress: classInfoPayload.instanceAddress,
    arguments: node.data.arguments.map((entry) => ({
      name: entry.name,
      typeName: method.parameters.find((parameter) => parameter.name === entry.name)?.typeName ?? 'System.Object',
      value: context.runtimeData.expressions.resolveSource(entry.source, dependencySnapshots) ?? null,
    })),
    success: false,
    failureKind: 'none' as const,
    error: null,
    exception: null,
    result: null,
  };

  return {
    'result-out': createCallFunctionResultEnvelope(resultPayload),
    'instance-ref-out': createCallFunctionInstanceReferenceEnvelope(resultPayload),
  };
}

function buildCallFunctionClassInfoQueryState(
  node: import('@/features/studio/core/types').StudioNode<CallFunctionNodeData>,
  context: StudioNodeQueryContext,
): CallFunctionClassInfoQueryState {
  const incomingDataEdges = context.edges.filter((edge) => edge.targetNodeId === node.id && edge.channel === 'data');
  const boundEdge = incomingDataEdges.find((edge) => edge.targetPortId === 'class-info-in');

  if (!boundEdge) {
    if (incomingDataEdges.length > 0) {
      return {
        kind: 'port-mismatch',
        payload: null,
        methods: [],
        issues: [{
          severity: 'warning',
          code: 'query.call-function.port-mismatch',
          message: 'Incoming data is connected, but not to the required Class Info input port.',
          targetPortId: 'class-info-in',
        }],
      };
    }

    return {
      kind: 'missing-edge',
      payload: null,
      methods: [],
      issues: [{
        severity: 'info',
        code: 'query.call-function.missing-edge',
        message: 'Connect a Class Info input first.',
        targetPortId: 'class-info-in',
      }],
    };
  }

  const payload = getClassInfoPayloadFromValue(
    materializeNodeQuerySnapshot(boundEdge.sourceNodeId, context, new Set<string>())?.outputs[boundEdge.sourcePortId]?.payload,
  );
  if (!payload) {
    return {
      kind: 'invalid-payload',
      payload: null,
      methods: [],
      issues: [{
        severity: 'error',
        code: 'query.call-function.invalid-payload',
        message: 'The upstream connection does not currently resolve to a valid Class Info payload.',
        targetPortId: 'class-info-in',
      }],
    };
  }

  if (payload.functions.length === 0) {
    return {
      kind: 'no-functions',
      payload,
      methods: [],
      issues: [{
        severity: 'warning',
        code: 'query.call-function.no-functions',
        message: 'The upstream Class node does not export any functions.',
        targetPortId: 'class-info-in',
      }],
    };
  }

  return {
    kind: 'resolved',
    payload,
    methods: payload.functions,
    issues: [],
  };
}

const CallFunctionNodePresentation: StudioNodePresentationDefinition<CallFunctionNodeData> = {
  icon: Code2,
  resolveDisplayName: (data) => data.nodeName?.trim() || undefined,
  CanvasComponent: CallFunctionNodeCanvas,
  EditComponent: CallFunctionNodeEditor,
};

const CallFunctionNodeSerialization: StudioNodeSerializationDefinition<CallFunctionNodeData> = {
  createInitialData: createCallFunctionNodeData,
  hydrateData: (instance, baseData) => parseCallFunctionNodeDataFromDocumentState(baseData, instance),
  dehydrateData: (data) => ({
    displayName: data.nodeName?.trim() || undefined,
    parameters: {},
    bindings: Object.fromEntries(data.arguments.map((entry) => [entry.id, entry.source])),
    documentState: toCallFunctionDocumentState(data) as unknown as Record<string, unknown>,
  }),
  createRuntimeState: (node) => ({
    displayName: node.data.nodeName?.trim() || undefined,
    parameters: {},
    bindings: Object.fromEntries(node.data.arguments.map((entry) => [entry.id, entry.source])),
    documentState: toCallFunctionDocumentState(node.data) as unknown as Record<string, unknown>,
  } satisfies StudioNodeRuntimeState),
};

const CallFunctionNodeQuery: StudioNodeQueryDefinition<CallFunctionNodeData> = {
  buildQueryOutputs: buildCallFunctionQuerySnapshot,
  buildQueryState: buildCallFunctionClassInfoQueryState,
};

const CallFunctionNodeExecution: StudioNodeExecutionDefinition = {
  executionContract: {
    validate: ({ documentState, resolvedInputs }) => {
      const parsedState = parseCallFunctionNodeDocumentState(documentState);
      const classInfo = getClassInfoPayloadFromValue(resolvedInputs['class-info-in']?.[0]);
      if (!classInfo) {
        return [createValidationError('Call Function node requires an incoming Class Info payload.', 'class-info-in')];
      }

      const method = findSelectedFunction(classInfo, parsedState.selectedMethodStableId);
      if (!method) {
        return [createValidationError('Select a valid method from the upstream Class Info payload.')];
      }

      if (!method.isStatic && typeof classInfo.instanceAddress !== 'string') {
        return [createValidationError('Selected method requires an instanceAddress from the upstream Class Info payload.', 'class-info-in')];
      }

      if (parsedState.arguments.length !== method.parameters.length) {
        return [createValidationError('Method arguments are not aligned with the selected method signature.')];
      }

      return [];
    },
    execute: async ({ documentState, resolvedBindings, resolvedInputs }) => {
      const parsedState = parseCallFunctionNodeDocumentState(documentState);
      const classInfo = getClassInfoPayloadFromValue(resolvedInputs['class-info-in']?.[0]);
      if (!classInfo) {
        const message = 'Call Function node requires an incoming Class Info payload.';
        return {
          state: 'error',
          outputs: createFailureOutput(message, null, [], null, 'validation'),
          issues: [createValidationError(message, 'class-info-in')],
        };
      }

      const method = findSelectedFunction(classInfo, parsedState.selectedMethodStableId);
      if (!method) {
        const message = 'Selected method no longer exists in the upstream Class Info payload.';
        return {
          state: 'error',
          outputs: createFailureOutput(message, classInfo.instanceAddress, [], null, 'validation'),
          issues: [createValidationError(message)],
        };
      }

      const argumentValues = method.parameters.map((parameter) => {
        const binding = parsedState.arguments.find((entry) => entry.name === parameter.name);
        if (!binding) {
          throw new Error(`Missing binding for parameter ${parameter.name}`);
        }

        return {
          name: parameter.name,
          typeName: parameter.typeName,
          value: resolvedBindings[binding.stableId] as WorkflowJsonValue | undefined,
        };
      });

      if (argumentValues.some((entry) => entry.value === undefined)) {
        const message = 'One or more argument values could not be resolved before invocation.';
        return {
          state: 'error',
          outputs: createFailureOutput(
            message,
            classInfo.instanceAddress,
            argumentValues.map((entry) => ({
              name: entry.name,
              typeName: entry.typeName,
              value: entry.value ?? null,
            })),
            method,
            'validation',
          ),
          issues: [createValidationError(message)],
        };
      }

      const resolvedArgumentValues = argumentValues.map((entry) => ({
        ...entry,
        value: entry.value ?? null,
      }));

      const request: RuntimeMethodInvokeRequest = {
        classStableId: method.runtimeRef.classStableId as StableId,
        methodStableId: method.runtimeRef.methodStableId as StableId,
        instanceAddress: typeof classInfo.instanceAddress === 'string' ? classInfo.instanceAddress : null,
        arguments: resolvedArgumentValues.map((entry) => toRuntimeInvokeArgument(entry.name, entry.typeName, entry.value)),
      };

      try {
        const result = await invokeStudioRuntimeMethod(request);
        const resultPayload = toCallFunctionResultPayload(method, classInfo.instanceAddress, resolvedArgumentValues, result);
        return {
          state: result.success ? 'success' : 'error',
          outputs: {
            'result-out': createCallFunctionResultEnvelope(resultPayload),
            'instance-ref-out': createCallFunctionInstanceReferenceEnvelope(resultPayload),
          },
          issues: result.success ? undefined : [{
            severity: 'warning',
            code: 'call-function.invoke_failed',
            message: result.exception ?? result.error ?? 'Method invocation failed.',
          }],
        };
      } catch (error) {
        const message = `Failed to invoke method: ${String(error)}`;
        return {
          state: 'error',
          outputs: createFailureOutput(message, classInfo.instanceAddress, resolvedArgumentValues, method, 'transport'),
          issues: [{
            severity: 'error',
            code: 'call-function.invoke_error',
            message,
          }],
        };
      }
    },
  },
};

const CallFunctionNodeDefinition: StudioNodeDefinition<CallFunctionNodeData> = {
  manifest: {
    type: 'call-function',
    typeVersion: 1,
    family: 'runtime',
    displayName: 'Call Function',
    description: 'Invokes a selected runtime method from an upstream Class Info payload.',
    category: 'Runtime',
    tags: ['invoke', 'runtime', 'method', 'unity'],
    inputs: CALL_FUNCTION_INPUTS.map((port) => ({
      key: port.id,
      displayName: port.label,
      direction: 'input',
      channel: port.channel,
      cardinality: port.cardinality,
      dataType: port.dataType,
      required: port.required,
    })),
    outputs: CALL_FUNCTION_OUTPUTS.map((port) => ({
      key: port.id,
      displayName: port.label,
      direction: 'output',
      channel: port.channel,
      cardinality: port.cardinality,
      dataType: port.dataType,
    })),
    parameters: [],
    preview: {
      mode: 'degraded',
      description: 'Invocation previews show the planned call shape, but not a real runtime result until execution.',
    },
  },
  ...CallFunctionNodePresentation,
  ...CallFunctionNodeSerialization,
  ...CallFunctionNodeQuery,
  ...CallFunctionNodeExecution,
};

export const CallFunctionNodeDef = defineStudioNode(CallFunctionNodeDefinition);

export default CallFunctionNodeDef;