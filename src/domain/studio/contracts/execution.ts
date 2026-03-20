import type { ValidationIssue } from './nodes';
import type { WorkflowJsonEnvelope } from './payloads';

export type NodeExecutionStatus = 'idle' | 'running' | 'success' | 'error';
export type NodeExecutionSource = 'runtime' | 'materialized';

export type NodeExecutionOutputMap = Record<string, WorkflowJsonEnvelope<any>>;
export type NodeExecutionInputMap = Record<string, WorkflowJsonEnvelope[]>;

export interface NodeExecutionTiming {
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
}

export interface NodeExecutionSnapshot {
  nodeId: string;
  status: NodeExecutionStatus;
  source: NodeExecutionSource;
  inputs: NodeExecutionInputMap;
  outputs: NodeExecutionOutputMap;
  issues?: ValidationIssue[];
  errorMessage?: string;
  timing?: NodeExecutionTiming;
}