export type {
  CommandEnvelope,
  CommandFailureEnvelope,
  CommandSuccessEnvelope,
  OperationDisplayHint,
  OperationErrorCode,
  OperationErrorEnvelope,
  OperationFailureEffect,
  OperationFeedbackEnvelope,
  OperationFeedbackTone,
} from './generated/operation.generated';
import type { OperationErrorEnvelope } from './generated/operation.generated';

export function isOperationErrorEnvelope(value: unknown): value is OperationErrorEnvelope {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === 'string'
    && typeof candidate.message === 'string'
    && typeof candidate.effect === 'string'
    && (candidate.operationKey === null || typeof candidate.operationKey === 'string')
    && typeof candidate.recoverable === 'boolean'
    && typeof candidate.displayHint === 'string';
}

export function createOperationErrorEnvelope(
  message: string,
  operationKey: string | null = null,
): OperationErrorEnvelope {
  return {
    code: 'runtime-fault',
    message,
    effect: 'none',
    operationKey,
    recoverable: true,
    displayHint: 'banner',
  };
}

export function coerceOperationErrorEnvelope(
  error: unknown,
  operationKey: string | null = null,
): OperationErrorEnvelope {
  if (isOperationErrorEnvelope(error)) {
    if (error.operationKey === operationKey || operationKey == null) {
      return error;
    }

    return {
      ...error,
      operationKey,
    };
  }

  if (error instanceof Error) {
    return createOperationErrorEnvelope(error.message, operationKey);
  }

  return createOperationErrorEnvelope(String(error), operationKey);
}
