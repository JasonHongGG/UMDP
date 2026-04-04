import { useRef } from 'react';
import { useAnalysisWorkspace } from '@/app/state/useAnalysisWorkspace';
import { useWorkspaceShellState } from '@/app/state/useWorkspaceShellState';
import { useInspectorWorkspaceValue } from '@/domain/inspector/useInspectorWorkspaceValue';

export function useInspectorPageState() {
  const {
    attachError,
    analysisSnapshot,
    images,
    classesByImage,
    classDetailsByStableId,
    runtimeOverlays,
    runtimeFieldErrorByKey,
    loadingRuntimeByKey,
    ensureRuntimeOverlayLoaded,
    queuePendingClassNode,
    workspaceLifecycle,
  } = useAnalysisWorkspace();
  const { setActivePage } = useWorkspaceShellState();
  const resetRevisionRef = useRef(0);
  const previousSessionKeyRef = useRef<string | null>(workspaceLifecycle.runtimeSession.sessionKey);

  if (previousSessionKeyRef.current !== workspaceLifecycle.runtimeSession.sessionKey) {
    previousSessionKeyRef.current = workspaceLifecycle.runtimeSession.sessionKey;
    resetRevisionRef.current += 1;
  }

  return useInspectorWorkspaceValue({
    attachError,
    analysisSnapshot,
    images,
    loadingImages: !workspaceLifecycle.hasSnapshot,
    classesByImage,
    classDetailsByStableId,
    runtimeOverlays,
    runtimeFieldErrorByKey,
    loadingRuntimeByKey,
    ensureRuntimeOverlayLoaded,
    setActivePage,
    queuePendingClassNode,
    workspaceResetRevision: resetRevisionRef.current,
  }).value;
}
