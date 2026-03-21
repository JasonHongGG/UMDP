import type { ValidationIssue } from './nodes';
import type { WorkflowJsonEnvelope } from './payloads';

export type NodeExecutionStatus = 'idle' | 'running' | 'success' | 'error';
export type NodeExecutionOriginKind = 'runtime' | 'materialized';
export type NodeExecutionPhase = 'materialize' | 'running' | 'execute';

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
  originKind: NodeExecutionOriginKind;
  phase: NodeExecutionPhase;
  runId?: string;
  queryRevision?: number;
  inputs: NodeExecutionInputMap;
  outputs: NodeExecutionOutputMap;
  issues?: ValidationIssue[];
  nextControlPorts?: string[];
  errorMessage?: string;
  timing?: NodeExecutionTiming;
}