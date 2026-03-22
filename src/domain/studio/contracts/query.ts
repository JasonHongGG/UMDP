import type { ClassInfoPayload, WorkflowJsonEnvelope, WorkflowJsonValue } from './payloads';
import type { DisplayNodePathToken } from './nodes';

export interface NodeQueryIssue {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  targetPortId?: string;
}

export interface DisplayNodeAvailableField {
  id: string;
  label: string;
  pathTokens: DisplayNodePathToken[];
  pathText: string;
  valueKind: 'null' | 'primitive' | 'object' | 'array';
  previewText: string;
  selectable: boolean;
  children: DisplayNodeAvailableField[];
}

export interface DisplayNodeResolvedField {
  id: string;
  label: string;
  pathTokens: DisplayNodePathToken[];
  pathText: string;
  resolved: boolean;
  valueKind: 'missing' | 'null' | 'primitive' | 'object' | 'array';
  value?: WorkflowJsonValue;
  displayText: string;
  issue?: NodeQueryIssue;
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
    availableFields: [];
    selectedFields: [];
    issues: [NodeQueryIssue];
  }
  | {
    kind: 'port-mismatch';
    sourceKind: 'preview';
    sourceNodeId: null;
    sourcePortId: null;
    envelope: null;
    availableFields: [];
    selectedFields: [];
    issues: [NodeQueryIssue];
  }
  | {
    kind: 'payload-unavailable';
    sourceKind: 'preview';
    sourceNodeId: string;
    sourcePortId: string;
    envelope: null;
    availableFields: [];
    selectedFields: [];
    issues: [NodeQueryIssue];
  }
  | {
    kind: 'resolved';
    sourceKind: 'preview';
    sourceNodeId: string;
    sourcePortId: string;
    envelope: WorkflowJsonEnvelope;
    availableFields: DisplayNodeAvailableField[];
    selectedFields: DisplayNodeResolvedField[];
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

export interface IfNodeOperatorOption {
  value: import('./nodes').IfOperator;
  label: string;
}

export interface IfNodeOperandPreview {
  mode: import('./nodes').IfOperandMode;
  source: import('./expression').ExpressionSource | null;
  displayText: string | null;
  value: unknown;
  scalarKind: import('./nodes').IfScalarKind;
  resolved: boolean;
}

export type IfNodeQueryState = {
  kind: 'incomplete' | 'invalid' | 'resolved';
  leftPreview: IfNodeOperandPreview;
  rightPreview: IfNodeOperandPreview;
  availableOperators: IfNodeOperatorOption[];
  operatorCompatible: boolean;
  predictedResult: boolean | null;
  summary: string | null;
  issues: NodeQueryIssue[];
};

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
