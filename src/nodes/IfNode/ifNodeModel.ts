import type { BaseNodeData, StudioNodeRuntimeState } from '../../core/studio/types';
import type { NodeInstance } from '../../domain/studio/contracts';
import {
  parseIfNodeDocumentState,
  type ExpressionSource,
  type IfNodeDocumentState,
} from '../../domain/studio/contracts';

export interface IfNodeData extends BaseNodeData, IfNodeDocumentState {}

export function createIfNodeData(): IfNodeData {
  return {
    leftSource: null,
    operator: 'eq',
    rightMode: 'literal',
    rightSource: null,
  };
}

export function toIfNodeDocumentState(data: IfNodeData): IfNodeDocumentState {
  return {
    leftSource: data.leftSource,
    operator: data.operator,
    rightMode: data.rightMode,
    rightSource: data.rightSource,
  };
}

export function parseIfNodeDataFromDocumentState(baseData: BaseNodeData, instance: NodeInstance): IfNodeData {
  return {
    ...baseData,
    nodeName: instance.displayName,
    ...parseIfNodeDocumentState(instance.documentState),
  };
}

export function createIfNodeRuntimeState(data: IfNodeData): StudioNodeRuntimeState {
  const bindings: Record<string, ExpressionSource> = {};

  if (data.leftSource) {
    bindings.leftSource = data.leftSource;
  }

  if (data.rightSource) {
    bindings.rightSource = data.rightSource;
  }

  return {
    displayName: data.nodeName?.trim() || undefined,
    parameters: {},
    bindings,
    documentState: toIfNodeDocumentState(data) as unknown as Record<string, unknown>,
  };
}