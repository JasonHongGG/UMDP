import { useCallback, useEffect, useState } from 'react';
import { createDiagnosticsLogger } from '@/shared/diagnostics';
import type { AnalysisSnapshot, ProcessInfo, ProcessSession } from '../contracts';
import type { AnalysisRepository } from '../repository/AnalysisRepository';
import { onProcessSelected } from '@/infrastructure/tauri/TauriWorkspaceGateway';
import { useWorkspaceLifecycleState } from './useWorkspaceLifecycleState';
import { useWorkspaceLifecycleAutoRefresh } from './useWorkspaceLifecycleAutoRefresh';

const analysisSessionDiagnostics = createDiagnosticsLogger({
  channel: 'analysis',
  origin: 'useAnalysisSessionState',
});

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function logPerf(label: string, startedAt: number, details?: Record<string, unknown>) {
  const durationMs = nowMs() - startedAt;
  analysisSessionDiagnostics.debug('Analysis session operation completed.', {
    context: {
      operation: label,
      durationMs,
      ...(details ?? {}),
    },
  });
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
    applyWorkspaceLifecycleFallback,
    workspaceLifecycle,
    refreshWorkspaceLifecycle,
  } = useWorkspaceLifecycleState({
    repository,
  });

  useWorkspaceLifecycleAutoRefresh({
    enabled: processSession != null && !loadingImages,
    refreshWorkspaceLifecycle,
  });

  const fetchMetadata = useCallback(async (session: ProcessSession | null) => {
    const startedAt = nowMs();
    setLoadingImages(true);
    applyWorkspaceLifecycleFallback({
      status: 'snapshot-loading',
      processSession: session,
      runtime: session?.runtime ?? 'unknown',
      hasSnapshot: false,
      errorMessage: null,
    });
    const metadataLoad = repository.loadAllMetadata();
    logPerf('snapshotLoading:entered', startedAt, {
      processName: session?.processName ?? null,
      runtime: session?.runtime ?? 'unknown',
    });
    try {
      const snapshot = await metadataLoad;
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
      analysisSessionDiagnostics.error('Analysis metadata load failed.', {
        error,
        context: {
          processName: session?.processName ?? null,
          runtime: session?.runtime ?? 'unknown',
        },
      });
    } finally {
      setLoadingImages(false);
      applyWorkspaceLifecycleFallback({
        status: 'attached-without-snapshot',
        processSession: session,
        runtime: session?.runtime ?? 'unknown',
        hasSnapshot: false,
        errorMessage: null,
      });
      await refreshWorkspaceLifecycle('after-metadata-load');
    }
  }, [applyWorkspaceLifecycleFallback, refreshWorkspaceLifecycle, repository]);

  useEffect(() => {
    const unlisten = onProcessSelected(async (process) => {
      const startedAt = nowMs();
      setAttachError(null);
      setLoadingImages(true);
      try {
        const attachRequest = repository.attachToProcess({
          pid: process.pid,
          name: process.name,
        });
        applyWorkspaceLifecycleFallback({
          status: 'attaching',
          processSession: null,
          runtime: 'unknown',
          hasSnapshot: false,
          errorMessage: null,
        });
        const session = await attachRequest;

        setProcessSession(session);
        setAnalysisSnapshot(null);
        onResetWorkspace();
        applyWorkspaceLifecycleFallback({
          status: 'attached-without-snapshot',
          processSession: session,
          runtime: session.runtime,
          hasSnapshot: false,
          errorMessage: null,
        });
        await refreshWorkspaceLifecycle('after-attach');
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
        applyWorkspaceLifecycleFallback({
          status: 'runtime-error',
          processSession: null,
          runtime: 'unknown',
          hasSnapshot: false,
          errorMessage: toErrorMessage(error),
        });
        analysisSessionDiagnostics.error('Process attach failed.', {
          error,
          context: {
            pid: process.pid,
            processName: process.name,
            durationMs: nowMs() - startedAt,
          },
        });
      }
    });

    return () => {
      unlisten.then((dispose) => dispose());
    };
  }, [applyWorkspaceLifecycleFallback, fetchMetadata, onResetWorkspace, refreshWorkspaceLifecycle, repository]);

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
