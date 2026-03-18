import type { GraphDocument, NodeInstance } from '../../domain/studio/contracts';

export const STUDIO_WORKFLOW_AUTOSAVE_KEY = 'unity-mono-studio.workflow.autosave.v1';
export const STUDIO_WORKFLOW_MANUAL_SAVE_KEY = 'unity-mono-studio.workflow.manual-save.v1';

interface StoredGraphDocumentRecord {
  savedAt: number;
  document: GraphDocument;
}

function isStudioNodeInstance(value: unknown): value is NodeInstance {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<NodeInstance>;
  return typeof candidate.id === 'string'
    && typeof candidate.nodeType === 'string'
    && typeof candidate.typeVersion === 'number'
    && Boolean(candidate.position)
    && typeof candidate.position?.x === 'number'
    && typeof candidate.position?.y === 'number'
    && (candidate.displayName === undefined || typeof candidate.displayName === 'string')
    && Boolean(candidate.parameters)
    && typeof candidate.parameters === 'object'
    && Boolean(candidate.bindings)
    && typeof candidate.bindings === 'object'
    && Boolean(candidate.documentState)
    && typeof candidate.documentState === 'object';
}

function isConnectionEndpoint(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { nodeId?: unknown; connectionKey?: unknown };
  return typeof candidate.nodeId === 'string' && typeof candidate.connectionKey === 'string';
}

function isControlConnection(value: unknown): value is GraphDocument['controlConnections'][number] {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { id?: unknown; source?: unknown; target?: unknown };
  return typeof candidate.id === 'string' && isConnectionEndpoint(candidate.source) && isConnectionEndpoint(candidate.target);
}

function isDataConnection(value: unknown): value is GraphDocument['dataConnections'][number] {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { id?: unknown; source?: unknown; target?: unknown; bindingKey?: unknown };
  return typeof candidate.id === 'string'
    && typeof candidate.bindingKey === 'string'
    && isConnectionEndpoint(candidate.source)
    && isConnectionEndpoint(candidate.target);
}

export function createEmptyGraphDocument(): GraphDocument {
  return {
    schemaVersion: 1,
    id: 'studio-document',
    nodes: [],
    controlConnections: [],
    dataConnections: [],
  };
}

export function cloneGraphDocument(document: GraphDocument): GraphDocument {
  return JSON.parse(JSON.stringify(document)) as GraphDocument;
}

export function serializeGraphDocument(document: GraphDocument) {
  return JSON.stringify(cloneGraphDocument(document));
}

export function isGraphDocument(value: unknown): value is GraphDocument {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GraphDocument>;
  return candidate.schemaVersion === 1
    && typeof candidate.id === 'string'
    && Array.isArray(candidate.nodes)
    && candidate.nodes.every(isStudioNodeInstance)
    && Array.isArray(candidate.controlConnections)
    && candidate.controlConnections.every(isControlConnection)
    && Array.isArray(candidate.dataConnections)
    && candidate.dataConnections.every(isDataConnection);
}

export function parseGraphDocument(raw: string): GraphDocument | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isGraphDocument(parsed)) {
      return null;
    }

    return cloneGraphDocument(parsed);
  } catch {
    return null;
  }
}

function isStoredGraphDocumentRecord(value: unknown): value is StoredGraphDocumentRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredGraphDocumentRecord>;
  return typeof candidate.savedAt === 'number' && isGraphDocument(candidate.document);
}

export function readStoredGraphDocument(storageKey: string): StoredGraphDocumentRecord | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredGraphDocumentRecord(parsed)) {
      return null;
    }

    return {
      savedAt: parsed.savedAt,
      document: cloneGraphDocument(parsed.document),
    };
  } catch {
    return null;
  }
}

export function writeStoredGraphDocument(storageKey: string, document: GraphDocument) {
  if (typeof window === 'undefined') {
    return null;
  }

  const record: StoredGraphDocumentRecord = {
    savedAt: Date.now(),
    document: cloneGraphDocument(document),
  };

  window.localStorage.setItem(storageKey, JSON.stringify(record));
  return record.savedAt;
}
