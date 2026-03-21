import { formatHexAddress } from '../../core/addressFormat';
import { createLiteralExpressionSource } from '../../core/studio/expression';
import type { ExpressionSource, WorkflowJsonValue } from '../../domain/studio/contracts';
import type { RuntimeFieldValueKind } from '../../domain/analysis/contracts';

export type EditorScalarKind = 'boolean' | 'integer' | 'float' | 'string' | 'address' | 'unsupported';

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

function normalizeTypeName(typeName: string) {
  return typeName.trim().toLowerCase();
}

export function classifyEditorScalarKind(typeName: string): EditorScalarKind {
  const normalized = normalizeTypeName(typeName);

  if (BOOLEAN_TYPES.has(normalized)) {
    return 'boolean';
  }

  if (INTEGER_TYPES.has(normalized)) {
    return 'integer';
  }

  if (FLOAT_TYPES.has(normalized)) {
    return 'float';
  }

  if (STRING_TYPES.has(normalized)) {
    return 'string';
  }

  if (ADDRESS_TYPES.has(normalized)) {
    return 'address';
  }

  return 'unsupported';
}

export function createDefaultValueSourceForKind(kind: EditorScalarKind): ExpressionSource {
  switch (kind) {
    case 'boolean':
      return createLiteralExpressionSource('false', 'boolean');
    case 'integer':
    case 'float':
      return createLiteralExpressionSource('', 'number');
    case 'address':
      return createLiteralExpressionSource('', 'address');
    case 'string':
    case 'unsupported':
    default:
      return createLiteralExpressionSource('', 'string');
  }
}

export function getEditorValueKind(kind: EditorScalarKind): RuntimeFieldValueKind | null {
  switch (kind) {
    case 'boolean':
      return 'boolean';
    case 'integer':
      return 'integer';
    case 'float':
      return 'float';
    case 'string':
      return 'string';
    case 'address':
      return 'address';
    default:
      return null;
  }
}

export interface EditorValueParseResult {
  valid: boolean;
  normalizedDisplay: string;
  value: WorkflowJsonValue;
  serializedValue: string | null;
  error?: string;
}

function parseBooleanValue(raw: string): EditorValueParseResult {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === 'false') {
    return {
      valid: true,
      normalizedDisplay: normalized,
      value: normalized === 'true',
      serializedValue: normalized,
    };
  }

  return {
    valid: false,
    normalizedDisplay: raw,
    value: raw,
    serializedValue: null,
    error: 'Boolean fields only accept true or false.',
  };
}

function parseIntegerValue(raw: string): EditorValueParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      valid: false,
      normalizedDisplay: raw,
      value: raw,
      serializedValue: null,
      error: 'Integer fields require a numeric value.',
    };
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return {
      valid: false,
      normalizedDisplay: raw,
      value: raw,
      serializedValue: null,
      error: 'Integer fields require a whole number.',
    };
  }

  return {
    valid: true,
    normalizedDisplay: String(parsed),
    value: parsed,
    serializedValue: String(parsed),
  };
}

function parseFloatValue(raw: string): EditorValueParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      valid: false,
      normalizedDisplay: raw,
      value: raw,
      serializedValue: null,
      error: 'Floating-point fields require a numeric value.',
    };
  }

  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) {
    return {
      valid: false,
      normalizedDisplay: raw,
      value: raw,
      serializedValue: null,
      error: 'Floating-point fields require a numeric value.',
    };
  }

  return {
    valid: true,
    normalizedDisplay: String(parsed),
    value: parsed,
    serializedValue: String(parsed),
  };
}

function parseAddressValue(raw: string): EditorValueParseResult {
  const normalized = formatHexAddress(raw);
  if (!normalized) {
    return {
      valid: false,
      normalizedDisplay: raw,
      value: raw,
      serializedValue: null,
      error: 'Address fields require a hexadecimal value.',
    };
  }

  return {
    valid: true,
    normalizedDisplay: normalized,
    value: normalized,
    serializedValue: normalized,
  };
}

export function coerceWorkflowValueForEditorKind(kind: EditorScalarKind, value: WorkflowJsonValue): EditorValueParseResult {
  if (kind === 'unsupported') {
    return {
      valid: false,
      normalizedDisplay: String(value ?? ''),
      value,
      serializedValue: null,
      error: 'Unsupported member type for Editor node.',
    };
  }

  if (kind === 'string') {
    return {
      valid: typeof value === 'string',
      normalizedDisplay: typeof value === 'string' ? value : String(value ?? ''),
      value: typeof value === 'string' ? value : String(value ?? ''),
      serializedValue: typeof value === 'string' ? value : null,
      error: typeof value === 'string' ? undefined : 'Value must resolve to a string.',
    };
  }

  if (kind === 'boolean') {
    if (typeof value === 'boolean') {
      return {
        valid: true,
        normalizedDisplay: value ? 'true' : 'false',
        value,
        serializedValue: value ? 'true' : 'false',
      };
    }

    return parseBooleanValue(String(value ?? ''));
  }

  if (kind === 'integer') {
    if (typeof value === 'number' && Number.isInteger(value)) {
      return {
        valid: true,
        normalizedDisplay: String(value),
        value,
        serializedValue: String(value),
      };
    }

    return parseIntegerValue(String(value ?? ''));
  }

  if (kind === 'float') {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return {
        valid: true,
        normalizedDisplay: String(value),
        value,
        serializedValue: String(value),
      };
    }

    return parseFloatValue(String(value ?? ''));
  }

  return parseAddressValue(String(value ?? ''));
}

export function parseLiteralValueForEditorKind(kind: EditorScalarKind, raw: string): EditorValueParseResult {
  if (kind === 'string') {
    return {
      valid: true,
      normalizedDisplay: raw,
      value: raw,
      serializedValue: raw,
    };
  }

  if (kind === 'boolean') {
    return parseBooleanValue(raw);
  }

  if (kind === 'integer') {
    return parseIntegerValue(raw);
  }

  if (kind === 'float') {
    return parseFloatValue(raw);
  }

  if (kind === 'address') {
    return parseAddressValue(raw);
  }

  return {
    valid: false,
    normalizedDisplay: raw,
    value: raw,
    serializedValue: null,
    error: 'Unsupported member type for Editor node.',
  };
}