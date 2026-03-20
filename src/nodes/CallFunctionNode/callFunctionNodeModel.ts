import { createLiteralExpressionSource } from '../../core/studio/expression';
import { createCallFunctionResultEnvelope } from '../../core/studio/contracts';
import type {
  CallFunctionResultPayload,
  ClassInfoFunctionPayload,
  ClassInfoPayload,
  WorkflowJsonValue,
} from '../../domain/studio/contracts';
import type {
  BaseNodeData,
} from '../../core/studio/types';
import { createStableId, type StableId } from '../../domain/contracts/shared-identity';
import {
  parseCallFunctionNodeDocumentState,
  type CallFunctionArgumentBinding,
  type CallFunctionNodeDocumentState,
  type ExpressionSource,
  serializeExpressionSource,
} from '../../domain/studio/contracts';
import type { RuntimeMethodInvokeArgument, RuntimeMethodInvokeResult } from '../../domain/analysis/contracts';

export interface CallFunctionArgumentEntry {
  id: StableId;
  name: string;
  source: ExpressionSource;
}

export interface CallFunctionNodeData extends BaseNodeData {
  selectedMethodStableId: StableId | null;
  arguments: CallFunctionArgumentEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function createCallFunctionNodeData(): CallFunctionNodeData {
  return {
    selectedMethodStableId: null,
    arguments: [],
  };
}

export function toCallFunctionDocumentState(data: CallFunctionNodeData): CallFunctionNodeDocumentState {
  return {
    selectedMethodStableId: data.selectedMethodStableId,
    arguments: data.arguments.map((entry) => ({
      stableId: entry.id,
      name: entry.name,
      valueSource: entry.source,
    })),
  };
}

export function fromCallFunctionDocumentState(documentState: CallFunctionNodeDocumentState): Pick<CallFunctionNodeData, 'selectedMethodStableId' | 'arguments'> {
  return {
    selectedMethodStableId: documentState.selectedMethodStableId,
    arguments: documentState.arguments.map((entry) => ({
      id: entry.stableId,
      name: entry.name,
      source: entry.valueSource,
    })),
  };
}

export function parseCallFunctionNodeDataFromDocumentState(
  baseData: BaseNodeData,
  instance: import('../../domain/studio/contracts').NodeInstance,
): CallFunctionNodeData {
  const documentState = parseCallFunctionNodeDocumentState(instance.documentState);
  return {
    ...baseData,
    nodeName: instance.displayName,
    ...fromCallFunctionDocumentState(documentState),
  };
}

export function findSelectedFunction(
  classInfo: ClassInfoPayload | null | undefined,
  selectedMethodStableId: StableId | null | undefined,
): ClassInfoFunctionPayload | null {
  if (!classInfo || !selectedMethodStableId) {
    return null;
  }

  return classInfo.functions.find((item) => item.runtimeRef.methodStableId === selectedMethodStableId) ?? null;
}

export function reconcileCallFunctionArguments(
  nodeId: string,
  selectedMethodStableId: StableId | null,
  parameters: ClassInfoFunctionPayload['parameters'],
  currentArguments: CallFunctionArgumentEntry[],
): CallFunctionArgumentEntry[] {
  const currentByName = new Map(currentArguments.map((entry) => [entry.name, entry]));

  return parameters.map((parameter) => {
    const current = currentByName.get(parameter.name);
    return current ?? {
      id: createStableId('binding', [nodeId, selectedMethodStableId ?? 'method', parameter.name]),
      name: parameter.name,
      source: createLiteralExpressionSource(''),
    };
  });
}

export function hasSameCallFunctionArguments(left: CallFunctionArgumentEntry[], right: CallFunctionArgumentEntry[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((entry, index) => {
    const candidate = right[index];
    return candidate
      && candidate.id === entry.id
      && candidate.name === entry.name
      && serializeExpressionSource(candidate.source) === serializeExpressionSource(entry.source);
  });
}

export function getClassInfoPayloadFromValue(value: unknown): ClassInfoPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!Array.isArray(value.functions) || !Array.isArray(value.statics) || !Array.isArray(value.members) || !('basic' in value)) {
    return null;
  }

  return value as unknown as ClassInfoPayload;
}

export function createCallFunctionPreviewEnvelope(
  method: ClassInfoFunctionPayload | null,
  instanceAddress: WorkflowJsonValue,
  argumentsPayload: CallFunctionResultPayload['arguments'],
) {
  return createCallFunctionResultEnvelope({
    method,
    instanceAddress,
    arguments: argumentsPayload,
    success: false,
    failureKind: 'none',
    error: null,
    exception: null,
    result: null,
  });
}

export function toRuntimeInvokeArgument(
  argumentName: string,
  typeName: string,
  value: WorkflowJsonValue,
): RuntimeMethodInvokeArgument {
  if (value === null || value === undefined) {
    return {
      name: argumentName,
      typeName,
      valueKind: 'null',
      value: null,
    };
  }

  if (typeof value === 'boolean') {
    return {
      name: argumentName,
      typeName,
      valueKind: 'boolean',
      value: value ? 'true' : 'false',
    };
  }

  if (typeof value === 'number') {
    return {
      name: argumentName,
      typeName,
      valueKind: 'number',
      value: String(value),
    };
  }

  if (typeof value === 'string') {
    return {
      name: argumentName,
      typeName,
      valueKind: 'string',
      value,
    };
  }

  throw new Error(`Unsupported argument value for ${argumentName}`);
}

export function toCallFunctionResultPayload(
  method: ClassInfoFunctionPayload | null,
  instanceAddress: WorkflowJsonValue,
  argumentsPayload: CallFunctionResultPayload['arguments'],
  result: RuntimeMethodInvokeResult,
): CallFunctionResultPayload {
  return {
    method,
    instanceAddress,
    arguments: argumentsPayload,
    success: result.success,
    failureKind: result.failureKind,
    error: result.error,
    exception: result.exception,
    result: result.result ? {
      kind: result.result.kind,
      value: result.result.value ?? null,
      objectAddress: result.result.objectAddress,
    } : null,
  };
}

export function toCallFunctionArgumentBindings(argumentsList: CallFunctionArgumentEntry[]): CallFunctionArgumentBinding[] {
  return argumentsList.map((entry) => ({
    stableId: entry.id,
    name: entry.name,
    valueSource: entry.source,
  }));
}