export interface ExecutionRun {
  runId: string;
  startNodeId: string;
  status: 'running' | 'success' | 'error' | 'aborted';
  startedAt: number;
  completedAt?: number;
}

export type NodeTraceStatus = 'idle' | 'scheduled' | 'running' | 'success' | 'error' | 'aborted';

export type TraceEventKind =
  | 'run-started'
  | 'node-scheduled'
  | 'node-started'
  | 'node-succeeded'
  | 'node-failed'
  | 'node-aborted'
  | 'run-completed';

export interface TraceValueProvenance {
  sourceNodeId: string;
  sourcePortKey: string;
}

export interface ExecutionTraceEvent {
  eventId: string;
  runId: string;
  kind: TraceEventKind;
  timestamp: number;
  nodeId?: string;
  inputProvenance?: TraceValueProvenance[];
  outputProvenance?: TraceValueProvenance[];
  routingPortKeys?: string[];
  message?: string;
}

export interface NodeTraceRecord {
  nodeId: string;
  status: NodeTraceStatus;
  lastEventId: string;
  lastTimestamp: number;
  inputProvenance: TraceValueProvenance[];
  outputProvenance: TraceValueProvenance[];
  routingPortKeys: string[];
  message?: string;
}

export interface ExecutionTraceState {
  activeRunId: string | null;
  runOrder: string[];
  runsById: Record<string, ExecutionRun>;
  eventsByRunId: Record<string, ExecutionTraceEvent[]>;
  nodeTracesByRunId: Record<string, Record<string, NodeTraceRecord>>;
}

export function createExecutionTraceState(): ExecutionTraceState {
  return {
    activeRunId: null,
    runOrder: [],
    runsById: {},
    eventsByRunId: {},
    nodeTracesByRunId: {},
  };
}

export function createTraceEventId(runId: string, sequence: number) {
  return `${runId}:${sequence}`;
}

export function createTraceEvent(
  runId: string,
  sequence: number,
  kind: TraceEventKind,
  timestamp: number,
  options?: Omit<ExecutionTraceEvent, 'eventId' | 'runId' | 'kind' | 'timestamp'>,
): ExecutionTraceEvent {
  return {
    eventId: createTraceEventId(runId, sequence),
    runId,
    kind,
    timestamp,
    ...options,
  };
}