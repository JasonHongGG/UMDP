import { useMemo } from 'react';
import type { PendingClassNodeRequest } from '@/domain/studio/editor';
import { useAppDispatch, useAppSelector } from './hooks';
import { handoffActions, selectPendingClassNode } from './store';

export function useStudioHandoff() {
  const dispatch = useAppDispatch();
  const pendingClassNode = useAppSelector(selectPendingClassNode);

  return useMemo(() => ({
    pendingClassNode,
    clearPendingClassNode: () => {
      dispatch(handoffActions.clearPendingClassNode());
    },
    queuePendingClassNode: (request: PendingClassNodeRequest) => {
      dispatch(handoffActions.queuePendingClassNode(request));
    },
  }), [dispatch, pendingClassNode]);
}