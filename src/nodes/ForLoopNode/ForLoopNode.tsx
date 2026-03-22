import React from 'react';
import { Repeat } from 'lucide-react';
import { createEnvelope, createFlowPort, createJsonPort, GENERIC_JSON_SCHEMA } from '../../core/studio/contracts';
import { defineStudioNode } from '../../core/studio/NodeRegistry';
import { materializeNodeQuerySnapshot } from '../../core/studio/graphInterpreter';
import { resolveExpressionSource } from '../../core/studio/expression';
import { useStudioRuntime } from '../../core/studio/StudioContext';
import type { StudioNodeLifecycleContext } from '../../core/studio/nodeCapabilities';
import type { INodeComponentProps, INodeDefinition, IPort } from '../../core/studio/types';
import { Port } from '../../components/studio/canvas/Port';
import type { NodeExecutionContext, NodeExecutionOutputMap, ValidationIssue } from '../../domain/studio/contracts';
import { parseForLoopNodeDocumentState } from '../../domain/studio/contracts';
import type { StudioNodeQueryContext } from '../../core/studio/queryTypes';
import {
  areForLoopCountSourcesEqual,
  buildForLoopIterationPayload,
  createForLoopCountInputExpressionSource,
  createForLoopNodeData,
  createForLoopNodeRuntimeState,
  FOR_LOOP_COUNT_INPUT_PORT_ID,
  getForLoopSubtitle,
  getResolvedForLoopCountInput,
  isForLoopCountInputExpressionSource,
  parseForLoopExecutionState,
  parseForLoopNodeDataFromDocumentState,
  parseLoopCountValue,
  resolveLoopCountCandidate,
  type ForLoopNodeData,
} from './forLoopNodeModel';
import ForLoopNodeEditor from './ForLoopNodeEditor';

const FOR_LOOP_INPUTS: IPort[] = [
  createFlowPort('flow-in', 'Flow In', 'Enter the loop or re-enter from the loop body.', { direction: 'input', required: false, cardinality: 'multiple' }),
  createJsonPort(FOR_LOOP_COUNT_INPUT_PORT_ID, 'Loop Cnt', GENERIC_JSON_SCHEMA, 'Numeric loop count input. When connected it auto-synchronizes the panel expression source.', { direction: 'input' }),
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

function getForLoopResolvedCountCandidate(source: ForLoopNodeData['countSource'], context: {
  snapshots?: Record<string, import('../../core/studio/types').NodeExecutionSnapshot>;
  resolvedBinding?: unknown;
  resolvedInput?: unknown;
}) {
  return resolveLoopCountCandidate(source, {
    snapshots: context.snapshots,
    resolvedBinding: context.resolvedBinding,
    resolvedInput: context.resolvedInput,
  });
}

function getForLoopCountInputEdge(
  nodeId: string,
  edges: StudioNodeLifecycleContext['edges'] | StudioNodeQueryContext['edges'],
) {
  return edges.find(
    (edge) => edge.channel === 'data' && edge.targetNodeId === nodeId && edge.targetPortId === FOR_LOOP_COUNT_INPUT_PORT_ID,
  ) ?? null;
}

function resolveForLoopSynchronizedSource(
  node: import('../../core/studio/types').StudioNode<ForLoopNodeData>,
  context: Pick<StudioNodeLifecycleContext | StudioNodeQueryContext, 'nodes' | 'edges'>,
) {
  const countInputEdge = getForLoopCountInputEdge(node.id, context.edges);
  if (!countInputEdge) {
    return null;
  }

  const sourceNode = context.nodes.find((candidate) => candidate.id === countInputEdge.sourceNodeId);
  return createForLoopCountInputExpressionSource(
    countInputEdge.sourceNodeId,
    countInputEdge.sourcePortId,
    sourceNode?.data.nodeName,
  );
}

function reconcileForLoopNodeData(
  node: import('../../core/studio/types').StudioNode<ForLoopNodeData>,
  context: StudioNodeLifecycleContext,
): Partial<ForLoopNodeData> | null {
  const synchronizedSource = resolveForLoopSynchronizedSource(node, context);

  if (synchronizedSource) {
    return areForLoopCountSourcesEqual(node.data.countSource, synchronizedSource)
      ? null
      : { countSource: synchronizedSource };
  }

  if (isForLoopCountInputExpressionSource(node.data.countSource)) {
    return { countSource: null };
  }

  return null;
}

function resolveCountForQuery(node: import('../../core/studio/types').StudioNode<ForLoopNodeData>, context: StudioNodeQueryContext) {
  const source = resolveForLoopSynchronizedSource(node, context) ?? node.data.countSource;
  const countInputEdge = getForLoopCountInputEdge(node.id, context.edges);
  if (!source) {
    return null;
  }

  if (source.kind === 'literal') {
    const parsed = parseLoopCountValue(getForLoopResolvedCountCandidate(source, {}));
    return parsed.valid ? parsed.value : null;
  }

  if (source.kind !== 'input-expression' || !source.sourceNodeId) {
    return null;
  }

  const snapshot = materializeNodeQuerySnapshot(source.sourceNodeId, context, new Set<string>());
  const resolved = snapshot
    ? countInputEdge && source.bindingSlot === FOR_LOOP_COUNT_INPUT_PORT_ID
      ? snapshot.outputs[countInputEdge.sourcePortId]?.payload
      : resolveExpressionSource(source, {
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
  const resolvedCountInput = getResolvedForLoopCountInput(context);
  const hasCountInputBinding = (context.inputBindings[FOR_LOOP_COUNT_INPUT_PORT_ID]?.length ?? 0) > 0;

  if (!state.countSource && !hasCountInputBinding && resolvedCountInput === undefined) {
    issues.push(createIssue('for-loop.count.missing', 'For Loop node requires a loop count literal or an inbound Loop Cnt value.'));
    return issues;
  }

  const candidate = getForLoopResolvedCountCandidate(state.countSource, {
    resolvedBinding: context.resolvedBindings.countSource,
    resolvedInput: resolvedCountInput,
  });
  const parsed = parseLoopCountValue(candidate, {
    allowUndefined: resolvedCountInput === undefined && state.countSource?.kind !== 'literal',
  });
  if (!parsed.valid) {
    const sourceLabel = hasCountInputBinding ? 'Loop Cnt input' : 'loop count';
    const message = parsed.reason === 'missing'
      ? `${sourceLabel} could not be resolved.`
      : parsed.reason === 'not-a-number'
        ? `${sourceLabel} must resolve to a finite number.`
        : parsed.reason === 'not-an-integer'
          ? `${sourceLabel} must be an integer.`
          : `${sourceLabel} must be zero or greater.`;
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
  const candidate = getForLoopResolvedCountCandidate(state.countSource, {
    resolvedBinding: context.resolvedBindings.countSource,
    resolvedInput: getResolvedForLoopCountInput(context),
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
      <div className={`bg-[#1e293b]/95 backdrop-blur-md rounded-2xl border w-16 h-16 shadow-lg flex items-center justify-center relative z-10 transition-colors cursor-grab active:cursor-grabbing
        ${nodeState === 'running' ? 'border-cyan-400 shadow-[0_0_22px_rgba(34,211,238,0.28)] scale-110' :
          nodeState === 'success' ? 'border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]' :
          nodeState === 'error' ? 'border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.18)]' :
          'border-slate-700 hover:border-cyan-500/60'}
      `}>
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center gap-2 -translate-x-[calc(50%+1px)] z-20">
          {inputs.map((port: IPort) => <Port key={port.id} nodeId={id} port={port} type="target" />)}
        </div>
        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center gap-2 translate-x-[calc(50%+1px)] z-20">
          {outputs.map((port: IPort) => <Port key={port.id} nodeId={id} port={port} type="source" />)}
        </div>

        {nodeState === 'running' && iterationPayload ? (
          <div className="flex h-10 w-10 flex-col items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/12 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.16)] transition-transform duration-300 group-hover:scale-105">
            <span className="text-[11px] font-semibold leading-none tracking-wide">{Number(iterationPayload.index ?? 0) + 1}</span>
            <span className="mt-0.5 text-[7px] font-bold uppercase tracking-[0.22em] text-cyan-200/80">Loop</span>
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-105 transition-transform duration-300 bg-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
            <Repeat size={20} />
          </div>
        )}
      </div>

      <div className="absolute top-full mt-2 text-center pointer-events-none w-max flex flex-col items-center z-20">
        <span className="text-xs text-white font-medium tracking-wide">
          {data.nodeName?.trim() || 'For Loop'}
        </span>
        <span className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wider">{getForLoopSubtitle(data)}</span>
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
    preview: {
      mode: 'degraded',
      description: 'Loop previews expose iteration intent, while actual loop progression happens during execution.',
    },
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
        helperText: 'Literal integer or dragged input expression. A connected Loop Cnt input automatically syncs this binding. Loop body must reconnect to Flow In to continue the next iteration.',
      },
    }],
  },
  icon: Repeat,
  createInitialData: createForLoopNodeData,
  hydrateData: (instance, baseData) => parseForLoopNodeDataFromDocumentState(baseData, instance),
  dehydrateData: (data) => createForLoopNodeRuntimeState(data),
  createRuntimeState: (node) => createForLoopNodeRuntimeState(node.data),
  resolveDisplayName: (data) => data.nodeName?.trim() || undefined,
  reconcileData: reconcileForLoopNodeData,
  buildQueryOutputs: buildForLoopQueryOutputs,
  executionContract: {
    validate: validateForLoopNode,
    execute: executeForLoopNode,
  },
  CanvasComponent: ForLoopNodeCanvas,
  EditComponent: ForLoopNodeEditor,
};

export const ForLoopNodeDef = defineStudioNode(ForLoopNodeDefinition);

export default ForLoopNodeDef;