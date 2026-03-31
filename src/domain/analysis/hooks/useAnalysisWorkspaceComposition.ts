import { useCallback, useMemo, useRef, useState } from 'react';
import { createStudioRuntimeDataState } from '@/features/studio/core/runtimeData';
import type { PendingClassNodeRequest } from '@/domain/studio/editor';
import type { ActivePage } from '../workspace-types';
import { useAnalysisRepository } from './useAnalysisRepository';
import { useAnalysisSessionState } from './useAnalysisSessionState';
import { useAnalysisRuntimeState } from './useAnalysisRuntimeState';
import { useAnalysisCatalogProjection } from './useAnalysisCatalogProjection';
import { useAnalysisContractVersions } from './useAnalysisContractVersions';
import {
  useWorkspaceTaskRegistry,
  type WorkspaceShellContextValue,
} from '@/domain/workspace/WorkspaceShellContext';
import { useWorkspaceShellSignals } from '@/domain/workspace/useWorkspaceShellSignals';
import { useInspectorWorkspaceValue } from '@/domain/inspector/useInspectorWorkspaceValue';
import type { InspectorWorkspaceContextValue } from '@/domain/inspector/InspectorWorkspaceContext';
import { type StudioWorkspaceContextValue } from '@/domain/studio/StudioWorkspaceContext';
import type { AnalysisWorkspaceContextValue } from '../AnalysisWorkspaceContext.types';

export function useAnalysisWorkspaceComposition() {
  const [activePage, setActivePage] = useState<ActivePage>('inspector');
  const [pendingClassNode, setPendingClassNode] = useState<PendingClassNodeRequest | null>(null);
  const { workspaceTasks, setWorkspaceTasks, resetWorkspaceTasks } = useWorkspaceTaskRegistry();
  const resetWorkspaceStateRef = useRef<() => void>(() => undefined);

  const repository = useAnalysisRepository();
  const contractVersions = useAnalysisContractVersions(repository);

  const resetWorkspace = useCallback(() => {
    setPendingClassNode(null);
    resetWorkspaceTasks();
    resetWorkspaceStateRef.current();
  }, [resetWorkspaceTasks]);

  const {
    processSession,
    attachError,
    analysisSnapshot,
    loadingImages,
    workspaceLifecycle,
  } = useAnalysisSessionState({ repository, onResetWorkspace: resetWorkspace });

  const {
    runtimeOverlays,
    runtimeFieldErrorByKey,
    loadingRuntimeByKey,
    runtimeMemberValuesByClassAndAddress,
    ensureRuntimeOverlayLoaded,
    ensureRuntimeInstanceFieldsLoaded,
  } = useAnalysisRuntimeState({ repository, processSession, analysisSnapshot, workspaceLifecycle });

  const { pageReadiness, workspaceResetNotice } = useWorkspaceShellSignals(workspaceLifecycle);
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
  });

  resetWorkspaceStateRef.current = () => {
    inspectorWorkspace.resetInspectorWorkspaceState();
  };

  const clearPendingClassNode = useCallback(() => {
    setPendingClassNode(null);
  }, []);

  const studioRuntimeData = useMemo(() => createStudioRuntimeDataState({
    classes: inspectorWorkspace.studioClassCatalogEntries,
    classInfoCatalogByStableId: inspectorWorkspace.classInfoCatalogByStableId,
    staticFieldAddressByClassAndMember: inspectorWorkspace.staticFieldAddressByClassAndMember,
    runtimeMemberValuesByClassAndAddress,
    ensureRuntimeOverlayLoaded,
    ensureRuntimeInstanceFieldsLoaded,
    openInspectorForBinding: inspectorWorkspace.handleOpenInspectorForBinding,
  }), [
    ensureRuntimeInstanceFieldsLoaded,
    ensureRuntimeOverlayLoaded,
    inspectorWorkspace.classInfoCatalogByStableId,
    inspectorWorkspace.handleOpenInspectorForBinding,
    inspectorWorkspace.staticFieldAddressByClassAndMember,
    inspectorWorkspace.studioClassCatalogEntries,
    runtimeMemberValuesByClassAndAddress,
  ]);

  const workspaceShellValue = useMemo<WorkspaceShellContextValue>(() => ({
    processSession,
    contractVersions,
    workspaceLifecycle,
    pageReadiness,
    workspaceResetNotice,
    activePage,
    setActivePage,
    workspaceTasks,
    setWorkspaceTasks,
  }), [
    activePage,
    contractVersions,
    pageReadiness,
    processSession,
    setWorkspaceTasks,
    workspaceLifecycle,
    workspaceResetNotice,
    workspaceTasks,
  ]);

  const studioWorkspaceValue = useMemo<StudioWorkspaceContextValue>(() => ({
    studioRuntimeData,
    pendingClassNode,
    clearPendingClassNode,
    workspaceLifecycle,
  }), [clearPendingClassNode, pendingClassNode, studioRuntimeData, workspaceLifecycle]);

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
    studioRuntimeData,
    ensureRuntimeOverlayLoaded,
    ensureRuntimeInstanceFieldsLoaded,
    runtimeMemberValuesByClassAndAddress,
  }), [
    analysisSnapshot,
    attachError,
    classDetailsByStableId,
    classesByImage,
    contractVersions,
    ensureRuntimeInstanceFieldsLoaded,
    ensureRuntimeOverlayLoaded,
    images,
    inspectorWorkspace.classInfoCatalogByStableId,
    inspectorWorkspace.staticFieldAddressByClassAndMember,
    inspectorWorkspace.studioClassCatalogEntries,
    processSession,
    runtimeMemberValuesByClassAndAddress,
    runtimeOverlays,
    studioRuntimeData,
  ]);

  return {
    analysisWorkspaceValue,
    inspectorWorkspaceValue: inspectorWorkspace.value as InspectorWorkspaceContextValue,
    studioWorkspaceValue,
    workspaceShellValue,
  };
}