import type { BaseNodeData, StudioNodeRuntimeState } from '../../core/studio/types';

export interface WaitNodeData extends BaseNodeData {
  delaySeconds: number;
}

export const WAIT_NODE_DEFAULT_DELAY_SECONDS = 1;

export function createWaitNodeData(): WaitNodeData {
  return {
    delaySeconds: WAIT_NODE_DEFAULT_DELAY_SECONDS,
  };
}

export function clampWaitDelaySeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return WAIT_NODE_DEFAULT_DELAY_SECONDS;
  }

  return Math.max(0, value);
}

export function hydrateWaitNodeData(baseData: BaseNodeData, instance: import('../../domain/studio/contracts').NodeInstance): WaitNodeData {
  const delaySeconds = instance.parameters?.delaySeconds;

  return {
    ...baseData,
    nodeName: instance.displayName,
    delaySeconds: clampWaitDelaySeconds(delaySeconds),
  };
}

export function createWaitNodeRuntimeState(data: WaitNodeData): StudioNodeRuntimeState {
  return {
    displayName: data.nodeName?.trim() || undefined,
    parameters: {
      delaySeconds: clampWaitDelaySeconds(data.delaySeconds),
    },
    bindings: {},
    documentState: {},
  };
}

export function formatWaitCountdownLabel(remainingMs: number): string {
  const remainingSeconds = Math.max(0, remainingMs) / 1000;
  const digits = remainingSeconds >= 10 ? 0 : 1;

  return `${remainingSeconds.toFixed(digits)}s`;
}

export function getWaitSubtitle(delaySeconds: number): string {
  const normalizedDelay = clampWaitDelaySeconds(delaySeconds);
  return `${normalizedDelay.toFixed(normalizedDelay >= 10 ? 0 : 1)}s Delay`;
}