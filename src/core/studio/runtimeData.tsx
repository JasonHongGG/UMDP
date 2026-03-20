import React, { createContext, useContext } from 'react';
import { createPendingClassNodeRequest, type ClassBinding, type ClassInfoCatalog, type PendingClassNodeRequest, type StudioClassCatalogEntry } from '../../domain/studio/editor';
import type { StableId } from '../../domain/contracts/shared-identity';
import type { ExpressionSource, WorkflowJsonValue } from '../../domain/studio/contracts';
import { formatHexAddress } from '../addressFormat';
import { resolveExpressionSource } from './expression';
import type { ResolvedMemberRuntimeValue } from './contracts';
import type { NodeExecutionSnapshot } from './types';

export interface StudioRuntimeClassCatalogState {
  createNodeRequest: (binding: ClassBinding, suggestedPosition?: { x: number; y: number }) => PendingClassNodeRequest | null;
  getByBinding: (binding: ClassBinding | null | undefined) => ClassInfoCatalog | null;
  resolveStaticFieldAddress: (classStableId: string, memberStableId: string) => string | null;
  resolveMemberValues: (classStableId: string, instanceAddress: WorkflowJsonValue | null | undefined) => Record<string, ResolvedMemberRuntimeValue> | undefined;
  ensureOverlayLoaded: (classStableId: StableId) => void;
  ensureInstanceFieldsLoaded: (classStableId: StableId, instanceAddress: string) => void;
  openInspector?: (binding: ClassBinding) => void;
}

export interface StudioRuntimeExpressionState {
  resolveSource: (source: ExpressionSource, snapshots: Record<string, NodeExecutionSnapshot>) => WorkflowJsonValue | undefined;
}

export interface StudioRuntimeDataState {
  classes: StudioClassCatalogEntry[];
  classCatalog: StudioRuntimeClassCatalogState;
  expressions: StudioRuntimeExpressionState;
}

type RuntimeMemberValuesByClassAndAddress = Record<string, Record<string, Record<string, ResolvedMemberRuntimeValue>>>;

interface CreateStudioRuntimeDataStateOptions {
  classes: StudioClassCatalogEntry[];
  classInfoCatalogByStableId: Record<string, ClassInfoCatalog>;
  staticFieldAddressByClassAndMember: Record<string, Record<string, string | null>>;
  runtimeMemberValuesByClassAndAddress: RuntimeMemberValuesByClassAndAddress;
  ensureRuntimeOverlayLoaded: (classStableId: StableId) => void;
  ensureRuntimeInstanceFieldsLoaded: (classStableId: StableId, instanceAddress: string) => void;
  openInspectorForBinding?: (binding: ClassBinding) => void;
}

const StudioRuntimeDataContext = createContext<StudioRuntimeDataState | null>(null);

export function createStudioRuntimeDataState({
  classes,
  classInfoCatalogByStableId,
  staticFieldAddressByClassAndMember,
  runtimeMemberValuesByClassAndAddress,
  ensureRuntimeOverlayLoaded,
  ensureRuntimeInstanceFieldsLoaded,
  openInspectorForBinding,
}: CreateStudioRuntimeDataStateOptions): StudioRuntimeDataState {
  const resolveStaticFieldAddress = (classStableId: string, memberStableId: string) => {
    return staticFieldAddressByClassAndMember[classStableId]?.[memberStableId] ?? null;
  };

  const resolveMemberValues = (classStableId: string, instanceAddress: WorkflowJsonValue | null | undefined) => {
    if (typeof instanceAddress !== 'string') {
      return undefined;
    }

    const normalizedAddress = formatHexAddress(instanceAddress);
    if (!normalizedAddress) {
      return undefined;
    }

    return runtimeMemberValuesByClassAndAddress[classStableId]?.[normalizedAddress];
  };

  return {
    classes,
    classCatalog: {
      createNodeRequest: (binding: ClassBinding, suggestedPosition?: { x: number; y: number }) => {
        const catalog = classInfoCatalogByStableId[binding.classStableId];
        if (!catalog) {
          return null;
        }

        return createPendingClassNodeRequest(binding, suggestedPosition);
      },
      getByBinding: (binding: ClassBinding | null | undefined) => {
        if (!binding) {
          return null;
        }

        return classInfoCatalogByStableId[binding.classStableId] ?? null;
      },
      resolveStaticFieldAddress,
      resolveMemberValues,
      ensureOverlayLoaded: ensureRuntimeOverlayLoaded,
      ensureInstanceFieldsLoaded: ensureRuntimeInstanceFieldsLoaded,
      openInspector: openInspectorForBinding,
    },
    expressions: {
      resolveSource: (source, snapshots) => resolveExpressionSource(source, {
        snapshots,
        resolveStaticFieldAddress,
      }) as WorkflowJsonValue | undefined,
    },
  };
}

export function StudioRuntimeDataProvider({ value, children }: { value: StudioRuntimeDataState; children: React.ReactNode }) {
  return (
    <StudioRuntimeDataContext.Provider value={value}>
      {children}
    </StudioRuntimeDataContext.Provider>
  );
}

export function useStudioRuntimeData() {
  const context = useContext(StudioRuntimeDataContext);
  if (!context) {
    throw new Error('useStudioRuntimeData must be used within a StudioRuntimeDataProvider');
  }

  return context;
}