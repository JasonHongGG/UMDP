import {
  createGraphDocumentEnvelope,
  type GraphDocument,
  type GraphDocumentEnvelope,
  type NodeInstance,
} from '../../../domain/studio/contracts';

export interface StoredGraphDocumentRecord {
  savedAt: number;
  envelope: GraphDocumentEnvelope;
  checksum: string;
}

function computeChecksum(raw: string) {
  let hash = 5381;
  for (let index = 0; index < raw.length; index += 1) {
    hash = ((hash << 5) + hash) ^ raw.charCodeAt(index);
  }

  return `djb2:${(hash >>> 0).toString(16)}`;
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

function isGraphDocumentEnvelope(value: unknown): value is GraphDocumentEnvelope {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GraphDocumentEnvelope>;
  return candidate.format === 'studio-graph'
    && candidate.schemaVersion === 1
    && typeof candidate.savedAt === 'string'
    && isGraphDocument(candidate.document);
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
  return typeof candidate.savedAt === 'number'
    && typeof candidate.checksum === 'string'
    && isGraphDocumentEnvelope(candidate.envelope);
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

    const expectedChecksum = computeChecksum(JSON.stringify(parsed.envelope));
    if (parsed.checksum !== expectedChecksum) {
      return null;
    }

    return {
      savedAt: parsed.savedAt,
      checksum: parsed.checksum,
      envelope: {
        ...parsed.envelope,
        document: cloneGraphDocument(parsed.envelope.document),
      },
    };
  } catch {
    return null;
  }
}

export function writeStoredGraphDocument(storageKey: string, document: GraphDocument) {
  if (typeof window === 'undefined') {
    return null;
  }

  const savedAt = Date.now();
  const envelope = createGraphDocumentEnvelope(cloneGraphDocument(document), new Date(savedAt).toISOString());
  const checksum = computeChecksum(JSON.stringify(envelope));

  const record: StoredGraphDocumentRecord = {
    savedAt,
    envelope,
    checksum,
  };

  window.localStorage.setItem(storageKey, JSON.stringify(record));
  return record.savedAt;
}

export function clearStoredGraphDocument(storageKey: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(storageKey);
}
