import { invoke } from '@tauri-apps/api/core';
import { PencilLine } from 'lucide-react';
import {
  CLASS_INFO_SCHEMA,
  EDITOR_RESULT_SCHEMA,
  createEditorResultEnvelope,
  createFlowPort,
  createJsonPort,
} from '../../core/studio/contracts';
import { defineStudioNode } from '../../core/studio/NodeRegistry';
import type { INodeDefinition, IPort, StudioNodeRuntimeState } from '../../core/studio/types';
import type { RuntimeFieldSetRequest, RuntimeFieldSetResult } from '../../domain/analysis/contracts';
import type {
  EditorNodeQueryState,
  EditorTargetResultPayload,
  NodeQueryIssue,
  ValidationIssue,
  WorkflowJsonValue,
} from '../../domain/studio/contracts';
import { parseEditorNodeDocumentState } from '../../domain/studio/contracts';
import type { StudioNodeQueryContext } from '../../core/studio/queryTypes';
import { materializeNodeQuerySnapshot } from '../../core/studio/graphInterpreter';
import type { StableId } from '../../domain/contracts/shared-identity';
import { getClassInfoPayloadFromValue } from '../CallFunctionNode/callFunctionNodeModel';
import { EditorNodeCanvas } from './EditorNodeCanvas';
import { EditorNodeEditor } from './EditorNodeEditor';
import {
  createEditorNodeData,
  getEditorTargetBindingKey,
  parseEditorNodeDataFromDocumentState,
  toEditorNodeDocumentState,
  type EditorNodeData,
} from './editorNodeModel';
import { classifyEditorScalarKind, coerceWorkflowValueForEditorKind, getEditorValueKind, parseLiteralValueForEditorKind } from './editorValueTypes';

const EDITOR_INPUTS: IPort[] = [
  createFlowPort('flow-in', 'Flow In', undefined, { direction: 'input' }),
  createJsonPort('class-info-in', 'Class Info', CLASS_INFO_SCHEMA, 'Canonical class info payload from an upstream Class node.', {
    direction: 'input',
    required: true,
  }),
];

const EDITOR_OUTPUTS: IPort[] = [
  createFlowPort('flow-out', 'Flow Out', undefined, { cardinality: 'multiple' }),
  createJsonPort('result-out', 'Result', EDITOR_RESULT_SCHEMA, 'Execution summary for all modified editor targets.', {
    cardinality: 'multiple',
  }),
];

function createQueryIssue(severity: NodeQueryIssue['severity'], code: string, message: string, targetPortId = 'class-info-in'): NodeQueryIssue {
  return {
    severity,
    code,
    message,
    targetPortId,
  };
}

function createValidationIssue(code: string, message: string, target?: string): ValidationIssue {
  return {
    severity: 'error',
    code,
    message,
    target,
  };
}

function buildEditorQueryState(
  node: import('../../core/studio/types').StudioNode<EditorNodeData>,
  context: StudioNodeQueryContext,
): EditorNodeQueryState {
  const incomingDataEdges = context.edges.filter((edge) => edge.targetNodeId === node.id && edge.channel === 'data');
  const boundEdge = incomingDataEdges.find((edge) => edge.targetPortId === 'class-info-in');

  if (!boundEdge) {
    if (incomingDataEdges.length > 0) {
      return {
        kind: 'port-mismatch',
        payload: null,
        availableTargets: [],
        targets: [],
        summary: { totalTargets: node.data.targets.length, writableTargets: 0, invalidTargets: node.data.targets.length },
        issues: [createQueryIssue('warning', 'editor.port-mismatch', 'Incoming data is connected, but not to Class Info.')],
      };
    }

    return {
      kind: 'missing-edge',
      payload: null,
      availableTargets: [],
      targets: [],
      summary: { totalTargets: node.data.targets.length, writableTargets: 0, invalidTargets: node.data.targets.length },
      issues: [createQueryIssue('info', 'editor.missing-edge', 'Connect a Class Info payload to configure editor targets.')],
    };
  }

  const snapshotMap: Record<string, import('../../core/studio/types').NodeExecutionSnapshot> = {
    ...context.nodeSnapshots,
  };
  const upstreamSnapshot = materializeNodeQuerySnapshot(boundEdge.sourceNodeId, context, new Set<string>());
  if (upstreamSnapshot) {
    snapshotMap[boundEdge.sourceNodeId] = upstreamSnapshot;
  }

  for (const target of node.data.targets) {
    const source = target.valueSource;
    if (source.kind === 'input-expression' && source.sourceNodeId && !snapshotMap[source.sourceNodeId]) {
      const materialized = materializeNodeQuerySnapshot(source.sourceNodeId, context, new Set<string>());
      if (materialized) {
        snapshotMap[source.sourceNodeId] = materialized;
      }
    }
  }

  const payload = getClassInfoPayloadFromValue(upstreamSnapshot?.outputs[boundEdge.sourcePortId]?.payload);
  if (!payload) {
    return {
      kind: 'invalid-payload',
      payload: null,
      availableTargets: [],
      targets: [],
      summary: { totalTargets: node.data.targets.length, writableTargets: 0, invalidTargets: node.data.targets.length },
      issues: [createQueryIssue('error', 'editor.invalid-payload', 'The upstream payload does not resolve to valid Class Info.')],
    };
  }

  const availableTargets = [...payload.members, ...payload.statics].map((field) => {
    const scalarKind = classifyEditorScalarKind(field.typeName);
    return {
      memberStableId: field.runtimeRef.memberStableId,
      name: field.name,
      typeName: field.typeName,
      isStatic: field.isStatic,
      scalarKind,
      supported: scalarKind !== 'unsupported',
      address: typeof field.address === 'string' ? field.address : null,
      currentValue: field.value,
    };
  });

  const targets = node.data.targets.map((target) => {
    const source = availableTargets.find((candidate) => candidate.memberStableId === target.memberStableId && candidate.isStatic === target.isStatic);
    const issues: NodeQueryIssue[] = [];
    const scalarKind = source?.scalarKind ?? classifyEditorScalarKind(target.memberTypeName);
    const valueMode = target.valueSource.kind === 'literal' ? 'literal' as const : 'expression' as const;
    let status: 'resolved' | 'stale' | 'unsupported' | 'missing-instance' | 'invalid-value' = 'resolved';
    const resolvedAddress = source?.address ?? null;
    const currentValue = source?.currentValue ?? null;

    if (!source) {
      status = 'stale';
      issues.push(createQueryIssue('warning', 'editor.target.stale', `Target ${target.memberName} is no longer exported by the upstream Class node.`, undefined));
    } else if (scalarKind === 'unsupported') {
      status = 'unsupported';
      issues.push(createQueryIssue('warning', 'editor.target.unsupported', `${target.memberName} uses unsupported type ${target.memberTypeName}.`, undefined));
    } else if (!target.isStatic && !resolvedAddress) {
      status = 'missing-instance';
      issues.push(createQueryIssue('warning', 'editor.target.instance-required', `${target.memberName} requires a valid instance address.`, undefined));
    }

    const resolvedValue = context.runtimeData.expressions.resolveSource(target.valueSource, snapshotMap);
    const parsedValue = target.valueSource.kind === 'literal'
      ? parseLiteralValueForEditorKind(scalarKind, target.valueSource.raw)
      : coerceWorkflowValueForEditorKind(scalarKind, resolvedValue as WorkflowJsonValue);

    if (!parsedValue.valid) {
      status = status === 'resolved' ? 'invalid-value' : status;
      issues.push(createQueryIssue('error', 'editor.value.invalid', parsedValue.error ?? 'Target value is invalid.', undefined));
    }

    return {
      targetId: target.id,
      memberStableId: target.memberStableId,
      memberName: target.memberName,
      memberTypeName: target.memberTypeName,
      isStatic: target.isStatic,
      scalarKind,
      currentValue,
      nextValue: parsedValue.value,
      nextValueDisplay: parsedValue.normalizedDisplay,
      resolvedAddress,
      status,
      issues,
      valueMode,
    };
  });

  return {
    kind: 'resolved',
    payload,
    availableTargets,
    targets,
    summary: {
      totalTargets: targets.length,
      writableTargets: targets.filter((target) => target.status === 'resolved').length,
      invalidTargets: targets.filter((target) => target.status !== 'resolved').length,
    },
    issues: [],
  };
}

function createEditorResultPayload(queryState: Extract<EditorNodeQueryState, { kind: 'resolved' }>): import('../../domain/studio/contracts').EditorResultPayload {
  return {
    basic: queryState.payload.basic,
    instanceAddress: queryState.payload.instanceAddress,
    targets: queryState.targets.map((target) => ({
      memberStableId: target.memberStableId,
      name: target.memberName,
      typeName: target.memberTypeName,
      isStatic: target.isStatic,
      address: target.resolvedAddress,
      previousValue: (target.currentValue ?? null) as WorkflowJsonValue,
      nextValue: (target.nextValue ?? null) as WorkflowJsonValue,
      success: false,
      error: target.issues[0]?.message ?? null,
    })),
    summary: {
      total: queryState.summary.totalTargets,
      succeeded: 0,
      failed: queryState.summary.invalidTargets,
    },
  };
}

const EditorNodeDefinition: INodeDefinition<EditorNodeData> = {
  manifest: {
    type: 'editor',
    typeVersion: 1,
    family: 'runtime',
    displayName: 'Editor',
    description: 'Writes new values into selected class members or static fields resolved from an upstream Class Info payload.',
    category: 'Runtime',
    tags: ['editor', 'memory', 'write', 'field', 'unity'],
    inputs: EDITOR_INPUTS.map((port) => ({
      key: port.id,
      displayName: port.label,
      direction: 'input',
      channel: port.channel,
      cardinality: port.cardinality,
      dataType: port.dataType,
      required: port.required,
    })),
    outputs: EDITOR_OUTPUTS.map((port) => ({
      key: port.id,
      displayName: port.label,
      direction: 'output',
      channel: port.channel,
      cardinality: port.cardinality,
      dataType: port.dataType,
    })),
    parameters: [],
  },
  icon: PencilLine,
  createInitialData: createEditorNodeData,
  resolveDisplayName: (data) => data.nodeName?.trim() || undefined,
  hydrateData: (instance, baseData) => parseEditorNodeDataFromDocumentState(baseData, instance),
  dehydrateData: (data) => ({
    displayName: data.nodeName?.trim() || undefined,
    parameters: {},
    bindings: Object.fromEntries(data.targets.map((target) => [getEditorTargetBindingKey(target), target.valueSource])),
    documentState: toEditorNodeDocumentState(data) as unknown as Record<string, unknown>,
  }),
  createRuntimeState: (node) => ({
    displayName: node.data.nodeName?.trim() || undefined,
    parameters: {},
    bindings: Object.fromEntries(node.data.targets.map((target) => [getEditorTargetBindingKey(target), target.valueSource])),
    documentState: toEditorNodeDocumentState(node.data) as unknown as Record<string, unknown>,
  } satisfies StudioNodeRuntimeState),
  buildQueryState: buildEditorQueryState,
  buildQueryOutputs: (node, context) => {
    const queryState = buildEditorQueryState(node, context);
    if (queryState.kind !== 'resolved') {
      return null;
    }

    return {
      'result-out': createEditorResultEnvelope(createEditorResultPayload(queryState)),
    };
  },
  executionContract: {
    validate: ({ documentState, resolvedInputs, resolvedBindings }) => {
      const parsedState = parseEditorNodeDocumentState(documentState);
      const payload = getClassInfoPayloadFromValue(resolvedInputs['class-info-in']?.[0]);
      if (!payload) {
        return [createValidationIssue('editor.class-info.required', 'Editor node requires an incoming Class Info payload.', 'class-info-in')];
      }

      const sourceMap = new Map(
        [...payload.members, ...payload.statics].map((field) => [`${field.runtimeRef.memberStableId}:${field.isStatic ? 'static' : 'member'}`, field] as const),
      );
      const issues: ValidationIssue[] = [];

      for (const target of parsedState.targets) {
        const source = sourceMap.get(`${target.memberStableId}:${target.isStatic ? 'static' : 'member'}`);
        if (!source) {
          issues.push(createValidationIssue('editor.target.missing', `Target ${target.memberName} is no longer available in upstream Class Info.`));
          continue;
        }

        const scalarKind = classifyEditorScalarKind(source.typeName);
        if (scalarKind === 'unsupported') {
          issues.push(createValidationIssue('editor.target.unsupported', `${source.name} uses unsupported type ${source.typeName}.`));
          continue;
        }

        if (!source.isStatic && typeof source.address !== 'string') {
          issues.push(createValidationIssue('editor.target.instance-required', `${source.name} requires a valid instance address.`));
          continue;
        }

        const resolvedValue = resolvedBindings[target.targetId] as WorkflowJsonValue | undefined;
        const parsedValue = target.valueSource.kind === 'literal'
          ? parseLiteralValueForEditorKind(scalarKind, target.valueSource.raw)
          : coerceWorkflowValueForEditorKind(scalarKind, resolvedValue ?? null);

        if (!parsedValue.valid) {
          issues.push(createValidationIssue('editor.target.invalid-value', parsedValue.error ?? `Invalid value for ${source.name}.`));
        }
      }

      return issues;
    },
    execute: async ({ documentState, resolvedInputs, resolvedBindings }) => {
      const parsedState = parseEditorNodeDocumentState(documentState);
      const payload = getClassInfoPayloadFromValue(resolvedInputs['class-info-in']?.[0]);
      if (!payload) {
        return {
          state: 'error',
          outputs: {},
          issues: [createValidationIssue('editor.class-info.required', 'Editor node requires an incoming Class Info payload.', 'class-info-in')],
        };
      }

      const sourceMap = new Map(
        [...payload.members, ...payload.statics].map((field) => [`${field.runtimeRef.memberStableId}:${field.isStatic ? 'static' : 'member'}`, field] as const),
      );
      const targetResults: EditorTargetResultPayload[] = [];
      const issues: ValidationIssue[] = [];

      for (const target of parsedState.targets) {
        const source = sourceMap.get(`${target.memberStableId}:${target.isStatic ? 'static' : 'member'}`);
        if (!source) {
          const error = `Target ${target.memberName} is no longer available in upstream Class Info.`;
          targetResults.push({
            memberStableId: target.memberStableId,
            name: target.memberName,
            typeName: target.memberTypeName,
            isStatic: target.isStatic,
            address: null,
            previousValue: null,
            nextValue: null,
            success: false,
            error,
          });
          issues.push(createValidationIssue('editor.target.missing', error));
          continue;
        }

        const scalarKind = classifyEditorScalarKind(source.typeName);
        const resolvedValue = resolvedBindings[target.targetId] as WorkflowJsonValue | undefined;
        const parsedValue = target.valueSource.kind === 'literal'
          ? parseLiteralValueForEditorKind(scalarKind, target.valueSource.raw)
          : coerceWorkflowValueForEditorKind(scalarKind, resolvedValue ?? null);

        if (scalarKind === 'unsupported' || !parsedValue.valid || typeof source.address !== 'string') {
          const error = scalarKind === 'unsupported'
            ? `${source.name} uses unsupported type ${source.typeName}.`
            : typeof source.address !== 'string'
              ? `${source.name} requires a valid instance address.`
              : parsedValue.error ?? `Invalid value for ${source.name}.`;
          targetResults.push({
            memberStableId: target.memberStableId,
            name: target.memberName,
            typeName: target.memberTypeName,
            isStatic: target.isStatic,
            address: typeof source.address === 'string' ? source.address : null,
            previousValue: source.value,
            nextValue: parsedValue.value,
            success: false,
            error,
          });
          issues.push(createValidationIssue('editor.target.execution-invalid', error));
          continue;
        }

        const valueKind = getEditorValueKind(scalarKind);
        if (!valueKind) {
          const error = `Unsupported write kind for ${source.name}.`;
          targetResults.push({
            memberStableId: target.memberStableId,
            name: target.memberName,
            typeName: target.memberTypeName,
            isStatic: target.isStatic,
            address: source.address,
            previousValue: source.value,
            nextValue: parsedValue.value,
            success: false,
            error,
          });
          issues.push(createValidationIssue('editor.target.write-kind', error));
          continue;
        }

        try {
          const request: RuntimeFieldSetRequest = {
            classStableId: source.runtimeRef.classStableId as StableId,
            memberStableId: source.runtimeRef.memberStableId as StableId,
            fieldName: source.name,
            fieldTypeName: source.typeName,
            isStatic: source.isStatic,
            instanceAddress: typeof payload.instanceAddress === 'string' ? payload.instanceAddress : null,
            targetAddress: typeof source.address === 'string' ? source.address : null,
            valueKind,
            serializedValue: parsedValue.serializedValue,
          };

          const result = await invoke<RuntimeFieldSetResult>('set_runtime_field_value', { request });
          targetResults.push({
            memberStableId: target.memberStableId,
            name: target.memberName,
            typeName: target.memberTypeName,
            isStatic: target.isStatic,
            address: result.address,
            previousValue: result.previousValue,
            nextValue: result.appliedValue ?? parsedValue.value,
            success: result.success,
            error: result.error,
          });
          if (!result.success) {
            issues.push(createValidationIssue(`editor.write.${result.failureKind}`, result.error ?? `Failed to write ${source.name}.`));
          }
        } catch (error) {
          const message = `Failed to write ${source.name}: ${String(error)}`;
          targetResults.push({
            memberStableId: target.memberStableId,
            name: target.memberName,
            typeName: target.memberTypeName,
            isStatic: target.isStatic,
            address: source.address,
            previousValue: source.value,
            nextValue: parsedValue.value,
            success: false,
            error: message,
          });
          issues.push(createValidationIssue('editor.write.transport', message));
        }
      }

      const succeeded = targetResults.filter((target) => target.success).length;
      const resultPayload = {
        basic: payload.basic,
        instanceAddress: payload.instanceAddress,
        targets: targetResults,
        summary: {
          total: targetResults.length,
          succeeded,
          failed: targetResults.length - succeeded,
        },
      };

      return {
        state: issues.length === targetResults.length && targetResults.length > 0 ? 'error' : 'success',
        outputs: {
          'result-out': createEditorResultEnvelope(resultPayload),
        },
        issues: issues.length > 0 ? issues : undefined,
      };
    },
  },
  CanvasComponent: EditorNodeCanvas,
  EditComponent: EditorNodeEditor,
};

export const EditorNodeDef = defineStudioNode(EditorNodeDefinition);

export default EditorNodeDef;