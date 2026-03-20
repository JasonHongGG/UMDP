import type { ClassInfoPayload } from './payloads';

export interface NodeQueryIssue {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  targetPortId?: string;
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
