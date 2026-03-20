import type { WorkflowJsonValue } from '../domain/studio/contracts';
import { formatHexAddress } from './addressFormat';

const BOOLEAN_TYPES = new Set(['System.Boolean', 'bool']);
const INTEGER_TYPES = new Set([
  'System.Byte',
  'System.SByte',
  'System.Int16',
  'System.UInt16',
  'System.Int32',
  'System.UInt32',
  'System.Int64',
  'System.UInt64',
  'byte',
  'sbyte',
  'short',
  'ushort',
  'int',
  'uint',
  'long',
  'ulong',
]);
const FLOAT_TYPES = new Set(['System.Single', 'System.Double', 'System.Decimal', 'float', 'double', 'decimal']);
const POINTER_TYPES = new Set(['System.IntPtr', 'System.UIntPtr']);

export function coerceRuntimeFieldValue(typeName: string, rawValue: string | null | undefined): WorkflowJsonValue {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed === 'null') {
    return null;
  }

  if (BOOLEAN_TYPES.has(typeName)) {
    if (trimmed === 'true') {
      return true;
    }
    if (trimmed === 'false') {
      return false;
    }
  }

  if (INTEGER_TYPES.has(typeName) || FLOAT_TYPES.has(typeName)) {
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
  }

  if (POINTER_TYPES.has(typeName) || trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return formatHexAddress(trimmed) ?? trimmed;
  }

  return trimmed;
}