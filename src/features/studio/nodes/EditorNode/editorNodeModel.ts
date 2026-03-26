import type { BaseNodeData } from '@/features/studio/core/types';
import { createStableId, type StableId } from '@/domain/contracts/shared-identity';
import {
  parseEditorNodeDocumentState,
  type EditorNodeDocumentState,
  type EditorTargetDocumentItem,
  type ExpressionSource,
} from '@/domain/studio/contracts';
import { classifyEditorScalarKind, createDefaultValueSourceForKind } from './editorValueTypes';

export interface EditorTargetEntry {
  id: StableId;
  memberStableId: StableId;
  memberName: string;
  memberTypeName: string;
  isStatic: boolean;
  valueSource: ExpressionSource;
}

export interface EditorNodeData extends BaseNodeData {
  targets: EditorTargetEntry[];
}

export function createEditorNodeData(): EditorNodeData {
  return {
    targets: [],
  };
}

export function createEditorTargetEntry(memberStableId: string, memberName: string, memberTypeName: string, isStatic: boolean): EditorTargetEntry {
  return {
    id: createStableId('binding', ['editor-target', memberStableId]),
    memberStableId: memberStableId as StableId,
    memberName,
    memberTypeName,
    isStatic,
    valueSource: createDefaultValueSourceForKind(classifyEditorScalarKind(memberTypeName)),
  };
}

export function toEditorTargetDocumentItem(target: EditorTargetEntry): EditorTargetDocumentItem {
  return {
    targetId: target.id,
    memberStableId: target.memberStableId,
    memberName: target.memberName,
    memberTypeName: target.memberTypeName,
    isStatic: target.isStatic,
    valueSource: target.valueSource,
  };
}

export function toEditorNodeDocumentState(data: EditorNodeData): EditorNodeDocumentState {
  return {
    targets: data.targets.map(toEditorTargetDocumentItem),
  };
}

export function fromEditorNodeDocumentState(documentState: EditorNodeDocumentState): EditorTargetEntry[] {
  return documentState.targets.map((target) => ({
    id: target.targetId,
    memberStableId: target.memberStableId,
    memberName: target.memberName,
    memberTypeName: target.memberTypeName,
    isStatic: target.isStatic,
    valueSource: target.valueSource,
  }));
}

export function parseEditorNodeDataFromDocumentState(
  baseData: BaseNodeData,
  instance: import('@/domain/studio/contracts').NodeInstance,
): EditorNodeData {
  const documentState = parseEditorNodeDocumentState(instance.documentState);

  return {
    ...baseData,
    nodeName: instance.displayName,
    targets: fromEditorNodeDocumentState(documentState),
  };
}

export function getEditorTargetBindingKey(target: EditorTargetEntry) {
  return target.id;
}

export function findEditorTarget(targets: EditorTargetEntry[], memberStableId: string, isStatic: boolean) {
  return targets.find((target) => target.memberStableId === memberStableId && target.isStatic === isStatic) ?? null;
}