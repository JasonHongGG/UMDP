import type { StableId } from '../../contracts/shared-identity';

export type ExpressionValueType = 'string' | 'number' | 'boolean' | 'address' | 'json';

export interface LiteralSource {
  kind: 'literal';
  valueType: ExpressionValueType;
  raw: string;
}

export interface InputExpressionSource {
  kind: 'input-expression';
  expression: string;
  bindingSlot: string;
  sourceNodeId?: string;
  sourcePath: string[];
  displayText: string;
}

export interface StaticExpressionSource {
  kind: 'static-expression';
  expression: string;
  classStableId: StableId;
  memberStableId: StableId;
  displayText: string;
}

export type ExpressionSource = LiteralSource | InputExpressionSource | StaticExpressionSource;

export interface ExpressionReferenceDragPayload {
  version: 1;
  source: InputExpressionSource | StaticExpressionSource;
  origin: 'input-panel' | 'class-static-panel';
}

export function isExpressionReferenceDragPayload(value: unknown): value is ExpressionReferenceDragPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<ExpressionReferenceDragPayload>;
  return payload.version === 1 && (payload.origin === 'input-panel' || payload.origin === 'class-static-panel') && !!payload.source;
}

export function serializeExpressionSource(source: ExpressionSource) {
  return JSON.stringify(source);
}

export function parseExpressionSource(serialized: string): ExpressionSource | null {
  try {
    const parsed = JSON.parse(serialized) as ExpressionSource;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.kind !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}