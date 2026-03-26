import type { GraphDocument } from '@/domain/studio/contracts';
import {
  cloneGraphDocument,
  createEmptyGraphDocument,
  serializeGraphDocument,
  type StoredGraphDocumentRecord,
} from '@/infrastructure/studio/persistence/graphPersistence';
import {
  readStudioWorkflowPersistenceSnapshot,
  readStudioWorkflowSlot,
  resetStudioWorkflowPersistence,
  writeStudioWorkflowSlot,
  type StudioWorkflowPersistenceSlot,
} from '@/infrastructure/studio/persistence/studioWorkflowPersistence';

export interface StudioWorkflowPersistenceSnapshot {
  autosave: StoredGraphDocumentRecord | null;
  manualSave: StoredGraphDocumentRecord | null;
}

export interface StudioGraphPersistenceGateway {
  cloneDocument(document: GraphDocument): GraphDocument;
  createEmptyDocument(): GraphDocument;
  serializeDocument(document: GraphDocument): string;
  readWorkflowSnapshot(): StudioWorkflowPersistenceSnapshot;
  readWorkflowSlot(slot: StudioWorkflowPersistenceSlot): StoredGraphDocumentRecord | null;
  writeWorkflowSlot(slot: StudioWorkflowPersistenceSlot, document: GraphDocument): number | null;
  resetWorkflowPersistence(): void;
}

export const localStudioGraphPersistenceGateway: StudioGraphPersistenceGateway = {
  cloneDocument: cloneGraphDocument,
  createEmptyDocument: createEmptyGraphDocument,
  serializeDocument: serializeGraphDocument,
  readWorkflowSnapshot: readStudioWorkflowPersistenceSnapshot,
  readWorkflowSlot: readStudioWorkflowSlot,
  writeWorkflowSlot: writeStudioWorkflowSlot,
  resetWorkflowPersistence: resetStudioWorkflowPersistence,
};