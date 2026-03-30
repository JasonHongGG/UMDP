import {
  BRIDGE_OPERATIONS,
  BRIDGE_OPERATION_GROUPS,
  isBridgeOperation,
  type BridgeOperation,
  type BridgeOperationGroup,
} from './bridgeOperationRegistry';

export const BRIDGE_PROTOCOL_VERSION = 2 as const;
export const BRIDGE_SCHEMA_VERSION = 1 as const;

export {
  BRIDGE_OPERATIONS,
  BRIDGE_OPERATION_GROUPS,
  isBridgeOperation,
};

export type {
  BridgeOperation,
  BridgeOperationGroup,
};

export interface BridgeCommandEnvelope<TPayload = unknown> {
  schemaVersion: typeof BRIDGE_SCHEMA_VERSION;
  commandVersion: typeof BRIDGE_PROTOCOL_VERSION;
  operation: BridgeOperation;
  requestId: string;
  payload: TPayload;
}

export interface BridgeError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface BridgeResponseEnvelope<TResult = unknown> {
  schemaVersion: typeof BRIDGE_SCHEMA_VERSION;
  commandVersion: typeof BRIDGE_PROTOCOL_VERSION;
  requestId: string;
  ok: boolean;
  result: TResult | null;
  error: BridgeError | null;
}

export function createBridgeCommandEnvelope<TPayload>(
  operation: BridgeOperation,
  requestId: string,
  payload: TPayload,
): BridgeCommandEnvelope<TPayload> {
  return {
    schemaVersion: BRIDGE_SCHEMA_VERSION,
    commandVersion: BRIDGE_PROTOCOL_VERSION,
    operation,
    requestId,
    payload,
  };
}

export function createBridgeResponseEnvelope<TResult>(
  requestId: string,
  ok: boolean,
  result: TResult | null,
  error: BridgeError | null,
): BridgeResponseEnvelope<TResult> {
  return {
    schemaVersion: BRIDGE_SCHEMA_VERSION,
    commandVersion: BRIDGE_PROTOCOL_VERSION,
    requestId,
    ok,
    result,
    error,
  };
}
