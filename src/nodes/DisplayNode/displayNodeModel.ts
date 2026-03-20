import type { DisplayNodeDocumentState, DisplayNodePayloadSummary, WorkflowJsonEnvelope, WorkflowJsonValue } from '../../domain/studio/contracts';
import { parseDisplayNodeDocumentState } from '../../domain/studio/contracts';
import type { BaseNodeData } from '../../core/studio/types';
import type { NodeInstance } from '../../domain/studio/contracts';

export interface DisplayNodeData extends BaseNodeData, DisplayNodeDocumentState {}

export interface DisplayNodeResolvedView {
  sourceKind: 'runtime' | 'preview';
  envelope: WorkflowJsonEnvelope;
  summary: DisplayNodePayloadSummary;
  sourceNodeId?: string | null;
  sourcePortId?: string | null;
}

export function createDisplayNodeData(): DisplayNodeData {
  return {
    expandedByDefault: false,
    truncateAt: 180,
    showSchema: true,
    showMeta: true,
  };
}

export function hydrateDisplayNodeData(baseData: BaseNodeData, instance: NodeInstance): DisplayNodeData {
  return {
    ...baseData,
    nodeName: instance.displayName,
    ...parseDisplayNodeDocumentState(instance.documentState),
  };
}

export function toDisplayNodeDocumentState(data: DisplayNodeData): DisplayNodeDocumentState {
  return {
    expandedByDefault: Boolean(data.expandedByDefault),
    truncateAt: typeof data.truncateAt === 'number' && Number.isFinite(data.truncateAt) ? data.truncateAt : 180,
    showSchema: data.showSchema !== false,
    showMeta: data.showMeta !== false,
  };
}

function truncateText(value: string, truncateAt: number) {
  if (value.length <= truncateAt) {
    return value;
  }

  return `${value.slice(0, truncateAt)}...`;
}

export function createPayloadSummary(payload: WorkflowJsonValue, truncateAt: number): DisplayNodePayloadSummary {
  if (payload === null) {
    return {
      valueKind: 'null',
      previewText: 'null',
    };
  }

  if (Array.isArray(payload)) {
    const previewItems = payload.slice(0, 3).map((entry) => previewPrimitive(entry, truncateAt));
    return {
      valueKind: 'array',
      previewText: truncateText(previewItems.join(', '), truncateAt),
      entryCount: payload.length,
    };
  }

  if (typeof payload === 'object') {
    const keys = Object.keys(payload);
    return {
      valueKind: 'object',
      previewText: truncateText(keys.slice(0, 4).join(', '), truncateAt),
      entryCount: keys.length,
      sampleKeys: keys.slice(0, 4),
    };
  }

  return {
    valueKind: 'primitive',
    previewText: previewPrimitive(payload, truncateAt),
  };
}

function previewPrimitive(value: WorkflowJsonValue, truncateAt: number) {
  if (typeof value === 'string') {
    return truncateText(value, truncateAt);
  }

  return truncateText(String(value), truncateAt);
}

export function formatMetaValue(value: WorkflowJsonValue, truncateAt: number) {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'object') {
    return truncateText(JSON.stringify(value), truncateAt);
  }

  return truncateText(String(value), truncateAt);
}
