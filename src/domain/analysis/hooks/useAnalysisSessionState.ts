import { useCallback, useEffect, useState } from 'react';
import type { AnalysisSnapshot, ProcessInfo, ProcessSession } from '../contracts';
import type { AnalysisRepository } from '../repository/AnalysisRepository';
import { onProcessSelected } from '@/infrastructure/tauri/TauriWorkspaceGateway';
import { useWorkspaceLifecycleState } from './useWorkspaceLifecycleState';

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function logPerf(label: string, startedAt: number, details?: Record<string, unknown>) {
  const durationMs = nowMs() - startedAt;
  console.log(`[perf][session] ${label} completed in ${durationMs.toFixed(1)}ms`, details ?? {});
}

interface UseAnalysisSessionStateOptions {
  repository: AnalysisRepository;
  onResetWorkspace: () => void;
}

export function useAnalysisSessionState({ repository, onResetWorkspace }: UseAnalysisSessionStateOptions) {
  const [processSession, setProcessSession] = useState<ProcessSession | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [analysisSnapshot, setAnalysisSnapshot] = useState<AnalysisSnapshot | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);
  const {
    workspaceLifecycle,
    patchWorkspaceLifecycle,
    refreshWorkspaceLifecycle,
  } = useWorkspaceLifecycleState({
    repository,
    processSession,
    loadingImages,
  });

  const fetchMetadata = useCallback(async (session: ProcessSession | null) => {
    const startedAt = nowMs();
    setLoadingImages(true);
    patchWorkspaceLifecycle({
      status: 'snapshot-loading',
      processSession: session,
      runtime: session?.runtime ?? 'unknown',
      hasSnapshot: false,
      errorMessage: null,
    });
    logPerf('snapshotLoading:entered', startedAt, {
      processName: session?.processName ?? null,
      runtime: session?.runtime ?? 'unknown',
    });
    try {
      const snapshot = await repository.loadAllMetadata();
      setAnalysisSnapshot({
        ...snapshot,
        process: session,
      });
      logPerf('loadAllMetadata', startedAt, {
        processName: session?.processName ?? null,
        classCount: Object.keys(snapshot.classes).length,
        imageCount: snapshot.images.length,
      });
    } catch (error) {
      console.error('Failed to load metadata', error);
    } finally {
      setLoadingImages(false);
      await refreshWorkspaceLifecycle({
        status: 'attached-without-snapshot',
        processSession: session,
        runtime: session?.runtime ?? 'unknown',
        hasSnapshot: false,
        errorMessage: null,
      }, 'after-metadata-load');
    }
  }, [patchWorkspaceLifecycle, refreshWorkspaceLifecycle, repository]);

  useEffect(() => {
    const unlisten = onProcessSelected(async (process) => {
      const startedAt = nowMs();
      setAttachError(null);
      setLoadingImages(true);
      try {
        const session = await repository.attachToProcess({
          pid: process.pid,
          name: process.name,
        });

        setProcessSession(session);
        setAnalysisSnapshot(null);
        onResetWorkspace();
        await refreshWorkspaceLifecycle({
          status: 'attached-without-snapshot',
          processSession: session,
          runtime: session.runtime,
          hasSnapshot: false,
          errorMessage: null,
        }, 'after-attach');
        logPerf('attachToProcess', startedAt, {
          pid: process.pid,
          processName: process.name,
          runtime: session.runtime,
        });
        await fetchMetadata(session);
      } catch (error) {
        setProcessSession(null);
        setAnalysisSnapshot(null);
        onResetWorkspace();
        setAttachError(toErrorMessage(error));
        setLoadingImages(false);
        await refreshWorkspaceLifecycle({
          status: 'runtime-error',
          processSession: null,
          runtime: 'unknown',
          hasSnapshot: false,
          errorMessage: toErrorMessage(error),
        }, 'attach-failed');
        console.error(`[perf][session] attachToProcess failed after ${(nowMs() - startedAt).toFixed(1)}ms`, error);
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
    workspaceLifecycle,
    refreshWorkspaceLifecycle,
  };
}
