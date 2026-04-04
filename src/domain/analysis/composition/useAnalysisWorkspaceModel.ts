import { useCallback, useMemo, useState } from 'react';
import {
  useWorkspaceTaskRegistry,
  type WorkspaceShellContextValue,
} from '@/domain/workspace/WorkspaceShellContext';
import type { AnalysisWorkspaceContextValue } from '@/domain/analysis/AnalysisWorkspaceContext.types';
import { useAnalysisRepository } from '@/domain/analysis/hooks/useAnalysisRepository';
import { useAnalysisContractVersions } from '@/domain/analysis/hooks/useAnalysisContractVersions';
import { useAnalysisSessionState } from '@/domain/analysis/hooks/useAnalysisSessionState';
import { useAnalysisRuntimeState } from '@/domain/analysis/hooks/useAnalysisRuntimeState';
import { useAnalysisCatalogProjection } from '@/domain/analysis/hooks/useAnalysisCatalogProjection';
import { useInspectorWorkspaceValue } from '@/domain/inspector/useInspectorWorkspaceValue';
import { useWorkspaceAttachIntentChannel } from '@/domain/workspace/useWorkspaceAttachIntentChannel';
import { useWorkspaceShellModel } from '@/domain/workspace/useWorkspaceShellModel';
import type { PendingClassNodeRequest } from '@/domain/studio/editor';
import type { ActivePage } from '@/domain/analysis/workspace-types';

export function useAnalysisWorkspaceModel() {
  const [activePage, setActivePage] = useState<ActivePage>('inspector');
  const [pendingClassNode, setPendingClassNode] = useState<PendingClassNodeRequest | null>(null);
  const [workspaceResetRevision, setWorkspaceResetRevision] = useState(0);
  const { workspaceTasks, setWorkspaceTasks, resetWorkspaceTasks } = useWorkspaceTaskRegistry();

  const repository = useAnalysisRepository();
  const attachIntentChannel = useWorkspaceAttachIntentChannel();
  const contractVersions = useAnalysisContractVersions(repository);

  const clearPendingClassNode = useCallback(() => {
    setPendingClassNode(null);
  }, []);

  const resetWorkspace = useCallback(() => {
    setPendingClassNode(null);
    resetWorkspaceTasks();
    setWorkspaceResetRevision((current) => current + 1);
  }, [resetWorkspaceTasks]);

  const {
    processSession,
    attachError,
    analysisSnapshot,
    loadingImages,
    workspaceLifecycle,
  } = useAnalysisSessionState({
    repository,
    onResetWorkspace: resetWorkspace,
    attachIntentChannel,
  });

  const {
    runtimeOverlays,
    runtimeFieldErrorByKey,
    loadingRuntimeByKey,
    runtimeMemberValuesByClassAndAddress,
    ensureRuntimeOverlayLoaded,
    ensureRuntimeInstanceFieldsLoaded,
  } = useAnalysisRuntimeState({ repository, processSession, analysisSnapshot, workspaceLifecycle });

  const {
    images,
    classesByImage,
    classDetailsByStableId,
  } = useAnalysisCatalogProjection(analysisSnapshot);

  const inspectorWorkspace = useInspectorWorkspaceValue({
    attachError,
    analysisSnapshot,
    images,
    loadingImages,
    classesByImage,
    classDetailsByStableId,
    runtimeOverlays,
    runtimeFieldErrorByKey,
    loadingRuntimeByKey,
    ensureRuntimeOverlayLoaded,
    setActivePage,
    queuePendingClassNode: setPendingClassNode,
    workspaceResetRevision,
  });

  const { workspaceView, workspacePresentation } = useWorkspaceShellModel({
    processSession,
    contractVersions,
    workspaceLifecycle,
    activePage,
    workspaceTasks,
  });

  const analysisWorkspaceValue = useMemo<AnalysisWorkspaceContextValue>(() => ({
    processSession,
    attachError,
    analysisSnapshot,
    contractVersions,
    runtimeOverlays,
    images,
    classesByImage,
    classDetailsByStableId,
    studioClassCatalogEntries: inspectorWorkspace.studioClassCatalogEntries,
    classInfoCatalogByStableId: inspectorWorkspace.classInfoCatalogByStableId,
    staticFieldAddressByClassAndMember: inspectorWorkspace.staticFieldAddressByClassAndMember,
    pendingClassNode,
    clearPendingClassNode,
    ensureRuntimeOverlayLoaded,
    ensureRuntimeInstanceFieldsLoaded,
    runtimeMemberValuesByClassAndAddress,
  }), [
    analysisSnapshot,
    attachError,
    classDetailsByStableId,
    classesByImage,
    clearPendingClassNode,
    contractVersions,
    ensureRuntimeInstanceFieldsLoaded,
    ensureRuntimeOverlayLoaded,
    images,
    inspectorWorkspace.classInfoCatalogByStableId,
    inspectorWorkspace.staticFieldAddressByClassAndMember,
    inspectorWorkspace.studioClassCatalogEntries,
    pendingClassNode,
    processSession,
    runtimeMemberValuesByClassAndAddress,
    runtimeOverlays,
  ]);

  const workspaceShellValue = useMemo<WorkspaceShellContextValue>(() => ({
    processSession,
    contractVersions,
    workspaceLifecycle,
    workspaceView,
    workspacePresentation,
    activePage,
    setActivePage,
    workspaceTasks,
    setWorkspaceTasks,
  }), [
    activePage,
    contractVersions,
    processSession,
    setWorkspaceTasks,
    workspaceView,
    workspaceLifecycle,
    workspacePresentation,
    workspaceTasks,
  ]);

  return {
    analysisWorkspaceValue,
    workspaceShellValue,
    inspectorWorkspaceValue: inspectorWorkspace.value,
  };
}