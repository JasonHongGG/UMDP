import type { ClassInfoPayload, WorkflowJsonEnvelope } from './payloads';

export interface NodeQueryIssue {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  targetPortId?: string;
}

export interface DisplayNodePayloadSummary {
  valueKind: 'null' | 'primitive' | 'object' | 'array';
  previewText: string;
  entryCount?: number;
  sampleKeys?: string[];
}

export type CallFunctionClassInfoQueryState =
  | {
    kind: 'missing-edge';
    payload: null;
    methods: [];
    issues: [NodeQueryIssue];
  }
  | {
    kind: 'port-mismatch';
    payload: null;
    methods: [];
    issues: [NodeQueryIssue];
  }
  | {
    kind: 'invalid-payload';
    payload: null;
    methods: [];
    issues: [NodeQueryIssue];
  }
  | {
    kind: 'no-functions';
    payload: ClassInfoPayload;
    methods: [];
    issues: [NodeQueryIssue];
  }
  | {
    kind: 'resolved';
    payload: ClassInfoPayload;
    methods: ClassInfoPayload['functions'];
    issues: [];
  };

export type DisplayNodeQueryState =
  | {
    kind: 'missing-edge';
    sourceKind: 'preview';
    sourceNodeId: null;
    sourcePortId: null;
    envelope: null;
    summary: null;
    issues: [NodeQueryIssue];
  }
  | {
    kind: 'port-mismatch';
    sourceKind: 'preview';
    sourceNodeId: null;
    sourcePortId: null;
    envelope: null;
    summary: null;
    issues: [NodeQueryIssue];
  }
  | {
    kind: 'payload-unavailable';
    sourceKind: 'preview';
    sourceNodeId: string;
    sourcePortId: string;
    envelope: null;
    summary: null;
    issues: [NodeQueryIssue];
  }
  | {
    kind: 'resolved';
    sourceKind: 'preview';
    sourceNodeId: string;
    sourcePortId: string;
    envelope: WorkflowJsonEnvelope;
    summary: DisplayNodePayloadSummary;
    issues: [];
  };
