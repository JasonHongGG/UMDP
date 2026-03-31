import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import {
  createWorkspacePageReadinessMap,
  describeWorkspaceResetNotice,
  type WorkspaceResetNotice,
} from './pageReadiness';

export function useWorkspaceShellSignals(workspaceLifecycle: WorkspaceLifecycleState) {
  const previousSessionKeyRef = useRef<string | null>(workspaceLifecycle.runtimeSession.sessionKey);
  const [workspaceResetNotice, setWorkspaceResetNotice] = useState<WorkspaceResetNotice | null>(null);

  const pageReadiness = useMemo(() => {
    return createWorkspacePageReadinessMap(workspaceLifecycle);
  }, [workspaceLifecycle]);

  useEffect(() => {
    const previousSessionKey = previousSessionKeyRef.current;
    const nextNotice = describeWorkspaceResetNotice(workspaceLifecycle, previousSessionKey);
    setWorkspaceResetNotice(nextNotice);
    previousSessionKeyRef.current = workspaceLifecycle.runtimeSession.sessionKey;
  }, [workspaceLifecycle]);

  return {
    pageReadiness,
    workspaceResetNotice,
  };
}