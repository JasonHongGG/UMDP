import React from 'react';
import { GitBranch } from 'lucide-react';
import { createFlowPort, createJsonPort, GENERIC_JSON_SCHEMA } from '../../core/studio/contracts';
import { defineStudioNode } from '../../core/studio/NodeRegistry';
import { materializeNodeQuerySnapshot } from '../../core/studio/graphInterpreter';
import { resolveExpressionSource, getExpressionSourceDisplayValue } from '../../core/studio/expression';
import { useStudioRuntime } from '../../core/studio/StudioContext';
import type { INodeComponentProps, INodeDefinition, IPort } from '../../core/studio/types';
import { Port } from '../../components/studio/canvas/Port';
import type {
  IfNodeQueryState,
  NodeExecutionContext,
  NodeQueryIssue,
} from '../../domain/studio/contracts';
import {
  parseIfNodeDocumentState,
  type ExpressionSource,
  type IfNodeDocumentState,
  type IfOperator,
} from '../../domain/studio/contracts';
import type { StudioNodeQueryContext } from '../../core/studio/queryTypes';
import IfNodeEditor from './IfNodeEditor';
import {
  classifyIfScalarKind,
  coerceComparablePair,
  evaluateIfPredicate,
  formatIfValuePreview,
  getAllowedIfOperators,
  getDefaultIfOperator,
  IF_OPERATOR_LABELS,
  isIfOperatorAllowed,
  parseLiteralForIfKind,
} from './ifNodePredicate';
import {
  createIfNodeData,
  createIfNodeRuntimeState,
  parseIfNodeDataFromDocumentState,
  toIfNodeDocumentState,
  type IfNodeData,
} from './ifNodeModel';

const IF_INPUTS: IPort[] = [
  createFlowPort('flow-in', 'Flow In', 'Control input for runtime execution.', { direction: 'input', required: false }),
  createJsonPort('value-in', 'Value In', GENERIC_JSON_SCHEMA, 'Incoming payloads used as condition sources.', {
    direction: 'input',
    required: true,
    cardinality: 'multiple',
  }),
];

const IF_OUTPUTS: IPort[] = [
  createFlowPort('true-out', 'True', 'Runs when the predicate resolves to true.', { cardinality: 'multiple' }),
  createFlowPort('false-out', 'False', 'Runs when the predicate resolves to false.', { cardinality: 'multiple' }),
];

function createIssue(code: string, message: string, severity: NodeQueryIssue['severity'] = 'warning'): NodeQueryIssue {
  return { severity, code, message, targetPortId: 'value-in' };
}

function createExpressionSnapshotMap(source: ExpressionSource, context: StudioNodeQueryContext) {
  if (source.kind !== 'input-expression' || !source.sourceNodeId) {
    return context.nodeSnapshots;
  }

  const snapshot = materializeNodeQuerySnapshot(source.sourceNodeId, context, new Set<string>());
  if (!snapshot) {
    return context.nodeSnapshots;
  }

  return {
    ...context.nodeSnapshots,
    [source.sourceNodeId]: snapshot,
  };
}

function resolveOperandValue(source: ExpressionSource | null, context: StudioNodeQueryContext) {
  if (!source) {
    return undefined;
  }

  return resolveExpressionSource(source, {
    snapshots: createExpressionSnapshotMap(source, context),
    resolveStaticFieldAddress: context.runtimeData.classCatalog.resolveStaticFieldAddress,
  });
}

function buildPredicateSummary(leftLabel: string | null, operator: IfOperator, rightLabel: string | null) {
  if (!leftLabel || !rightLabel) {
    return null;
  }

  return `${leftLabel} ${IF_OPERATOR_LABELS[operator] ?? operator} ${rightLabel}`;
}

function buildIfNodeQueryState(
  node: import('../../core/studio/types').StudioNode<IfNodeData>,
  context: StudioNodeQueryContext,
): IfNodeQueryState {
  const state = parseIfNodeDocumentState(toIfNodeDocumentState(node.data));
  const issues: NodeQueryIssue[] = [];

  const leftValue = resolveOperandValue(state.leftSource, context);
  const leftScalar = classifyIfScalarKind(state.leftSource, leftValue);
  const leftScalarKind = leftScalar.kind;
  const availableOperators = getAllowedIfOperators(leftScalarKind).map((operator) => ({
    value: operator,
    label: IF_OPERATOR_LABELS[operator],
  }));

  if (!state.leftSource) {
    issues.push(createIssue('if.left.missing', 'Bind a left-side input expression before configuring the condition.', 'info'));
  } else if (state.leftSource.kind !== 'input-expression') {
    issues.push(createIssue('if.left.invalid-kind', 'The left operand must come from an input expression.'));
  }

  if (state.leftSource && leftScalarKind === 'unsupported') {
    issues.push(createIssue('if.left.unsupported', 'The left operand resolves to an unsupported value type.'));
  }

  const rightMode = state.rightMode;
  const rightValue = rightMode === 'expression'
    ? resolveOperandValue(state.rightSource, context)
    : undefined;
  const rightScalar = rightMode === 'expression'
    ? classifyIfScalarKind(state.rightSource, rightValue)
    : leftScalar;
  const rightScalarKind = rightMode === 'expression' ? rightScalar.kind : leftScalarKind;

  if (!state.rightSource) {
    issues.push(createIssue('if.right.missing', rightMode === 'expression'
      ? 'Bind a right-side input expression.'
      : 'Provide a literal comparison value.', 'info'));
  } else if (rightMode === 'expression' && state.rightSource.kind !== 'input-expression') {
    issues.push(createIssue('if.right.invalid-kind', 'Expression mode requires the right operand to come from an input expression.'));
  } else if (rightMode === 'literal' && state.rightSource.kind !== 'literal') {
    issues.push(createIssue('if.right.invalid-literal', 'Literal mode requires a literal comparison value.'));
  }

  let predictedResult: boolean | null = null;
  if (state.leftSource && state.rightSource && leftScalarKind !== 'unsupported' && isIfOperatorAllowed(leftScalarKind, state.operator)) {
    const resolvedRightValue = rightMode === 'literal' && state.rightSource.kind === 'literal'
      ? parseLiteralForIfKind(leftScalarKind, state.rightSource.raw)
      : { valid: rightScalarKind !== 'unsupported', value: rightValue, error: rightScalarKind === 'unsupported' ? 'Unsupported right operand type.' : undefined };

    if (!resolvedRightValue.valid) {
      issues.push(createIssue('if.right.parse-failed', resolvedRightValue.error ?? 'The right operand could not be resolved.'));
    } else {
      const comparable = coerceComparablePair(leftScalarKind, leftValue, resolvedRightValue.value);
      if (!comparable.valid) {
        issues.push(createIssue('if.operands.incompatible', comparable.error ?? 'The operands are not comparable.'));
      } else {
        predictedResult = evaluateIfPredicate(leftScalarKind, comparable.left, state.operator, comparable.right);
      }
    }
  }

  if (state.leftSource && !isIfOperatorAllowed(leftScalarKind, state.operator)) {
    issues.push(createIssue('if.operator.invalid', 'The selected operator is not valid for the current left operand type.'));
  }

  const summary = buildPredicateSummary(
    state.leftSource ? getExpressionSourceDisplayValue(state.leftSource) : null,
    state.operator,
    state.rightSource ? getExpressionSourceDisplayValue(state.rightSource) : null,
  );

  return {
    kind: issues.some((issue) => issue.severity === 'error' || issue.code.includes('invalid') || issue.code.includes('unsupported') || issue.code.includes('parse-failed') || issue.code.includes('incompatible'))
      ? 'invalid'
      : predictedResult === null ? 'incomplete' : 'resolved',
    leftPreview: {
      mode: 'expression',
      source: state.leftSource,
      displayText: state.leftSource ? getExpressionSourceDisplayValue(state.leftSource) : null,
      value: leftValue,
      scalarKind: leftScalarKind,
      resolved: leftValue !== undefined,
    },
    rightPreview: {
      mode: rightMode,
      source: state.rightSource,
      displayText: state.rightSource ? getExpressionSourceDisplayValue(state.rightSource) : null,
      value: rightMode === 'literal' && state.rightSource?.kind === 'literal'
        ? parseLiteralForIfKind(leftScalarKind, state.rightSource.raw).value
        : rightValue,
      scalarKind: rightScalarKind,
      resolved: rightMode === 'literal'
        ? Boolean(state.rightSource && state.rightSource.kind === 'literal')
        : rightValue !== undefined,
    },
    availableOperators,
    operatorCompatible: isIfOperatorAllowed(leftScalarKind, state.operator),
    predictedResult,
    summary,
    issues,
  };
}

function createValidationIssue(code: string, message: string, target = 'value-in') {
  return {
    severity: 'error' as const,
    code,
    message,
    target,
  };
}

function validateIfNode(context: NodeExecutionContext) {
  const state = parseIfNodeDocumentState(context.documentState);
  const issues = [] as ReturnType<typeof createValidationIssue>[];

  if (!state.leftSource || state.leftSource.kind !== 'input-expression') {
    issues.push(createValidationIssue('if.left.invalid', 'If node requires a left input expression.'));
    return issues;
  }

  const leftValue = context.resolvedBindings.leftSource;
  const leftScalarKind = classifyIfScalarKind(state.leftSource, leftValue).kind;
  if (leftScalarKind === 'unsupported') {
    issues.push(createValidationIssue('if.left.unsupported', 'Left operand resolves to an unsupported value type.'));
  }

  if (!isIfOperatorAllowed(leftScalarKind, state.operator)) {
    issues.push(createValidationIssue('if.operator.invalid', 'Selected operator is not valid for the left operand type.'));
  }

  if (!state.rightSource) {
    issues.push(createValidationIssue('if.right.missing', 'If node requires a right operand.'));
    return issues;
  }

  if (state.rightMode === 'expression' && state.rightSource.kind !== 'input-expression') {
    issues.push(createValidationIssue('if.right.invalid-expression', 'Expression mode requires the right operand to come from an input expression.'));
  }

  if (state.rightMode === 'literal' && state.rightSource.kind !== 'literal') {
    issues.push(createValidationIssue('if.right.invalid-literal', 'Literal mode requires the right operand to be a literal.'));
  }

  if (issues.length > 0 || leftScalarKind === 'unsupported') {
    return issues;
  }

  const rightValue: { valid: boolean; value: unknown; error?: string } = state.rightMode === 'literal' && state.rightSource.kind === 'literal'
    ? parseLiteralForIfKind(leftScalarKind, state.rightSource.raw)
    : { valid: true, value: context.resolvedBindings.rightSource };

  if (!rightValue.valid) {
    issues.push(createValidationIssue('if.right.parse-failed', rightValue.error ?? 'Right operand literal is invalid.'));
    return issues;
  }

  const comparable = coerceComparablePair(leftScalarKind, leftValue, rightValue.value);
  if (!comparable.valid) {
    issues.push(createValidationIssue('if.operands.incompatible', comparable.error ?? 'Operands are not comparable.'));
  }

  return issues;
}

function executeIfNode(context: NodeExecutionContext) {
  const validationIssues = validateIfNode(context);
  if (validationIssues.length > 0) {
    return {
      state: 'error' as const,
      outputs: {},
      issues: validationIssues,
    };
  }

  const state = parseIfNodeDocumentState(context.documentState);
  const leftValue = context.resolvedBindings.leftSource;
  const leftScalarKind = classifyIfScalarKind(state.leftSource, leftValue).kind;
  const rightValue = state.rightMode === 'literal' && state.rightSource?.kind === 'literal'
    ? parseLiteralForIfKind(leftScalarKind, state.rightSource.raw).value
    : context.resolvedBindings.rightSource;
  const predicateResult = evaluateIfPredicate(leftScalarKind, leftValue, state.operator, rightValue);

  return {
    state: 'success' as const,
    outputs: {},
    nextControlPorts: [predicateResult ? 'true-out' : 'false-out'],
  };
}

const IfNodeCanvas: React.FC<INodeComponentProps<IfNodeData>> = ({ id, data, inputs, outputs }) => {
  const { nodeStates, nodeSnapshots } = useStudioRuntime();
  const nodeState = nodeStates[id] ?? 'idle';
  const snapshot = nodeSnapshots[id] ?? null;
  const resultBadge = snapshot?.status === 'success'
    ? snapshot.nextControlPorts?.includes('true-out') ? 'TRUE' : 'FALSE'
    : snapshot?.status === 'aborted' ? 'ABORTED'
    : snapshot?.status === 'error' ? 'ERROR' : null;

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

        <div className="w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-105 transition-transform duration-300 bg-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
          <GitBranch size={20} />
        </div>
      </div>

      <div className="absolute top-full mt-2 text-center pointer-events-none w-max flex flex-col items-center z-20">
        <span className="text-xs text-white font-medium tracking-wide">
          {data.nodeName?.trim() || 'If'}
        </span>
        {resultBadge ? (
          <span className={`mt-0.5 rounded-full border px-2 py-0.5 text-[9px] font-semibold tracking-wider ${resultBadge === 'TRUE' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : resultBadge === 'FALSE' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : resultBadge === 'ABORTED' ? 'border-amber-400/30 bg-amber-500/10 text-amber-200' : 'border-red-500/30 bg-red-500/10 text-red-200'}`}>
            {resultBadge}
          </span>
        ) : (
          <span className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wider">Control Branch</span>
        )}
      </div>
    </div>
  );
};

const IfNodeDefinition: INodeDefinition<IfNodeData> = {
  manifest: {
    type: 'if',
    typeVersion: 1,
    family: 'control',
    displayName: 'If',
    description: 'Evaluates a predicate and routes control flow to the true or false branch.',
    category: 'Control',
    tags: ['flow', 'branch', 'condition'],
    inputs: IF_INPUTS.map((port) => ({
      key: port.id,
      displayName: port.label,
      direction: 'input',
      channel: port.channel,
      cardinality: port.cardinality,
      dataType: port.dataType,
      required: port.required,
    })),
    outputs: IF_OUTPUTS.map((port) => ({
      key: port.id,
      displayName: port.label,
      direction: 'output',
      channel: port.channel,
      cardinality: port.cardinality,
      dataType: port.dataType,
      required: port.required,
    })),
    parameters: [],
    preview: {
      mode: 'degraded',
      description: 'If nodes can preview predicted branch resolution when operands are materializable.',
    },
  },
  icon: GitBranch,
  createInitialData: createIfNodeData,
  hydrateData: (instance, baseData) => parseIfNodeDataFromDocumentState(baseData, instance),
  dehydrateData: (data) => ({
    displayName: data.nodeName?.trim() || undefined,
    parameters: {},
    bindings: {},
    documentState: toIfNodeDocumentState(data) as unknown as Record<string, unknown>,
  }),
  createRuntimeState: (node) => createIfNodeRuntimeState(node.data),
  buildQueryState: buildIfNodeQueryState,
  executionContract: {
    validate: validateIfNode,
    execute: executeIfNode,
  },
  CanvasComponent: IfNodeCanvas,
  EditComponent: IfNodeEditor,
};

export const IfNodeDef = defineStudioNode(IfNodeDefinition);

export default IfNodeDef;