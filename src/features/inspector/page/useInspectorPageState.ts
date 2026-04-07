import { useRef } from 'react';
import { useAnalysisWorkspace } from '@/app/state/useAnalysisWorkspace';
import { useStudioHandoff } from '@/app/state/useStudioHandoff';
import { useWorkspaceShellState } from '@/app/state/useWorkspaceShellState';
import { useInspectorModuleState } from '@/features/inspector/application/useInspectorModuleState';

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
    workspaceLifecycle,
  } = useAnalysisWorkspace();
  const { queuePendingClassNode } = useStudioHandoff();
  const { setActivePage } = useWorkspaceShellState();
  const resetRevisionRef = useRef(0);
  const previousSessionKeyRef = useRef<string | null>(workspaceLifecycle.runtimeSession.sessionKey);

  if (previousSessionKeyRef.current !== workspaceLifecycle.runtimeSession.sessionKey) {
    previousSessionKeyRef.current = workspaceLifecycle.runtimeSession.sessionKey;
    resetRevisionRef.current += 1;
  }

  return useInspectorModuleState({
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
