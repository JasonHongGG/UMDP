import { useCallback, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from './hooks';
import {
  selectActivePage,
  selectContractVersions,
  selectWorkspaceLifecycle,
  selectWorkspacePresentation,
  selectWorkspaceTasks,
  selectWorkspaceView,
  workspaceActions,
} from './store';

export function useWorkspaceShellState() {
  const dispatch = useAppDispatch();
  const activePage = useAppSelector(selectActivePage);
  const contractVersions = useAppSelector(selectContractVersions);
  const workspaceLifecycle = useAppSelector(selectWorkspaceLifecycle);
  const workspaceView = useAppSelector(selectWorkspaceView);
  const workspacePresentation = useAppSelector(selectWorkspacePresentation);
  const workspaceTasks = useAppSelector(selectWorkspaceTasks);

  const setActivePage = useCallback((page: typeof activePage) => {
    dispatch(workspaceActions.setActivePage(page));
  }, [dispatch]);

  const setWorkspaceTasks = useCallback((sourceKey: string, tasks: typeof workspaceTasks) => {
    dispatch(workspaceActions.setWorkspaceTasks({ sourceKey, tasks }));
  }, [dispatch]);

  return useMemo(() => ({
    processSession: workspaceLifecycle.processSession,
    contractVersions,
    workspaceLifecycle,
    workspaceView,
    workspacePresentation,
    activePage,
    setActivePage,
    workspaceTasks,
    setWorkspaceTasks,
  }), [activePage, contractVersions, setActivePage, setWorkspaceTasks, workspaceLifecycle, workspacePresentation, workspaceTasks, workspaceView]);
}
