import React, { useMemo } from 'react';
import { Clock3 } from 'lucide-react';
import { createFlowPort } from '../../core/studio/contracts';
import { defineStudioNode } from '../../core/studio/NodeRegistry';
import { useStudioRuntime } from '../../core/studio/StudioContext';
import type { INodeComponentProps, INodeDefinition, IPort } from '../../core/studio/types';
import { Port } from '../../components/studio/canvas/Port';
import { formatWaitCountdownLabel, createWaitNodeData, createWaitNodeRuntimeState, clampWaitDelaySeconds, getWaitSubtitle, type WaitNodeData } from './waitNodeModel';

const WAIT_INPUTS: IPort[] = [
  createFlowPort('flow-in', 'Flow In', 'Control input for runtime execution.', { direction: 'input', required: false }),
];

const WAIT_OUTPUTS: IPort[] = [
  createFlowPort('flow-out', 'Flow Out', 'Continues workflow execution after the wait period ends.', { cardinality: 'multiple' }),
];

function createAbortError() {
  try {
    return new DOMException('Execution cancelled.', 'AbortError');
  } catch {
    const error = new Error('Execution cancelled.');
    error.name = 'AbortError';
    return error;
  }
}

function waitForDelay(
  delayMs: number,
  abortSignal: AbortSignal | null,
  reportProgress: (progress: { kind: string; label?: string; totalMs?: number; remainingMs?: number; displayText?: string } | null) => void,
) {
  if (delayMs <= 0) {
    reportProgress(null);
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const tickMs = Math.min(250, Math.max(100, Math.round(delayMs / 20)));
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      abortSignal?.removeEventListener('abort', handleAbort);
    };

    const handleAbort = () => {
      cleanup();
      reportProgress(null);
      reject(createAbortError());
    };

    const tick = () => {
      if (abortSignal?.aborted) {
        handleAbort();
        return;
      }

      const elapsedMs = Date.now() - startedAt;
      const remainingMs = Math.max(0, delayMs - elapsedMs);
      reportProgress({
        kind: 'countdown',
        label: 'Waiting',
        totalMs: delayMs,
        remainingMs,
        displayText: formatWaitCountdownLabel(remainingMs),
      });

      if (remainingMs <= 0) {
        cleanup();
        reportProgress(null);
        resolve();
        return;
      }

      timer = setTimeout(tick, Math.min(tickMs, remainingMs));
    };

    abortSignal?.addEventListener('abort', handleAbort, { once: true });
    tick();
  });
}

function createValidationIssue(code: string, message: string) {
  return {
    severity: 'error' as const,
    code,
    message,
    target: 'delaySeconds',
  };
}

const WaitNodeCanvas: React.FC<INodeComponentProps<WaitNodeData>> = ({ id, data, inputs, outputs }) => {
  const { nodeStates, nodeSnapshots } = useStudioRuntime();
  const executionState = nodeStates[id] ?? 'idle';
  const snapshot = nodeSnapshots[id] ?? null;
  const countdownText = useMemo(() => {
    const progress = snapshot?.progress;
    if (executionState !== 'running') {
      return null;
    }

    return progress?.displayText ?? (typeof progress?.remainingMs === 'number' ? formatWaitCountdownLabel(progress.remainingMs) : 'WAIT');
  }, [executionState, snapshot]);

  return (
    <div className="relative flex flex-col items-center group">
      <div className={`bg-[#1e293b]/95 backdrop-blur-md rounded-2xl border w-16 h-16 shadow-lg flex items-center justify-center relative z-10 transition-colors cursor-grab active:cursor-grabbing
        ${executionState === 'running' ? 'border-cyan-400 shadow-[0_0_22px_rgba(34,211,238,0.28)] scale-110' :
          executionState === 'success' ? 'border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]' :
          executionState === 'error' ? 'border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.18)]' :
          'border-slate-700 hover:border-cyan-500/60'}
      `}>
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center gap-2 -translate-x-[calc(50%+1px)] z-20">
          {inputs.map((port: IPort) => <Port key={port.id} nodeId={id} port={port} type="target" />)}
        </div>

        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center gap-2 translate-x-[calc(50%+1px)] z-20">
          {outputs.map((port: IPort) => <Port key={port.id} nodeId={id} port={port} type="source" />)}
        </div>

        {executionState === 'running' ? (
          <div className="flex h-10 w-10 flex-col items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/12 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.16)] transition-transform duration-300 group-hover:scale-105">
            <span className="text-[11px] font-semibold leading-none tracking-wide">{countdownText}</span>
            <span className="mt-0.5 text-[7px] font-bold uppercase tracking-[0.22em] text-cyan-200/80">Wait</span>
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-105 transition-transform duration-300 bg-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
            <Clock3 size={20} />
          </div>
        )}
      </div>

      <div className="absolute top-full mt-2 text-center pointer-events-none w-max flex flex-col items-center z-20">
        <span className="text-xs text-white font-medium tracking-wide">
          {data.nodeName?.trim() || 'Wait'}
        </span>
        <span className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wider">{executionState === 'running' ? 'Timing' : getWaitSubtitle(data.delaySeconds)}</span>
      </div>
    </div>
  );
};

const WaitNodeDefinition: INodeDefinition<WaitNodeData> = {
  manifest: {
    type: 'wait',
    typeVersion: 1,
    family: 'control',
    displayName: 'Wait',
    description: 'Pause workflow execution for a fixed number of seconds before continuing.',
    category: 'Control',
    tags: ['wait', 'delay', 'timing', 'flow'],
    inputs: WAIT_INPUTS.map((port) => ({
      key: port.id,
      displayName: port.label,
      direction: 'input',
      channel: port.channel,
      cardinality: port.cardinality,
      dataType: port.dataType,
      required: port.required,
    })),
    outputs: WAIT_OUTPUTS.map((port) => ({
      key: port.id,
      displayName: port.label,
      direction: 'output',
      channel: port.channel,
      cardinality: port.cardinality,
      dataType: port.dataType,
      required: port.required,
    })),
    parameters: [{
      name: 'delaySeconds',
      displayName: 'Delay Seconds',
      valueType: 'number',
      expressionSupport: 'disabled',
      required: true,
      defaultValue: 1,
      ui: {
        section: 'Timing',
        placeholder: '1',
        helperText: 'Pause the workflow for this many seconds before continuing. Decimals are supported.',
      },
    }],
  },
  icon: Clock3,
  createInitialData: createWaitNodeData,
  resolveDisplayName: (data) => data.nodeName?.trim() || undefined,
  hydrateData: (instance, baseData) => ({
    ...baseData,
    nodeName: instance.displayName,
    delaySeconds: clampWaitDelaySeconds(instance.parameters?.delaySeconds),
  }),
  dehydrateData: (data) => ({
    displayName: data.nodeName?.trim() || undefined,
    parameters: {
      delaySeconds: clampWaitDelaySeconds(data.delaySeconds),
    },
    bindings: {},
    documentState: {},
  }),
  createRuntimeState: (node) => createWaitNodeRuntimeState(node.data),
  executionContract: {
    validate: ({ parameters }) => {
      const delaySeconds = parameters.delaySeconds;
      if (typeof delaySeconds !== 'number' || !Number.isFinite(delaySeconds)) {
        return [createValidationIssue('wait.delay.invalid', 'Wait node requires a finite delay value in seconds.')];
      }

      if (delaySeconds < 0) {
        return [createValidationIssue('wait.delay.negative', 'Wait node delay must be zero or greater.')];
      }

      return [];
    },
    execute: async ({ parameters, abortSignal, reportProgress }) => {
      const delaySeconds = clampWaitDelaySeconds(parameters.delaySeconds);
      const delayMs = Math.round(delaySeconds * 1000);
      await waitForDelay(delayMs, abortSignal, reportProgress);

      return {
        state: 'success' as const,
        outputs: {},
      };
    },
  },
  CanvasComponent: WaitNodeCanvas,
};

export const WaitNodeDef = defineStudioNode(WaitNodeDefinition);

export default WaitNodeDef;