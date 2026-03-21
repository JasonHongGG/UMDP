import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useState } from 'react';
import type { AnalysisSnapshot, ProcessInfo, ProcessSession } from '../contracts';
import type { AnalysisRepository } from '../repository/AnalysisRepository';

interface UseAnalysisSessionStateOptions {
  repository: AnalysisRepository;
  onResetWorkspace: () => void;
}

export function useAnalysisSessionState({ repository, onResetWorkspace }: UseAnalysisSessionStateOptions) {
  const [processSession, setProcessSession] = useState<ProcessSession | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [analysisSnapshot, setAnalysisSnapshot] = useState<AnalysisSnapshot | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);

  const fetchMetadata = useCallback(async (session: ProcessSession | null) => {
    setLoadingImages(true);
    try {
      const snapshot = await repository.loadAllMetadata();
      setAnalysisSnapshot({
        ...snapshot,
        process: session,
      });
    } catch (error) {
      console.error('Failed to load metadata', error);
    } finally {
      setLoadingImages(false);
    }
  }, [repository]);

  useEffect(() => {
    const unlisten = listen<ProcessInfo>('process-selected', async (event) => {
      setAttachError(null);
      setLoadingImages(true);
      try {
        const session = await repository.attachToProcess({
          pid: event.payload.pid,
          name: event.payload.name,
        });

        setProcessSession(session);
        setAnalysisSnapshot(null);
        onResetWorkspace();
        await fetchMetadata(session);
      } catch (error) {
        setProcessSession(null);
        setAnalysisSnapshot(null);
        onResetWorkspace();
        setAttachError(String(error));
        setLoadingImages(false);
      }
    });

    return () => {
      unlisten.then((dispose) => dispose());
    };
  }, [fetchMetadata, onResetWorkspace, repository]);

  return {
    processSession,
    attachError,
    analysisSnapshot,
    loadingImages,
    setAnalysisSnapshot,
  };
}
