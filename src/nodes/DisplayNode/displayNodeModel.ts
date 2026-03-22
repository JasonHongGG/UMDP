import type {
  DisplayNodeAvailableField,
  DisplayNodeDocumentState,
  DisplayNodePathToken,
  DisplayNodeResolvedField,
  DisplayNodeSelectedField,
  NodeQueryIssue,
  WorkflowJsonEnvelope,
  WorkflowJsonValue,
} from '../../domain/studio/contracts';
import { parseDisplayNodeDocumentState } from '../../domain/studio/contracts';
import type { BaseNodeData } from '../../core/studio/types';
import type { NodeInstance } from '../../domain/studio/contracts';

const FIELD_PREVIEW_LIMIT = 96;

export interface DisplayNodeData extends BaseNodeData, DisplayNodeDocumentState {}

export interface DisplayNodeResolvedView {
  sourceKind: 'runtime' | 'preview';
  envelope: WorkflowJsonEnvelope;
  availableFields: DisplayNodeAvailableField[];
  selectedFields: DisplayNodeResolvedField[];
  sourceNodeId?: string | null;
  sourcePortId?: string | null;
}

export function createDisplayNodeData(): DisplayNodeData {
  return {
    selectedFields: [],
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
    selectedFields: Array.isArray(data.selectedFields)
      ? data.selectedFields.map((field) => ({
        id: field.id,
        label: field.label,
        pathTokens: [...field.pathTokens],
        pathText: formatDisplayPath(field.pathTokens),
      }))
      : [],
  };
}

export function createDisplaySelectedField(pathTokens: DisplayNodePathToken[], label?: string): DisplayNodeSelectedField {
  const pathText = formatDisplayPath(pathTokens);

  return {
    id: createDisplayFieldId(),
    label: label?.trim() || getDisplayFieldLabel(pathTokens),
    pathTokens: [...pathTokens],
    pathText,
  };
}

export function syncDisplaySelectedField(field: DisplayNodeSelectedField): DisplayNodeSelectedField {
  const label = field.label?.trim();

  return {
    ...field,
    label: label || getDisplayFieldLabel(field.pathTokens),
    pathText: formatDisplayPath(field.pathTokens),
  };
}

export function buildDisplayAvailableFields(payload: WorkflowJsonValue): DisplayNodeAvailableField[] {
  if (Array.isArray(payload)) {
    return payload.map((entry, index) => createAvailableField([index], entry));
  }

  if (payload && typeof payload === 'object') {
    return Object.entries(payload).map(([key, value]) => createAvailableField([key], value));
  }

  return [createAvailableField([], payload, 'payload')];
}

export function resolveDisplaySelectedFields(
  selectedFields: DisplayNodeSelectedField[],
  payload: WorkflowJsonValue,
): DisplayNodeResolvedField[] {
  return selectedFields.map((field) => {
    const resolved = resolvePathValue(payload, field.pathTokens);
    const normalized = syncDisplaySelectedField(field);

    if (!resolved.found) {
      const issue: NodeQueryIssue = {
        severity: 'warning',
        code: 'display.field.missing',
        message: `${normalized.pathText} is no longer available in the current payload.`,
      };

      return {
        id: normalized.id,
        label: normalized.label,
        pathTokens: normalized.pathTokens,
        pathText: normalized.pathText,
        resolved: false,
        valueKind: 'missing',
        displayText: 'Field unavailable',
        issue,
      } satisfies DisplayNodeResolvedField;
    }

    return {
      id: normalized.id,
      label: normalized.label,
      pathTokens: normalized.pathTokens,
      pathText: normalized.pathText,
      resolved: true,
      valueKind: getDisplayValueKind(resolved.value),
      value: resolved.value,
      displayText: formatDisplayValuePreview(resolved.value),
    } satisfies DisplayNodeResolvedField;
  });
}

export function formatDisplayPath(pathTokens: DisplayNodePathToken[]): string {
  if (pathTokens.length === 0) {
    return 'payload';
  }

  return pathTokens.reduce<string>((path, token, index) => {
    if (typeof token === 'number') {
      return `${path}[${token}]`;
    }

    if (index === 0) {
      return token;
    }

    return `${path}.${token}`;
  }, '');
}

export function getDisplayFieldLabel(pathTokens: DisplayNodePathToken[]): string {
  if (pathTokens.length === 0) {
    return 'Payload';
  }

  const lastToken = pathTokens[pathTokens.length - 1];
  return typeof lastToken === 'number' ? `[${lastToken}]` : lastToken;
}

export function getDisplayValueKind(value: WorkflowJsonValue): DisplayNodeAvailableField['valueKind'] {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  if (typeof value === 'object') {
    return 'object';
  }

  return 'primitive';
}

export function formatDisplayValuePreview(value: WorkflowJsonValue, truncateAt = FIELD_PREVIEW_LIMIT): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'Empty array';
    }

    const previewItems = value.slice(0, 3).map((entry) => formatDisplayValuePreview(entry, 28));
    return truncateText(`[${previewItems.join(', ')}]`, truncateAt, `Array(${value.length})`);
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return 'Empty object';
    }

    return truncateText(keys.slice(0, 4).join(', '), truncateAt, `${keys.length} field${keys.length === 1 ? '' : 's'}`);
  }

  if (typeof value === 'string') {
    return truncateText(value, truncateAt);
  }

  return truncateText(String(value), truncateAt);
}

export function renderDisplayJsonValue(value: WorkflowJsonValue, depth = 0): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, depth > 0 ? 0 : 2);
  } catch {
    return '[unserializable value]';
  }
}

function createAvailableField(
  pathTokens: DisplayNodePathToken[],
  value: WorkflowJsonValue,
  explicitLabel?: string,
): DisplayNodeAvailableField {
  const pathText = formatDisplayPath(pathTokens);

  return {
    id: pathText,
    label: explicitLabel ?? getDisplayFieldLabel(pathTokens),
    pathTokens,
    pathText,
    valueKind: getDisplayValueKind(value),
    previewText: formatDisplayValuePreview(value),
    selectable: true,
    children: getChildFields(pathTokens, value),
  };
}

function getChildFields(pathTokens: DisplayNodePathToken[], value: WorkflowJsonValue): DisplayNodeAvailableField[] {
  if (Array.isArray(value)) {
    return value.map((entry, index) => createAvailableField([...pathTokens, index], entry));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, entryValue]) => createAvailableField([...pathTokens, key], entryValue));
  }

  return [];
}

function resolvePathValue(
  payload: WorkflowJsonValue,
  pathTokens: DisplayNodePathToken[],
): { found: boolean; value: WorkflowJsonValue } {
  let current: WorkflowJsonValue = payload;

  for (const token of pathTokens) {
    if (typeof token === 'number') {
      if (!Array.isArray(current) || token < 0 || token >= current.length) {
        return { found: false, value: null };
      }

      current = current[token] as WorkflowJsonValue;
      continue;
    }

    if (!current || typeof current !== 'object' || Array.isArray(current) || !(token in current)) {
      return { found: false, value: null };
    }

    current = (current as Record<string, WorkflowJsonValue>)[token];
  }

  return { found: true, value: current };
}

function truncateText(value: string, truncateAt: number, suffixLabel?: string) {
  if (value.length <= truncateAt) {
    return suffixLabel ? `${value} (${suffixLabel})` : value;
  }

  const truncated = `${value.slice(0, Math.max(0, truncateAt - 3))}...`;
  return suffixLabel ? `${truncated} (${suffixLabel})` : truncated;
}

function createDisplayFieldId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `display-field-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
