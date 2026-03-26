import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GraphDocument } from '@/domain/studio/contracts';
import { isStudioGraphDocumentDirty } from './document/StudioDocumentEngine';
import type { StudioGraphPersistenceGateway } from './StudioGraphPersistenceGateway';

export interface StudioGraphPersistenceState {
  hasUnsavedChanges: boolean;
  hasSavedWorkflow: boolean;
  lastSavedAt: number | null;
  lastAutosavedAt: number | null;
  saveWorkflow: () => boolean;
  loadSavedWorkflow: () => boolean;
  clearWorkflow: () => void;
}

export interface UseStudioGraphPersistenceOptions {
  document: GraphDocument;
  persistenceGateway: StudioGraphPersistenceGateway;
  replaceDocumentState: (document: GraphDocument, options?: { resetHistory?: boolean; loadedAt?: number | null }) => void;
}

export function useStudioGraphPersistence({
  document,
  persistenceGateway,
  replaceDocumentState,
}: UseStudioGraphPersistenceOptions): StudioGraphPersistenceState {
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [lastAutosavedAt, setLastAutosavedAt] = useState<number | null>(null);
  const [hasSavedWorkflow, setHasSavedWorkflow] = useState(false);
  const [savedDocumentSnapshot, setSavedDocumentSnapshot] = useState<string | null>(null);
  const hasHydratedPersistenceRef = useRef(false);

  const currentSerializedDocument = useMemo(
    () => persistenceGateway.serializeDocument(document),
    [document, persistenceGateway],
  );
  const hasUnsavedChanges = useMemo(
    () => isStudioGraphDocumentDirty(document, savedDocumentSnapshot),
    [document, savedDocumentSnapshot],
  );

  useEffect(() => {
    const { manualSave, autosave } = persistenceGateway.readWorkflowSnapshot();
    if (manualSave) {
      setHasSavedWorkflow(true);
      setLastSavedAt(manualSave.savedAt);
      setSavedDocumentSnapshot(persistenceGateway.serializeDocument(manualSave.envelope.document));
    }

    if (autosave) {
      replaceDocumentState(autosave.envelope.document, {
        resetHistory: true,
        loadedAt: autosave.savedAt,
      });
      setLastAutosavedAt(autosave.savedAt);
    }

    hasHydratedPersistenceRef.current = true;
  }, [persistenceGateway, replaceDocumentState]);

  useEffect(() => {
    if (!hasHydratedPersistenceRef.current) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      const savedAt = persistenceGateway.writeWorkflowSlot('autosave', document);
      if (savedAt) {
        setLastAutosavedAt(savedAt);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [document, persistenceGateway]);

  const saveWorkflow = useCallback(() => {
    const savedAt = persistenceGateway.writeWorkflowSlot('manual-save', document);
    if (!savedAt) {
      return false;
    }

    setHasSavedWorkflow(true);
    setLastSavedAt(savedAt);
    setSavedDocumentSnapshot(currentSerializedDocument);
    return true;
  }, [currentSerializedDocument, document, persistenceGateway]);

  const loadSavedWorkflow = useCallback(() => {
    const record = persistenceGateway.readWorkflowSlot('manual-save');
    if (!record) {
      return false;
    }

    setHasSavedWorkflow(true);
    setLastSavedAt(record.savedAt);
    setSavedDocumentSnapshot(persistenceGateway.serializeDocument(record.envelope.document));
    replaceDocumentState(record.envelope.document, {
      resetHistory: true,
      loadedAt: Date.now(),
    });
    return true;
  }, [persistenceGateway, replaceDocumentState]);

  const clearWorkflow = useCallback(() => {
    persistenceGateway.resetWorkflowPersistence();
    setHasSavedWorkflow(false);
    setLastSavedAt(null);
    setLastAutosavedAt(null);
    setSavedDocumentSnapshot(null);
    replaceDocumentState(persistenceGateway.createEmptyDocument(), {
      resetHistory: true,
      loadedAt: Date.now(),
    });
  }, [persistenceGateway, replaceDocumentState]);

  return {
    hasUnsavedChanges,
    hasSavedWorkflow,
    lastSavedAt,
    lastAutosavedAt,
    saveWorkflow,
    loadSavedWorkflow,
    clearWorkflow,
  };
}