import React from 'react';
import { Repeat } from 'lucide-react';
import { createEnvelope, createFlowPort, createJsonPort, GENERIC_JSON_SCHEMA } from '../../core/studio/contracts';
import { defineStudioNode } from '../../core/studio/NodeRegistry';
import { materializeNodeQuerySnapshot } from '../../core/studio/graphInterpreter';
import { resolveExpressionSource } from '../../core/studio/expression';
import { useStudioRuntime } from '../../core/studio/StudioContext';
import type { INodeComponentProps, INodeDefinition, IPort } from '../../core/studio/types';
import { Port } from '../../components/studio/canvas/Port';
import type { NodeExecutionContext, NodeExecutionOutputMap, ValidationIssue } from '../../domain/studio/contracts';
import { parseForLoopNodeDocumentState } from '../../domain/studio/contracts';
import type { StudioNodeQueryContext } from '../../core/studio/queryTypes';
import {
  buildForLoopIterationPayload,
  createForLoopNodeData,
  createForLoopNodeRuntimeState,
  getForLoopSubtitle,
  parseForLoopExecutionState,
  parseForLoopNodeDataFromDocumentState,
  parseLoopCountValue,
  resolveLoopCountCandidate,
  type ForLoopNodeData,
} from './forLoopNodeModel';

const FOR_LOOP_INPUTS: IPort[] = [
  createFlowPort('flow-in', 'Flow In', 'Enter the loop or re-enter from the loop body.', { direction: 'input', required: false }),
];

const FOR_LOOP_OUTPUTS: IPort[] = [
  createFlowPort('loop-out', 'Loop', 'Routes to the loop body for the current iteration.', { cardinality: 'multiple' }),
  createFlowPort('done-out', 'Done', 'Routes after the loop body has completed all iterations.', { cardinality: 'multiple' }),
  createJsonPort('iteration-out', 'Iteration', GENERIC_JSON_SCHEMA, 'Current iteration payload for downstream expressions.', { cardinality: 'multiple' }),
];

function createIssue(code: string, message: string, severity: ValidationIssue['severity'] = 'error'): ValidationIssue {
  return {
    severity,
    code,
    message,
    target: 'countSource',
  };
}

function resolveCountForQuery(node: import('../../core/studio/types').StudioNode<ForLoopNodeData>, context: StudioNodeQueryContext) {
  const source = node.data.countSource;
  if (!source) {
    return null;
  }

  if (source.kind === 'literal') {
    const parsed = parseLoopCountValue(resolveLoopCountCandidate(source, {}));
    return parsed.valid ? parsed.value : null;
  }

  if (source.kind !== 'input-expression' || !source.sourceNodeId) {
    return null;
  }

  const snapshot = materializeNodeQuerySnapshot(source.sourceNodeId, context, new Set<string>());
  const resolved = snapshot
    ? resolveExpressionSource(source, {
      snapshots: {
        ...context.nodeSnapshots,
        [snapshot.nodeId]: snapshot,
      },
      resolveStaticFieldAddress: context.runtimeData.classCatalog.resolveStaticFieldAddress,
    })
    : undefined;
  const parsed = parseLoopCountValue(resolved, { allowUndefined: true });
  return parsed.valid ? parsed.value : null;
}

function validateForLoopNode(context: NodeExecutionContext) {
  const issues: ValidationIssue[] = [];
  const state = parseForLoopNodeDocumentState(context.documentState);

  if (!state.countSource) {
    issues.push(createIssue('for-loop.count.missing', 'For Loop node requires a loop count literal or input expression.'));
    return issues;
  }

  const candidate = resolveLoopCountCandidate(state.countSource, {
    resolvedBinding: context.resolvedBindings.countSource,
  });
  const parsed = parseLoopCountValue(candidate, { allowUndefined: state.countSource.kind !== 'literal' });
  if (!parsed.valid) {
    const message = parsed.reason === 'missing'
      ? 'Loop count could not be resolved.'
      : parsed.reason === 'not-a-number'
        ? 'Loop count must resolve to a finite number.'
        : parsed.reason === 'not-an-integer'
          ? 'Loop count must be an integer.'
          : 'Loop count must be zero or greater.';
    issues.push(createIssue(`for-loop.count.${parsed.reason}`, message));
  }

  return issues;
}

function executeForLoopNode(context: NodeExecutionContext) {
  const issues = validateForLoopNode(context);
  if (issues.length > 0) {
    return {
      state: 'error' as const,
      outputs: {},
      issues,
    };
  }

  const state = parseForLoopNodeDocumentState(context.documentState);
  const candidate = resolveLoopCountCandidate(state.countSource, {
    resolvedBinding: context.resolvedBindings.countSource,
  });
  const parsedCount = parseLoopCountValue(candidate);

  if (!parsedCount.valid) {
    return {
      state: 'error' as const,
      outputs: {},
      issues: [createIssue('for-loop.count.invalid', 'Loop count is invalid.')],
    };
  }

  const totalCount = parsedCount.value;
  if (totalCount === 0) {
    return {
      state: 'success' as const,
      outputs: {},
      nextControlPorts: ['done-out'],
      nextRuntimeState: {},
    };
  }

  const runtimeState = parseForLoopExecutionState(context.runtimeState);
  const hasPriorIteration = runtimeState.totalCount === totalCount && typeof runtimeState.currentIndex === 'number';
  const currentIndex = hasPriorIteration ? runtimeState.currentIndex! + 1 : 0;

  if (currentIndex >= totalCount) {
    return {
      state: 'success' as const,
      outputs: {},
      nextControlPorts: ['done-out'],
      nextRuntimeState: {},
    };
  }

  const iterationPayload = buildForLoopIterationPayload(currentIndex, totalCount);

  return {
    state: 'success' as const,
    outputs: {
      'iteration-out': createEnvelope(GENERIC_JSON_SCHEMA, iterationPayload, { source: 'for-loop-node' }),
    },
    nextControlPorts: ['loop-out'],
    nextRuntimeState: {
      currentIndex,
      totalCount,
    },
  };
}

function buildForLoopQueryOutputs(
  node: import('../../core/studio/types').StudioNode<ForLoopNodeData>,
  context: StudioNodeQueryContext,
): NodeExecutionOutputMap {
  const totalCount = resolveCountForQuery(node, context);

  return {
    'iteration-out': createEnvelope(GENERIC_JSON_SCHEMA, {
      index: 0,
      totalCount,
      isFirstIteration: true,
      isLastIteration: totalCount === 1,
    }, {
      source: 'for-loop-node',
      mode: 'query',
    }),
  };
}

const ForLoopNodeCanvas: React.FC<INodeComponentProps<ForLoopNodeData>> = ({ id, data, inputs, outputs }) => {
  const { nodeStates, nodeSnapshots } = useStudioRuntime();
  const nodeState = nodeStates[id] ?? 'idle';
  const snapshot = nodeSnapshots[id] ?? null;
  const iterationPayload = snapshot?.outputs?.['iteration-out']?.payload as { index?: number; totalCount?: number } | undefined;

  return (
    <div className="relative flex flex-col items-center group">
      <div className={`relative z-10 flex min-h-[94px] w-44 flex-col rounded-2xl border bg-slate-900/95 px-4 py-3 shadow-lg backdrop-blur-md transition-colors
        ${nodeState === 'running' ? 'border-cyan-400 shadow-[0_0_24px_rgba(34,211,238,0.28)]' : nodeState === 'success' ? 'border-emerald-500/50' : nodeState === 'error' ? 'border-red-500/50' : 'border-slate-700 hover:border-cyan-500/50'}`}
      >
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center gap-2 -translate-x-[calc(50%+1px)] z-20">
          {inputs.map((port: IPort) => <Port key={port.id} nodeId={id} port={port} type="target" />)}
        </div>
        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center gap-2 translate-x-[calc(50%+1px)] z-20">
          {outputs.map((port: IPort) => <Port key={port.id} nodeId={id} port={port} type="source" />)}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
            <Repeat size={16} />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">{data.nodeName?.trim() || 'For Loop'}</div>
            <div className="text-[11px] text-slate-500">{getForLoopSubtitle(data)}</div>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-300">
          {iterationPayload
            ? `Iteration ${Number(iterationPayload.index ?? 0) + 1} / ${iterationPayload.totalCount ?? '?'}`
            : 'Routes through loop and done control paths.'}
        </div>
      </div>
    </div>
  );
};

const ForLoopNodeDefinition: INodeDefinition<ForLoopNodeData> = {
  manifest: {
    type: 'for-loop',
    typeVersion: 1,
    family: 'control',
    displayName: 'For Loop',
    description: 'Runs a loop body a fixed number of times and then continues through the done path.',
    category: 'Control',
    tags: ['loop', 'control', 'iteration'],
    inputs: FOR_LOOP_INPUTS.map((port) => ({
      key: port.id,
      displayName: port.label,
      direction: 'input',
      channel: port.channel,
      cardinality: port.cardinality,
      dataType: port.dataType,
      required: port.required,
    })),
    outputs: FOR_LOOP_OUTPUTS.map((port) => ({
      key: port.id,
      displayName: port.label,
      direction: 'output',
      channel: port.channel,
      cardinality: port.cardinality,
      dataType: port.dataType,
      required: port.required,
    })),
    parameters: [{
      name: 'countSource',
      displayName: 'Loop Count',
      valueType: 'number',
      expressionSupport: 'optional',
      required: true,
      defaultValue: '1',
      ui: {
        section: 'Loop',
        placeholder: '1',
        helperText: 'Literal integer or dragged input expression. Loop body must reconnect to Flow In to continue the next iteration.',
      },
    }],
  },
  icon: Repeat,
  createInitialData: createForLoopNodeData,
  hydrateData: (instance, baseData) => parseForLoopNodeDataFromDocumentState(baseData, instance),
  dehydrateData: (data) => createForLoopNodeRuntimeState(data),
  createRuntimeState: (node) => createForLoopNodeRuntimeState(node.data),
  resolveDisplayName: (data) => data.nodeName?.trim() || undefined,
  buildQueryOutputs: buildForLoopQueryOutputs,
  executionContract: {
    validate: validateForLoopNode,
    execute: executeForLoopNode,
  },
  CanvasComponent: ForLoopNodeCanvas,
};

export const ForLoopNodeDef = defineStudioNode(ForLoopNodeDefinition);

export default ForLoopNodeDef;