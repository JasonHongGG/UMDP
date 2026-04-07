import { useMemo } from 'react';
import { useAppDispatch, useAppSelector } from './hooks';
import {
  ensureRuntimeInstanceFieldsLoaded,
  ensureRuntimeOverlayLoaded,
  selectAnalysisSnapshot,
  selectAttachError,
  selectClassDetailsByStableId,
  selectClassInfoCatalogByStableId,
  selectClassesByImage,
  selectContractVersions,
  selectImages,
  selectLoadingRuntimeByKey,
  selectRuntimeFieldErrorMessages,
  selectRuntimeMemberValuesByClassAndAddress,
  selectRuntimeOverlays,
  selectStaticFieldAddressByClassAndMember,
  selectStudioClassCatalogEntries,
  selectWorkspaceLifecycle,
} from './store';

export function useAnalysisWorkspace() {
  const dispatch = useAppDispatch();
  const attachErrorEnvelope = useAppSelector(selectAttachError);
  const analysisSnapshot = useAppSelector(selectAnalysisSnapshot);
  const contractVersions = useAppSelector(selectContractVersions);
  const workspaceLifecycle = useAppSelector(selectWorkspaceLifecycle);
  const runtimeOverlays = useAppSelector(selectRuntimeOverlays);
  const images = useAppSelector(selectImages);
  const classesByImage = useAppSelector(selectClassesByImage);
  const classDetailsByStableId = useAppSelector(selectClassDetailsByStableId);
  const studioClassCatalogEntries = useAppSelector(selectStudioClassCatalogEntries);
  const classInfoCatalogByStableId = useAppSelector(selectClassInfoCatalogByStableId);
  const staticFieldAddressByClassAndMember = useAppSelector(selectStaticFieldAddressByClassAndMember);
  const runtimeMemberValuesByClassAndAddress = useAppSelector(selectRuntimeMemberValuesByClassAndAddress);
  const runtimeFieldErrorByKey = useAppSelector(selectRuntimeFieldErrorMessages);
  const loadingRuntimeByKey = useAppSelector(selectLoadingRuntimeByKey);

  return useMemo(() => ({
    processSession: workspaceLifecycle.processSession,
    attachError: attachErrorEnvelope?.message ?? null,
    attachIssue: attachErrorEnvelope,
    analysisSnapshot,
    contractVersions,
    workspaceLifecycle,
    runtimeOverlays,
    images,
    classesByImage,
    classDetailsByStableId,
    studioClassCatalogEntries,
    classInfoCatalogByStableId,
    staticFieldAddressByClassAndMember,
    ensureRuntimeOverlayLoaded: (classStableId: string) => {
      dispatch(ensureRuntimeOverlayLoaded(classStableId));
    },
    ensureRuntimeInstanceFieldsLoaded: (classStableId: string, instanceAddress: string) => {
      dispatch(ensureRuntimeInstanceFieldsLoaded({ classStableId, instanceAddress }));
    },
    runtimeMemberValuesByClassAndAddress,
    runtimeFieldErrorByKey,
    loadingRuntimeByKey,
  }), [
    analysisSnapshot,
    attachErrorEnvelope,
    classDetailsByStableId,
    classInfoCatalogByStableId,
    classesByImage,
    contractVersions,
    dispatch,
    images,
    loadingRuntimeByKey,
    runtimeFieldErrorByKey,
    runtimeMemberValuesByClassAndAddress,
    runtimeOverlays,
    staticFieldAddressByClassAndMember,
    studioClassCatalogEntries,
    workspaceLifecycle,
  ]);
}
