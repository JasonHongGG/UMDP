import { formatHexAddress } from '../../core/addressFormat';
import { createLiteralExpressionSource } from '../../core/studio/expression';
import type { LiteralSource } from '../../domain/studio/contracts';
import type { IfOperator, IfScalarKind } from '../../domain/studio/contracts';

export interface IfLiteralParseResult {
  valid: boolean;
  normalizedRaw: string;
  value: unknown;
  error?: string;
}

export interface IfComparablePairResult {
  valid: boolean;
  left: unknown;
  right: unknown;
  error?: string;
}

export const IF_OPERATOR_LABELS: Record<IfOperator, string> = {
  is: 'is',
  'is-not': 'is not',
  eq: 'equals',
  ne: 'does not equal',
  gt: 'greater than',
  gte: 'greater than or equal',
  lt: 'less than',
  lte: 'less than or equal',
  contains: 'contains',
  'starts-with': 'starts with',
  'ends-with': 'ends with',
};

const BOOLEAN_OPERATORS: IfOperator[] = ['is', 'is-not'];
const NUMBER_OPERATORS: IfOperator[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'];
const STRING_OPERATORS: IfOperator[] = ['eq', 'ne', 'contains', 'starts-with', 'ends-with'];
const ADDRESS_OPERATORS: IfOperator[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'];

function isHexLike(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith('0x') || trimmed.startsWith('0X')
    ? trimmed.slice(2)
    : trimmed;

  return normalized.length > 0 && /^[0-9a-fA-F]+$/.test(normalized);
}

export function classifyIfScalarKind(value: unknown): IfScalarKind {
  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return 'number';
  }

  if (typeof value === 'string') {
    return isHexLike(value) ? 'address' : 'string';
  }

  return 'unsupported';
}

export function getAllowedIfOperators(kind: IfScalarKind): IfOperator[] {
  switch (kind) {
    case 'boolean':
      return BOOLEAN_OPERATORS;
    case 'number':
      return NUMBER_OPERATORS;
    case 'string':
      return STRING_OPERATORS;
    case 'address':
      return ADDRESS_OPERATORS;
    default:
      return [];
  }
}

export function isIfOperatorAllowed(kind: IfScalarKind, operator: IfOperator): boolean {
  return getAllowedIfOperators(kind).includes(operator);
}

export function getDefaultIfOperator(kind: IfScalarKind): IfOperator {
  return getAllowedIfOperators(kind)[0] ?? 'eq';
}

export function createDefaultIfRightLiteralSource(kind: IfScalarKind): LiteralSource {
  switch (kind) {
    case 'boolean':
      return createLiteralExpressionSource('false', 'boolean');
    case 'number':
      return createLiteralExpressionSource('', 'number');
    case 'address':
      return createLiteralExpressionSource('', 'address');
    case 'string':
    case 'unsupported':
    default:
      return createLiteralExpressionSource('', 'string');
  }
}

export function parseLiteralForIfKind(kind: IfScalarKind, raw: string): IfLiteralParseResult {
  if (kind === 'unsupported') {
    return {
      valid: false,
      normalizedRaw: raw,
      value: raw,
      error: 'Unsupported value type for if comparison.',
    };
  }

  if (kind === 'boolean') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'false') {
      return {
        valid: true,
        normalizedRaw: normalized,
        value: normalized === 'true',
      };
    }

    return {
      valid: false,
      normalizedRaw: raw,
      value: raw,
      error: 'Boolean comparisons only accept true or false.',
    };
  }

  if (kind === 'number') {
    const trimmed = raw.trim();
    const parsed = Number(trimmed);
    if (trimmed && Number.isFinite(parsed)) {
      return {
        valid: true,
        normalizedRaw: String(parsed),
        value: parsed,
      };
    }

    return {
      valid: false,
      normalizedRaw: raw,
      value: raw,
      error: 'Numeric comparisons require a valid number.',
    };
  }

  if (kind === 'address') {
    const normalized = formatHexAddress(raw);
    if (normalized && isHexLike(raw)) {
      return {
        valid: true,
        normalizedRaw: normalized,
        value: normalized,
      };
    }

    return {
      valid: false,
      normalizedRaw: raw,
      value: raw,
      error: 'Address comparisons require a hexadecimal value.',
    };
  }

  return {
    valid: true,
    normalizedRaw: raw,
    value: raw,
  };
}

function normalizeComparableValue(kind: IfScalarKind, value: unknown): IfLiteralParseResult {
  if (kind === 'boolean') {
    if (typeof value === 'boolean') {
      return { valid: true, normalizedRaw: value ? 'true' : 'false', value };
    }

    return { valid: false, normalizedRaw: String(value ?? ''), value, error: 'Expected a boolean value.' };
  }

  if (kind === 'number') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { valid: true, normalizedRaw: String(value), value };
    }

    return { valid: false, normalizedRaw: String(value ?? ''), value, error: 'Expected a numeric value.' };
  }

  if (kind === 'address') {
    if (typeof value === 'string') {
      const normalized = formatHexAddress(value);
      if (normalized && isHexLike(value)) {
        return { valid: true, normalizedRaw: normalized, value: normalized };
      }
    }

    return { valid: false, normalizedRaw: String(value ?? ''), value, error: 'Expected a hexadecimal address value.' };
  }

  if (kind === 'string') {
    if (typeof value === 'string') {
      return { valid: true, normalizedRaw: value, value };
    }

    return { valid: false, normalizedRaw: String(value ?? ''), value, error: 'Expected a string value.' };
  }

  return { valid: false, normalizedRaw: String(value ?? ''), value, error: 'Unsupported comparison value.' };
}

export function coerceComparablePair(kind: IfScalarKind, leftValue: unknown, rightValue: unknown): IfComparablePairResult {
  const normalizedLeft = normalizeComparableValue(kind, leftValue);
  if (!normalizedLeft.valid) {
    return {
      valid: false,
      left: leftValue,
      right: rightValue,
      error: normalizedLeft.error,
    };
  }

  const normalizedRight = normalizeComparableValue(kind, rightValue);
  if (!normalizedRight.valid) {
    return {
      valid: false,
      left: normalizedLeft.value,
      right: rightValue,
      error: normalizedRight.error,
    };
  }

  return {
    valid: true,
    left: normalizedLeft.value,
    right: normalizedRight.value,
  };
}

export function evaluateIfPredicate(kind: IfScalarKind, leftValue: unknown, operator: IfOperator, rightValue: unknown): boolean {
  if (!isIfOperatorAllowed(kind, operator)) {
    throw new Error(`Operator ${operator} is not valid for ${kind}.`);
  }

  const comparable = coerceComparablePair(kind, leftValue, rightValue);
  if (!comparable.valid) {
    throw new Error(comparable.error ?? 'Values are not comparable.');
  }

  const { left, right } = comparable;

  switch (operator) {
    case 'is':
    case 'eq':
      return left === right;
    case 'is-not':
    case 'ne':
      return left !== right;
    case 'gt':
      return (left as number | string) > (right as number | string);
    case 'gte':
      return (left as number | string) >= (right as number | string);
    case 'lt':
      return (left as number | string) < (right as number | string);
    case 'lte':
      return (left as number | string) <= (right as number | string);
    case 'contains':
      return String(left).includes(String(right));
    case 'starts-with':
      return String(left).startsWith(String(right));
    case 'ends-with':
      return String(left).endsWith(String(right));
    default:
      return false;
  }
}

export function formatIfValuePreview(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[object]';
    }
  }

  return String(value);
}