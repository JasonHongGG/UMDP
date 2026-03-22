import type { ValidationIssue } from './nodes';
import type { WorkflowJsonEnvelope } from './payloads';

export type NodeExecutionStatus = 'idle' | 'running' | 'success' | 'error' | 'aborted';
export type NodeExecutionOriginKind = 'runtime' | 'materialized';
export type NodeExecutionPhase = 'materialize' | 'running' | 'execute';
export type NodeExecutionFailureReason = 'validation-error' | 'execution-error' | 'aborted' | 'node-not-found' | 'disposed';
export type StudioExecutionAbortReason = 'rerun' | 'workspace-reset' | 'document-reset' | 'component-dispose' | 'manual-stop';

export type NodeExecutionOutputMap = Record<string, WorkflowJsonEnvelope<any>>;
export type NodeExecutionInputMap = Record<string, WorkflowJsonEnvelope[]>;

export interface NodeExecutionProgress {
  kind: string;
  label?: string;
  totalMs?: number;
  remainingMs?: number;
  displayText?: string;
}

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
  nextRuntimeState?: Record<string, unknown>;
  errorMessage?: string;
  failureReason?: NodeExecutionFailureReason;
  abortReason?: StudioExecutionAbortReason;
  timing?: NodeExecutionTiming;
  progress?: NodeExecutionProgress;
}