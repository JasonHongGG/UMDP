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

export type EditorNodeScalarKind = 'boolean' | 'integer' | 'float' | 'string' | 'address' | 'unsupported';
export type EditorNodeTargetStatus = 'resolved' | 'stale' | 'unsupported' | 'missing-instance' | 'invalid-value';

export interface EditorNodeAvailableTarget {
  memberStableId: string;
  name: string;
  typeName: string;
  isStatic: boolean;
  scalarKind: EditorNodeScalarKind;
  supported: boolean;
  address: string | null;
  currentValue: unknown;
}

export interface EditorNodeTargetPreview {
  targetId: string;
  memberStableId: string;
  memberName: string;
  memberTypeName: string;
  isStatic: boolean;
  scalarKind: EditorNodeScalarKind;
  currentValue: unknown;
  nextValue: unknown;
  nextValueDisplay: string;
  resolvedAddress: string | null;
  status: EditorNodeTargetStatus;
  issues: NodeQueryIssue[];
  valueMode: 'literal' | 'expression';
}

export interface EditorNodeQuerySummary {
  totalTargets: number;
  writableTargets: number;
  invalidTargets: number;
}

export type EditorNodeQueryState =
  | {
    kind: 'missing-edge';
    payload: null;
    availableTargets: [];
    targets: [];
    summary: EditorNodeQuerySummary;
    issues: [NodeQueryIssue];
  }
  | {
    kind: 'port-mismatch';
    payload: null;
    availableTargets: [];
    targets: [];
    summary: EditorNodeQuerySummary;
    issues: [NodeQueryIssue];
  }
  | {
    kind: 'invalid-payload';
    payload: null;
    availableTargets: [];
    targets: [];
    summary: EditorNodeQuerySummary;
    issues: [NodeQueryIssue];
  }
  | {
    kind: 'resolved';
    payload: ClassInfoPayload;
    availableTargets: EditorNodeAvailableTarget[];
    targets: EditorNodeTargetPreview[];
    summary: EditorNodeQuerySummary;
    issues: NodeQueryIssue[];
  };
