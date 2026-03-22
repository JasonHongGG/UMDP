import { formatExplicitHexAddress } from '../../addressFormat';
import type {
  ExpressionNumericKind,
  ExpressionSemanticKind,
  ExpressionSemanticOrigin,
  ExpressionSource,
  ExpressionValueType,
} from '../../../domain/studio/contracts';

const BOOLEAN_TYPES = new Set(['system.boolean', 'bool']);
const INTEGER_TYPES = new Set([
  'system.byte',
  'system.sbyte',
  'system.int16',
  'system.uint16',
  'system.int32',
  'system.uint32',
  'system.int64',
  'system.uint64',
  'byte',
  'sbyte',
  'short',
  'ushort',
  'int',
  'uint',
  'long',
  'ulong',
]);
const FLOAT_TYPES = new Set(['system.single', 'system.double', 'float', 'double']);
const STRING_TYPES = new Set(['system.string', 'string']);
const ADDRESS_TYPES = new Set(['system.intptr', 'system.uintptr', 'intptr', 'uintptr']);

export interface ExpressionSemanticResult {
  kind: ExpressionSemanticKind;
  numericKind: ExpressionNumericKind;
  origin: ExpressionSemanticOrigin;
}

function semanticFromValueType(valueType: ExpressionValueType): ExpressionSemanticResult {
  switch (valueType) {
    case 'boolean':
      return { kind: 'boolean', numericKind: null, origin: 'literal-declared' };
    case 'number':
      return { kind: 'number', numericKind: null, origin: 'literal-declared' };
    case 'address':
      return { kind: 'address', numericKind: null, origin: 'literal-declared' };
    case 'json':
      return { kind: 'json', numericKind: null, origin: 'literal-declared' };
    case 'string':
    default:
      return { kind: 'string', numericKind: null, origin: 'literal-declared' };
  }
}

export function getExpressionSourceValueTypeHint(source: ExpressionSource | null | undefined): ExpressionValueType | null {
  if (!source) {
    return null;
  }

  if (source.kind === 'literal') {
    return source.valueType;
  }

  return source.valueTypeHint ?? null;
}

export function classifyRuntimeSemanticKind(value: unknown): ExpressionSemanticResult {
  if (typeof value === 'boolean') {
    return { kind: 'boolean', numericKind: null, origin: 'runtime' };
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return { kind: 'number', numericKind: Number.isInteger(value) ? 'integer' : 'float', origin: 'runtime' };
  }

  if (typeof value === 'string') {
    return { kind: 'string', numericKind: null, origin: 'runtime' };
  }

  if (Array.isArray(value)) {
    return { kind: 'json', numericKind: null, origin: 'runtime' };
  }

  if (value && typeof value === 'object') {
    return { kind: 'json', numericKind: null, origin: 'runtime' };
  }

  if (value === null || value === undefined) {
    return { kind: 'unknown', numericKind: null, origin: 'unresolved' };
  }

  return { kind: 'unsupported', numericKind: null, origin: 'unsupported' };
}

export function classifyExpressionSemantic(source: ExpressionSource | null | undefined, resolvedValue: unknown): ExpressionSemanticResult {
  if (!source) {
    return classifyRuntimeSemanticKind(resolvedValue);
  }

  if (source.kind === 'literal') {
    if (source.raw.trim().length === 0) {
      const declared = semanticFromValueType(source.valueType);
      return { ...declared, origin: 'empty-literal' };
    }

    return semanticFromValueType(source.valueType);
  }

  if (source.valueTypeHint) {
    const hinted = semanticFromValueType(source.valueTypeHint);
    return { ...hinted, origin: 'source-hint' };
  }

  return classifyRuntimeSemanticKind(resolvedValue);
}

export function classifySchemaTypeSemantic(typeName: string): ExpressionSemanticResult {
  const normalized = typeName.trim().toLowerCase();

  if (BOOLEAN_TYPES.has(normalized)) {
    return { kind: 'boolean', numericKind: null, origin: 'schema' };
  }

  if (INTEGER_TYPES.has(normalized)) {
    return { kind: 'number', numericKind: 'integer', origin: 'schema' };
  }

  if (FLOAT_TYPES.has(normalized)) {
    return { kind: 'number', numericKind: 'float', origin: 'schema' };
  }

  if (STRING_TYPES.has(normalized)) {
    return { kind: 'string', numericKind: null, origin: 'schema' };
  }

  if (ADDRESS_TYPES.has(normalized)) {
    return { kind: 'address', numericKind: null, origin: 'schema' };
  }

  return { kind: 'unsupported', numericKind: null, origin: 'unsupported' };
}

export function toLiteralValueTypeForSemanticKind(kind: ExpressionSemanticKind): ExpressionValueType {
  switch (kind) {
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'number';
    case 'address':
      return 'address';
    case 'json':
      return 'json';
    case 'string':
    case 'unknown':
    case 'unsupported':
    default:
      return 'string';
  }
}

export function normalizeExplicitAddressValue(value: string): string | null {
  return formatExplicitHexAddress(value);
}