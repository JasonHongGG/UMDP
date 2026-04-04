import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnalysisSnapshot,
  ProcessSession,
  RuntimeClassOverlayDescriptor,
  RuntimeInstanceFieldSnapshot,
} from '../contracts';
import type { StableId } from '../../contracts/shared-identity';
import type { AnalysisRepository } from '../repository/AnalysisRepository';
import type { WorkspaceLifecycleState } from '@/shared/contracts';
import { formatHexAddress } from '@/core/addressFormat';
import type { ResolvedMemberRuntimeValue } from '@/domain/studio/runtime';

interface UseAnalysisRuntimeStateOptions {
  repository: AnalysisRepository;
  processSession: ProcessSession | null;
  analysisSnapshot: AnalysisSnapshot | null;
  workspaceLifecycle: WorkspaceLifecycleState;
}

export function useAnalysisRuntimeState({ repository, processSession, analysisSnapshot, workspaceLifecycle }: UseAnalysisRuntimeStateOptions) {
  const [runtimeOverlays, setRuntimeOverlays] = useState<Record<string, RuntimeClassOverlayDescriptor>>({});
  const [runtimeInstanceFieldSnapshots, setRuntimeInstanceFieldSnapshots] = useState<Record<string, RuntimeInstanceFieldSnapshot>>({});
  const [runtimeFieldErrorByKey, setRuntimeFieldErrorByKey] = useState<Record<string, string | null>>({});
  const [loadingRuntimeByKey, setLoadingRuntimeByKey] = useState<Record<string, boolean>>({});
  const [runtimeInstanceFieldErrorByKey, setRuntimeInstanceFieldErrorByKey] = useState<Record<string, string | null>>({});
  const [loadingRuntimeInstanceByKey, setLoadingRuntimeInstanceByKey] = useState<Record<string, boolean>>({});
  const fetchingRuntimeRef = useRef<Set<string>>(new Set());
  const fetchingRuntimeInstanceRef = useRef<Set<string>>(new Set());

  const shouldClearRuntimeState = !processSession
    || !analysisSnapshot
    || !workspaceLifecycle.hasSnapshot
    || workspaceLifecycle.status === 'runtime-error'
    || workspaceLifecycle.status === 'recovering'
    || !workspaceLifecycle.runtimeSession.connected
    || workspaceLifecycle.runtimeSession.status === 'recovering'
    || workspaceLifecycle.runtimeSession.status === 'error';

  useEffect(() => {
    if (!shouldClearRuntimeState) {
      return;
    }

    setRuntimeOverlays({});
    setRuntimeInstanceFieldSnapshots({});
    setRuntimeFieldErrorByKey({});
    setLoadingRuntimeByKey({});
    setRuntimeInstanceFieldErrorByKey({});
    setLoadingRuntimeInstanceByKey({});
    fetchingRuntimeRef.current.clear();
    fetchingRuntimeInstanceRef.current.clear();
  }, [shouldClearRuntimeState]);

  const ensureRuntimeOverlayLoaded = useCallback((classStableId: StableId) => {
    if (!processSession || !analysisSnapshot) {
      return;
    }

    if (runtimeOverlays[classStableId] || fetchingRuntimeRef.current.has(classStableId)) {
      return;
    }

    const descriptor = analysisSnapshot.classes[classStableId];
    if (!descriptor) {
      return;
    }

    fetchingRuntimeRef.current.add(classStableId);
    setLoadingRuntimeByKey((current) => ({ ...current, [classStableId]: true }));

    repository.getRuntimeStaticFields(classStableId)
      .then((snapshot) => {
        setRuntimeOverlays((current) => ({
          ...current,
          [classStableId]: snapshot.classes[classStableId],
        }));
        setRuntimeFieldErrorByKey((current) => ({ ...current, [classStableId]: null }));
      })
      .catch((error) => {
        setRuntimeFieldErrorByKey((current) => ({ ...current, [classStableId]: String(error) }));
      })
      .finally(() => {
        fetchingRuntimeRef.current.delete(classStableId);
        setLoadingRuntimeByKey((current) => ({ ...current, [classStableId]: false }));
      });
  }, [analysisSnapshot, processSession, repository, runtimeOverlays]);

  const ensureRuntimeInstanceFieldsLoaded = useCallback((classStableId: StableId, instanceAddress: string) => {
    if (!processSession || !analysisSnapshot) {
      return;
    }

    const normalizedAddress = formatHexAddress(instanceAddress);
    if (!normalizedAddress) {
      return;
    }

    const descriptor = analysisSnapshot.classes[classStableId];
    if (!descriptor) {
      return;
    }

    const requestKey = `${classStableId}::${normalizedAddress}`;
    if (runtimeInstanceFieldSnapshots[requestKey] || fetchingRuntimeInstanceRef.current.has(requestKey)) {
      return;
    }

    fetchingRuntimeInstanceRef.current.add(requestKey);
    setLoadingRuntimeInstanceByKey((current) => ({ ...current, [requestKey]: true }));

    repository.getRuntimeInstanceFields({
      classStableId,
      instanceAddress: normalizedAddress,
    })
      .then((snapshot) => {
        setRuntimeInstanceFieldSnapshots((current) => ({
          ...current,
          [requestKey]: snapshot,
        }));
        setRuntimeInstanceFieldErrorByKey((current) => ({ ...current, [requestKey]: null }));
      })
      .catch((error) => {
        setRuntimeInstanceFieldErrorByKey((current) => ({ ...current, [requestKey]: String(error) }));
      })
      .finally(() => {
        fetchingRuntimeInstanceRef.current.delete(requestKey);
        setLoadingRuntimeInstanceByKey((current) => ({ ...current, [requestKey]: false }));
      });
  }, [analysisSnapshot, processSession, repository, runtimeInstanceFieldSnapshots]);

  const runtimeMemberValuesByClassAndAddress = useMemo(() => {
    return Object.values(runtimeInstanceFieldSnapshots).reduce<Record<string, Record<string, Record<string, ResolvedMemberRuntimeValue>>>>((acc, snapshot) => {
      const normalizedAddress = formatHexAddress(snapshot.instanceAddress);
      if (!normalizedAddress) {
        return acc;
      }

      if (!acc[snapshot.classStableId]) {
        acc[snapshot.classStableId] = {};
      }

      acc[snapshot.classStableId]![normalizedAddress] = Object.fromEntries(snapshot.fields.map((field) => [field.stableId, {
        address: formatHexAddress(field.address),
        value: field.value,
      }]));
      return acc;
    }, {});
  }, [runtimeInstanceFieldSnapshots]);

  return {
    runtimeOverlays,
    runtimeInstanceFieldSnapshots,
    runtimeFieldErrorByKey,
    loadingRuntimeByKey,
    runtimeInstanceFieldErrorByKey,
    loadingRuntimeInstanceByKey,
    runtimeMemberValuesByClassAndAddress,
    ensureRuntimeOverlayLoaded,
    ensureRuntimeInstanceFieldsLoaded,
  };
}
