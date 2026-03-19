import type {
  ExpressionReferenceDragPayload,
  ExpressionSource,
  InputExpressionSource,
  LiteralSource,
  StaticExpressionSource,
} from '../../../domain/studio/contracts';
import { parseExpressionSource } from '../../../domain/studio/contracts';
import type { StableId } from '../../../domain/contracts/shared-identity';
import type { NodeExecutionSnapshot } from '../types';

export const STUDIO_EXPRESSION_DRAG_MIME = 'application/x-umdp-expression-source';

export interface ExpressionPresentation {
  badgeText: 'INPUT' | 'STATIC';
  badgeClassName: string;
  helperText: string;
}

export interface ExpressionResolutionContext {
  snapshots: Record<string, NodeExecutionSnapshot>;
  resolveStaticFieldAddress?: (classStableId: string, memberStableId: string) => string | null;
}

export function createLiteralExpressionSource(raw: string, valueType: LiteralSource['valueType'] = 'string'): LiteralSource {
  return {
    kind: 'literal',
    valueType,
    raw,
  };
}

export function createInputExpressionSource(sourceNodeId: string, sourcePortId: string, path: string[], displayText: string): InputExpressionSource {
  const pathExpression = path.length > 0 ? `.${path.join('.')}` : '';
  return {
    kind: 'input-expression',
    expression: `={{ $node["${sourceNodeId}"].json["${sourcePortId}"]${pathExpression} }}`,
    bindingSlot: sourcePortId,
    sourceNodeId,
    sourcePath: path,
    displayText,
  };
}

export function createStaticExpressionSource(classStableId: StableId, memberStableId: StableId, displayText: string): StaticExpressionSource {
  return {
    kind: 'static-expression',
    expression: `={{ $class["${classStableId}"].static["${memberStableId}"] }}`,
    classStableId,
    memberStableId,
    displayText,
  };
}

export function createExpressionReferenceDragPayload(
  source: InputExpressionSource | StaticExpressionSource,
  origin: ExpressionReferenceDragPayload['origin'],
): ExpressionReferenceDragPayload {
  return {
    version: 1,
    source,
    origin,
  };
}

export function getExpressionSourceDisplayValue(source: ExpressionSource | null | undefined) {
  if (!source) {
    return '';
  }

  if (source.kind === 'literal') {
    return source.raw;
  }

  return source.displayText || source.expression;
}

export function hasExpressionSourceValue(source: ExpressionSource | null | undefined) {
  if (!source) {
    return false;
  }

  if (source.kind === 'literal') {
    return source.raw.trim().length > 0;
  }

  return source.expression.trim().length > 0;
}

export function getExpressionPresentation(source: ExpressionSource | null | undefined): ExpressionPresentation | null {
  if (!source || source.kind === 'literal') {
    return null;
  }

  if (source.kind === 'input-expression') {
    return {
      badgeText: 'INPUT',
      badgeClassName: 'border-cyan-400/40 bg-cyan-500/12 text-cyan-200',
      helperText: 'Value follows upstream input data.',
    };
  }

  return {
    badgeText: 'STATIC',
    badgeClassName: 'border-fuchsia-400/40 bg-fuchsia-500/12 text-fuchsia-200',
    helperText: 'Value resolves from a class static field.',
  };
}

export function writeExpressionDragData(dataTransfer: DataTransfer, payload: ExpressionReferenceDragPayload) {
  dataTransfer.setData(STUDIO_EXPRESSION_DRAG_MIME, JSON.stringify(payload));
  dataTransfer.setData('text/plain', payload.source.expression);
  dataTransfer.effectAllowed = 'copy';
}

function getValueAtPath(value: unknown, path: string[]) {
  return path.reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }

    if (typeof current === 'object') {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, value);
}

function resolveLiteralValue(source: LiteralSource) {
  if (source.valueType === 'number') {
    const parsed = Number(source.raw);
    return Number.isNaN(parsed) ? source.raw : parsed;
  }

  if (source.valueType === 'boolean') {
    if (source.raw === 'true') {
      return true;
    }

    if (source.raw === 'false') {
      return false;
    }
  }

  if (source.valueType === 'json') {
    try {
      return JSON.parse(source.raw);
    } catch {
      return source.raw;
    }
  }

  return source.raw;
}

export function resolveExpressionSource(source: ExpressionSource, context: ExpressionResolutionContext) {
  if (source.kind === 'literal') {
    return resolveLiteralValue(source);
  }

  if (source.kind === 'input-expression') {
    const sourceNodeId = source.sourceNodeId;
    if (!sourceNodeId) {
      return undefined;
    }

    const payload = context.snapshots[sourceNodeId]?.outputs[source.bindingSlot]?.payload;
    if (payload === undefined) {
      return undefined;
    }

    return getValueAtPath(payload, source.sourcePath);
  }

  return context.resolveStaticFieldAddress?.(source.classStableId, source.memberStableId) ?? null;
}

export function resolveExpressionBindingValue(
  binding: ExpressionSource | ExpressionSource[],
  context: ExpressionResolutionContext,
) {
  if (Array.isArray(binding)) {
    return binding.map((entry) => resolveExpressionSource(entry, context));
  }

  return resolveExpressionSource(binding, context);
}

export function readExpressionDragData(dataTransfer: DataTransfer): ExpressionSource | null {
  const rawPayload = dataTransfer.getData(STUDIO_EXPRESSION_DRAG_MIME);
  if (rawPayload) {
    try {
      const parsed = JSON.parse(rawPayload) as ExpressionReferenceDragPayload;
      if (parsed?.version === 1 && parsed.source) {
        return parsed.source;
      }
    } catch {
      return null;
    }
  }

  const textPayload = dataTransfer.getData('text/plain');
  if (!textPayload) {
    return null;
  }

  return parseExpressionSource(textPayload) ?? createLiteralExpressionSource(textPayload, 'address');
}