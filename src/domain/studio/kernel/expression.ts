export type ExpressionValueKind = 'unknown' | 'null' | 'boolean' | 'number' | 'string' | 'address' | 'json';
export type ExpressionNodeKind = 'literal' | 'binding-ref' | 'path';
export type ExpressionPathSegment = string | number;

export interface LiteralExpressionSource {
  kind: 'literal';
  valueKind: Exclude<ExpressionValueKind, 'unknown'>;
  raw: string;
}

export interface BindingExpressionSource {
  kind: 'binding';
  bindingId: string;
  path: ExpressionPathSegment[];
  expectedKind?: ExpressionValueKind | null;
}

export type ExpressionSource = LiteralExpressionSource | BindingExpressionSource;

export interface ExpressionDiagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface LiteralExpressionNode {
  kind: 'literal';
  valueKind: ExpressionValueKind;
  value: unknown;
}

export interface BindingReferenceNode {
  kind: 'binding-ref';
  bindingId: string;
}

export interface PathExpressionNode {
  kind: 'path';
  source: BindingReferenceNode;
  path: ExpressionPathSegment[];
}

export type ExpressionNode = LiteralExpressionNode | BindingReferenceNode | PathExpressionNode;

export interface ExpressionProgram {
  version: 1;
  resultKind: ExpressionValueKind;
  root: ExpressionNode;
  diagnostics: ExpressionDiagnostic[];
}

export interface ExpressionEvaluationContext {
  bindings: Record<string, unknown>;
}

export function createLiteralExpressionSource(
  raw: string,
  valueKind: LiteralExpressionSource['valueKind'] = 'string',
): LiteralExpressionSource {
  return {
    kind: 'literal',
    raw,
    valueKind,
  };
}

export function createBindingExpressionSource(
  bindingId: string,
  path: ExpressionPathSegment[] = [],
  expectedKind: BindingExpressionSource['expectedKind'] = null,
): BindingExpressionSource {
  return {
    kind: 'binding',
    bindingId,
    path,
    expectedKind,
  };
}