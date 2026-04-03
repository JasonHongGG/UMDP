import { useEffect } from 'react';
import type { WorkspaceLifecycleState } from '@/shared/contracts';

interface UseWorkspaceLifecycleAutoRefreshOptions {
  enabled: boolean;
  refreshWorkspaceLifecycle: (reason?: string) => Promise<void>;
}

export function useWorkspaceLifecycleAutoRefresh({
  enabled,
  refreshWorkspaceLifecycle,
}: UseWorkspaceLifecycleAutoRefreshOptions) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const refreshOnFocus = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      refreshWorkspaceLifecycle('window-focus').catch(() => undefined);
    };

    const refreshOnVisible = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      refreshWorkspaceLifecycle('document-visible').catch(() => undefined);
    };

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisible);

    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisible);
    };
  }, [enabled, refreshWorkspaceLifecycle]);
}