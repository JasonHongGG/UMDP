import type { GraphDocument } from './graph';

export interface GraphDocumentEnvelope {
  format: 'studio-graph';
  schemaVersion: 1;
  savedAt: string;
  document: GraphDocument;
}

export function createGraphDocumentEnvelope(document: GraphDocument, savedAt = new Date().toISOString()): GraphDocumentEnvelope {
  return {
    format: 'studio-graph',
    schemaVersion: 1,
    savedAt,
    document,
  };
}