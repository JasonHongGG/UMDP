export type OperationErrorCode =
  | 'process-not-found'
  | 'not-attached'
  | 'metadata-unavailable'
  | 'metadata-source-unavailable'
  | 'class-not-found'
  | 'method-not-found'
  | 'field-not-found'
  | 'instance-required'
  | 'argument-mismatch'
  | 'invalid-address'
  | 'runtime-session-unavailable'
  | 'runtime-api-unavailable'
  | 'capability-unavailable'
  | 'runtime-fault';

export type OperationFailureEffect = 'none' | 'runtime-session-dropped';

export type OperationDisplayHint = 'inline' | 'banner' | 'toast';

export type OperationFeedbackTone = 'info' | 'success' | 'warning' | 'error';

export interface OperationErrorEnvelope {
  code: OperationErrorCode;
  message: string;
  effect: OperationFailureEffect;
  operationKey: string | null;
  recoverable: boolean;
  displayHint: OperationDisplayHint;
}

export interface OperationFeedbackEnvelope {
  operationKey: string;
  tone: OperationFeedbackTone;
  title: string;
  description: string;
  targetId: string | null;
  timestamp: string;
}

export interface CommandSuccessEnvelope<T> {
  ok: true;
  data: T;
  error: null;
  feedback: OperationFeedbackEnvelope | null;
}

export interface CommandFailureEnvelope {
  ok: false;
  data: null;
  error: OperationErrorEnvelope;
  feedback: OperationFeedbackEnvelope | null;
}

export type CommandEnvelope<T> = CommandSuccessEnvelope<T> | CommandFailureEnvelope;

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
