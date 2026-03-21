export type BridgeOperation =
  | 'process.fetch'
  | 'process.attach'
  | 'analysis.snapshot.load'
  | 'analysis.overlay.load'
  | 'runtime.field.read'
  | 'runtime.field.write'
  | 'runtime.method.invoke';

export interface BridgeCommandEnvelope<TPayload = unknown> {
  schemaVersion: 1;
  commandVersion: 1;
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
  schemaVersion: 1;
  commandVersion: 1;
  requestId: string;
  ok: boolean;
  result: TResult | null;
  error: BridgeError | null;
}
