import { getProjectedInstanceReferencePayloadFromValue } from '../../core/studio/contracts';
import { createLiteralExpressionSource, resolveExpressionSource } from '../../core/studio/expression';
import { formatHexAddress, isExplicitHexAddress } from '../../core/addressFormat';
import type { ExpressionResolutionContext } from '../../core/studio/expression';
import type {
  ExpressionSource,
  ExpressionValueType,
  ParameterScalarValueType,
  WorkflowJsonValue,
} from '../../domain/studio/contracts';

export const PARAMETER_SCALAR_VALUE_TYPES = ['string', 'integer', 'float', 'boolean', 'address'] as const satisfies readonly ParameterScalarValueType[];

export function isParameterScalarValueType(value: unknown): value is ParameterScalarValueType {
  return PARAMETER_SCALAR_VALUE_TYPES.includes(value as ParameterScalarValueType);
}

export function getParameterExpressionValueType(valueType: ParameterScalarValueType): ExpressionValueType {
  switch (valueType) {
    case 'address':
      return 'address';
    case 'boolean':
      return 'boolean';
    case 'integer':
    case 'float':
      return 'number';
    case 'string':
    default:
      return 'string';
  }
}

export function getDefaultParameterLiteralRaw(valueType: ParameterScalarValueType): string {
  switch (valueType) {
    case 'address':
      return '0x0';
    case 'integer':
    case 'float':
      return '0';
    case 'boolean':
      return 'false';
    case 'string':
    default:
      return '';
  }
}

export function getParameterValuePlaceholder(valueType: ParameterScalarValueType): string {
  switch (valueType) {
    case 'address':
      return '例如 0x1234ABCD';
    case 'integer':
      return '例如 42';
    case 'float':
      return '例如 3.14';
    case 'boolean':
      return 'true / false';
    case 'string':
    default:
      return 'string value';
  }
}

function normalizeBooleanRaw(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === 'false') {
    return normalized;
  }

  return null;
}

export function createParameterLiteralSource(valueType: ParameterScalarValueType, raw?: string): ExpressionSource {
  const requestedRaw = raw ?? getDefaultParameterLiteralRaw(valueType);
  const nextRaw = valueType === 'boolean'
    ? normalizeBooleanRaw(requestedRaw) ?? getDefaultParameterLiteralRaw(valueType)
    : requestedRaw;

  return createLiteralExpressionSource(nextRaw, getParameterExpressionValueType(valueType));
}

export function normalizeParameterValueSource(source: ExpressionSource, valueType: ParameterScalarValueType): ExpressionSource {
  if (source.kind !== 'literal') {
    return source;
  }

  return createParameterLiteralSource(valueType, source.raw);
}

interface ParameterValueParseSuccess {
  ok: true;
  value: WorkflowJsonValue;
}

interface ParameterValueParseFailure {
  ok: false;
  message: string;
}

export type ParameterValueParseResult = ParameterValueParseSuccess | ParameterValueParseFailure;

export function coerceParameterValue(valueType: ParameterScalarValueType, candidate: unknown): ParameterValueParseResult {
  if (candidate === undefined) {
    return { ok: false, message: 'Value is unresolved.' };
  }

  switch (valueType) {
    case 'address': {
      const projectedReference = getProjectedInstanceReferencePayloadFromValue(candidate);
      if (projectedReference?.address) {
        return { ok: true, value: projectedReference.address };
      }

      if (typeof candidate !== 'string') {
        return { ok: false, message: 'Address parameter must be a hex address or instance reference.' };
      }

      const normalized = formatHexAddress(candidate);
      if (!normalized || !isExplicitHexAddress(normalized)) {
        return { ok: false, message: 'Address parameter must be an explicit hex address.' };
      }

      return { ok: true, value: normalized };
    }
    case 'string':
      if (candidate === null) {
        return { ok: false, message: 'String parameter cannot be null.' };
      }

      if (typeof candidate === 'string') {
        return { ok: true, value: candidate };
      }

      if (typeof candidate === 'number' || typeof candidate === 'boolean') {
        return { ok: true, value: String(candidate) };
      }

      return { ok: false, message: 'String parameter only accepts string, number, or boolean values.' };
    case 'integer': {
      const parsed = typeof candidate === 'number'
        ? candidate
        : typeof candidate === 'string'
          ? Number(candidate.trim())
          : Number.NaN;
      if (!Number.isFinite(parsed)) {
        return { ok: false, message: 'Integer parameter must be a finite number.' };
      }

      if (!Number.isInteger(parsed)) {
        return { ok: false, message: 'Integer parameter must not contain a decimal value.' };
      }

      return { ok: true, value: parsed };
    }
    case 'float': {
      const parsed = typeof candidate === 'number'
        ? candidate
        : typeof candidate === 'string'
          ? Number(candidate.trim())
          : Number.NaN;
      if (!Number.isFinite(parsed)) {
        return { ok: false, message: 'Float parameter must be a finite number.' };
      }

      return { ok: true, value: parsed };
    }
    case 'boolean': {
      if (typeof candidate === 'boolean') {
        return { ok: true, value: candidate };
      }

      if (typeof candidate === 'string') {
        const normalized = normalizeBooleanRaw(candidate);
        if (normalized) {
          return { ok: true, value: normalized === 'true' };
        }
      }

      return { ok: false, message: 'Boolean parameter must be true or false.' };
    }
    default:
      return { ok: false, message: 'Unsupported parameter type.' };
  }
}

export function resolveParameterValueSource(
  source: ExpressionSource,
  valueType: ParameterScalarValueType,
  context: ExpressionResolutionContext,
): ParameterValueParseResult {
  return coerceParameterValue(valueType, resolveExpressionSource(source, context));
}