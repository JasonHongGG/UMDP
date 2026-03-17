import type { BaseNodeData, IPort, StudioEdge, StudioNode, WorkflowDocument } from './types';
import { WORKFLOW_DOCUMENT_VERSION } from './contracts';

export const STUDIO_WORKFLOW_AUTOSAVE_KEY = 'unity-mono-studio.workflow.autosave.v1';
export const STUDIO_WORKFLOW_MANUAL_SAVE_KEY = 'unity-mono-studio.workflow.manual-save.v1';

interface StoredWorkflowDocumentRecord {
  savedAt: number;
  document: WorkflowDocument;
}

function isPort(value: unknown): value is IPort {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<IPort>;
  return typeof candidate.id === 'string' && typeof candidate.label === 'string' && (candidate.type === 'flow' || candidate.type === 'json');
}

function isBaseNodeData(value: unknown): value is BaseNodeData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<BaseNodeData>;
  return Array.isArray(candidate.inputs) && candidate.inputs.every(isPort) && Array.isArray(candidate.outputs) && candidate.outputs.every(isPort);
}

function isStudioNode(value: unknown): value is StudioNode {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StudioNode>;
  return typeof candidate.id === 'string'
    && typeof candidate.type === 'string'
    && Boolean(candidate.position)
    && typeof candidate.position?.x === 'number'
    && typeof candidate.position?.y === 'number'
    && isBaseNodeData(candidate.data);
}

function isStudioEdge(value: unknown): value is StudioEdge {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StudioEdge>;
  return typeof candidate.id === 'string'
    && typeof candidate.sourceNodeId === 'string'
    && typeof candidate.sourcePortId === 'string'
    && typeof candidate.targetNodeId === 'string'
    && typeof candidate.targetPortId === 'string';
}

export function createEmptyWorkflowDocument(): WorkflowDocument {
  return {
    version: WORKFLOW_DOCUMENT_VERSION,
    nodes: [],
    edges: [],
  };
}

export function cloneWorkflowDocument(document: WorkflowDocument): WorkflowDocument {
  return JSON.parse(JSON.stringify(document)) as WorkflowDocument;
}

export function serializeWorkflowDocument(document: WorkflowDocument) {
  return JSON.stringify(cloneWorkflowDocument(document));
}

export function isWorkflowDocument(value: unknown): value is WorkflowDocument {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<WorkflowDocument>;
  return typeof candidate.version === 'number'
    && Array.isArray(candidate.nodes)
    && candidate.nodes.every(isStudioNode)
    && Array.isArray(candidate.edges)
    && candidate.edges.every(isStudioEdge);
}

export function parseWorkflowDocument(raw: string): WorkflowDocument | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isWorkflowDocument(parsed)) {
      return null;
    }

    return {
      ...parsed,
      version: WORKFLOW_DOCUMENT_VERSION,
    };
  } catch {
    return null;
  }
}

function isStoredWorkflowDocumentRecord(value: unknown): value is StoredWorkflowDocumentRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredWorkflowDocumentRecord>;
  return typeof candidate.savedAt === 'number' && isWorkflowDocument(candidate.document);
}

export function readStoredWorkflowDocument(storageKey: string): StoredWorkflowDocumentRecord | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredWorkflowDocumentRecord(parsed)) {
      return null;
    }

    return {
      savedAt: parsed.savedAt,
      document: cloneWorkflowDocument(parsed.document),
    };
  } catch {
    return null;
  }
}

export function writeStoredWorkflowDocument(storageKey: string, document: WorkflowDocument) {
  if (typeof window === 'undefined') {
    return null;
  }

  const record: StoredWorkflowDocumentRecord = {
    savedAt: Date.now(),
    document: cloneWorkflowDocument(document),
  };

  window.localStorage.setItem(storageKey, JSON.stringify(record));
  return record.savedAt;
}
