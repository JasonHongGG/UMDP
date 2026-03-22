import {
  createLiteralExpressionSource,
  getExpressionSourceDisplayValue,
  resolveExpressionSource,
} from '../../core/studio/expression';
import type { BaseNodeData, StudioNodeRuntimeState } from '../../core/studio/types';
import type { NodeExecutionContext, NodeExecutionSnapshot, NodeInstance } from '../../domain/studio/contracts';
import {
  type InputExpressionSource,
  type ExpressionValueType,
  parseForLoopNodeDocumentState,
  type ExpressionSource,
  type ForLoopNodeDocumentState,
} from '../../domain/studio/contracts';

export const FOR_LOOP_COUNT_INPUT_PORT_ID = 'count-in';
export const FOR_LOOP_COUNT_VALUE_TYPE: ExpressionValueType = 'number';

export interface ForLoopNodeData extends BaseNodeData {
  countSource: ExpressionSource | null;
}

export interface ForLoopExecutionState {
  currentIndex?: number;
  totalCount?: number;
}

export interface ForLoopIterationPayload {
  index: number;
  totalCount: number;
  isFirstIteration: boolean;
  isLastIteration: boolean;
}

export function createForLoopNodeData(): ForLoopNodeData {
  return {
    countSource: createLiteralExpressionSource('1', 'number'),
  };
}

export function toForLoopNodeDocumentState(data: ForLoopNodeData): ForLoopNodeDocumentState {
  return {
    countSource: data.countSource,
  };
}

export function parseForLoopNodeDataFromDocumentState(baseData: BaseNodeData, instance: NodeInstance): ForLoopNodeData {
  return {
    ...baseData,
    nodeName: instance.displayName,
    ...parseForLoopNodeDocumentState(instance.documentState),
  };
}

export function createForLoopNodeRuntimeState(data: ForLoopNodeData): StudioNodeRuntimeState {
  const bindings: Record<string, ExpressionSource> = {};

  if (data.countSource) {
    bindings.countSource = data.countSource;
  }

  return {
    displayName: data.nodeName?.trim() || undefined,
    parameters: {},
    bindings,
    documentState: toForLoopNodeDocumentState(data) as unknown as Record<string, unknown>,
  };
}

export function parseForLoopExecutionState(value: unknown): ForLoopExecutionState {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const candidate = value as { currentIndex?: unknown; totalCount?: unknown };
  return {
    currentIndex: typeof candidate.currentIndex === 'number' && Number.isInteger(candidate.currentIndex) ? candidate.currentIndex : undefined,
    totalCount: typeof candidate.totalCount === 'number' && Number.isInteger(candidate.totalCount) ? candidate.totalCount : undefined,
  };
}

function getForLoopInputDisplayText(sourceNodeId: string, sourcePortId: string, sourceNodeName?: string) {
  const sourceLabel = sourceNodeName?.trim() || sourceNodeId;
  return `${sourceLabel}.${sourcePortId}`;
}

export function createForLoopCountInputExpressionSource(
  sourceNodeId: string,
  sourcePortId: string,
  sourceNodeName?: string,
): InputExpressionSource {
  return {
    kind: 'input-expression',
    expression: `={{ $node["${sourceNodeId}"].json["${sourcePortId}"] }}`,
    bindingSlot: FOR_LOOP_COUNT_INPUT_PORT_ID,
    sourceNodeId,
    sourcePath: [],
    displayText: getForLoopInputDisplayText(sourceNodeId, sourcePortId, sourceNodeName),
    valueTypeHint: FOR_LOOP_COUNT_VALUE_TYPE,
  };
}

export function isForLoopCountInputExpressionSource(source: ExpressionSource | null | undefined) {
  return source?.kind === 'input-expression'
    && source.bindingSlot === FOR_LOOP_COUNT_INPUT_PORT_ID
    && source.sourcePath.length === 0;
}

export function areForLoopCountSourcesEqual(left: ExpressionSource | null | undefined, right: ExpressionSource | null | undefined) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function getResolvedForLoopCountInput(context: Pick<NodeExecutionContext, 'resolvedInputs'>) {
  return context.resolvedInputs[FOR_LOOP_COUNT_INPUT_PORT_ID]?.[0];
}

export function resolveLoopCountCandidate(
  source: ExpressionSource | null,
  context: {
    snapshots?: Record<string, NodeExecutionSnapshot>;
    resolvedBinding?: unknown;
    resolvedInput?: unknown;
  },
) {
  if (context.resolvedInput !== undefined) {
    return context.resolvedInput;
  }

  if (!source) {
    return undefined;
  }

  if (source.kind === 'literal') {
    return resolveExpressionSource(source, { snapshots: context.snapshots ?? {} });
  }

  return context.resolvedBinding;
}

export function parseLoopCountValue(candidate: unknown, options?: { allowUndefined?: boolean }) {
  if (options?.allowUndefined && candidate === undefined) {
    return { valid: false as const, reason: 'missing' as const };
  }

  if (candidate === undefined || candidate === null) {
    return { valid: false as const, reason: 'missing' as const };
  }

  const normalized = typeof candidate === 'string' ? candidate.trim() : candidate;
  if (normalized === '') {
    return { valid: false as const, reason: 'missing' as const };
  }

  const parsed = typeof normalized === 'number' ? normalized : Number(normalized);
  if (!Number.isFinite(parsed)) {
    return { valid: false as const, reason: 'not-a-number' as const };
  }

  if (!Number.isInteger(parsed)) {
    return { valid: false as const, reason: 'not-an-integer' as const };
  }

  if (parsed < 0) {
    return { valid: false as const, reason: 'negative' as const };
  }

  return { valid: true as const, value: parsed };
}

export function buildForLoopIterationPayload(index: number, totalCount: number): ForLoopIterationPayload {
  return {
    index,
    totalCount,
    isFirstIteration: index === 0,
    isLastIteration: index === totalCount - 1,
  };
}

export function getForLoopSubtitle(data: ForLoopNodeData) {
  if (!data.countSource) {
    return 'Count Missing';
  }

  if (data.countSource.kind === 'literal') {
    const parsed = parseLoopCountValue(resolveLoopCountCandidate(data.countSource, {}));
    return parsed.valid ? `Loop x${parsed.value}` : 'Invalid Count';
  }

  return getExpressionSourceDisplayValue(data.countSource) ? 'Expr Count' : 'Count Missing';
}