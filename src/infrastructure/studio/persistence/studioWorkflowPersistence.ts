import type { GraphDocument } from '@/domain/studio/contracts';
import {
  clearStoredGraphDocument,
  readStoredGraphDocument,
  writeStoredGraphDocument,
  type StoredGraphDocumentRecord,
} from './graphPersistence';

export type StudioWorkflowPersistenceSlot = 'autosave' | 'manual-save';

const STORAGE_KEYS: Record<StudioWorkflowPersistenceSlot, string> = {
  autosave: 'unity-mono-studio.workflow.autosave',
  'manual-save': 'unity-mono-studio.workflow.manual-save',
};

export function readStudioWorkflowSlot(slot: StudioWorkflowPersistenceSlot): StoredGraphDocumentRecord | null {
  return readStoredGraphDocument(STORAGE_KEYS[slot]);
}

export function writeStudioWorkflowSlot(slot: StudioWorkflowPersistenceSlot, document: GraphDocument) {
  return writeStoredGraphDocument(STORAGE_KEYS[slot], document);
}

export function clearStudioWorkflowSlot(slot: StudioWorkflowPersistenceSlot) {
  clearStoredGraphDocument(STORAGE_KEYS[slot]);
}

export function resetStudioWorkflowPersistence() {
  (Object.values(STORAGE_KEYS) as string[]).forEach((key) => clearStoredGraphDocument(key));
}

export function readStudioWorkflowPersistenceSnapshot() {
  return {
    autosave: readStudioWorkflowSlot('autosave'),
    manualSave: readStudioWorkflowSlot('manual-save'),
  };
}
