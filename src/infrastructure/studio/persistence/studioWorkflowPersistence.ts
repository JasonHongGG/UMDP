import type { GraphDocument } from '../../../domain/studio/contracts';
import {
  clearStoredGraphDocument,
  readStoredGraphDocument,
  writeStoredGraphDocument,
  type StoredGraphDocumentRecord,
} from './graphPersistence';

export type StudioWorkflowPersistenceSlot = 'autosave' | 'manual-save';

const STUDIO_PERSISTENCE_BOOTSTRAP_KEY = 'unity-mono-studio.workflow.persistence.bootstrap.v2';
const LEGACY_STORAGE_KEYS = [
  'unity-mono-studio.workflow.autosave.v1',
  'unity-mono-studio.workflow.manual-save.v1',
  'unity-mono-studio.workflow.autosave.v2',
  'unity-mono-studio.workflow.manual-save.v2',
];

const STORAGE_KEYS: Record<StudioWorkflowPersistenceSlot, string> = {
  autosave: 'unity-mono-studio.workflow.autosave.v3',
  'manual-save': 'unity-mono-studio.workflow.manual-save.v3',
};

function canUseLocalStorage() {
  return typeof window !== 'undefined';
}

export function bootstrapStudioPersistencePolicy() {
  if (!canUseLocalStorage()) {
    return;
  }

  if (window.localStorage.getItem(STUDIO_PERSISTENCE_BOOTSTRAP_KEY) === '1') {
    return;
  }

  LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  window.localStorage.setItem(STUDIO_PERSISTENCE_BOOTSTRAP_KEY, '1');
}

export function readStudioWorkflowSlot(slot: StudioWorkflowPersistenceSlot): StoredGraphDocumentRecord | null {
  bootstrapStudioPersistencePolicy();
  return readStoredGraphDocument(STORAGE_KEYS[slot]);
}

export function writeStudioWorkflowSlot(slot: StudioWorkflowPersistenceSlot, document: GraphDocument) {
  bootstrapStudioPersistencePolicy();
  return writeStoredGraphDocument(STORAGE_KEYS[slot], document);
}

export function clearStudioWorkflowSlot(slot: StudioWorkflowPersistenceSlot) {
  bootstrapStudioPersistencePolicy();
  clearStoredGraphDocument(STORAGE_KEYS[slot]);
}

export function resetStudioWorkflowPersistence() {
  bootstrapStudioPersistencePolicy();
  (Object.values(STORAGE_KEYS) as string[]).forEach((key) => clearStoredGraphDocument(key));
}

export function readStudioWorkflowPersistenceSnapshot() {
  bootstrapStudioPersistencePolicy();

  return {
    autosave: readStudioWorkflowSlot('autosave'),
    manualSave: readStudioWorkflowSlot('manual-save'),
  };
}
