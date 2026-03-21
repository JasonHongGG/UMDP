import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRightLeft, GitBranch, Link2 } from 'lucide-react';
import { useExpressionDrag } from '../../core/studio/drag/ExpressionDragContext';
import {
  createLiteralExpressionSource,
  getExpressionSourceDisplayValue,
  readExpressionDragData,
} from '../../core/studio/expression';
import { useStudioQuery } from '../../core/studio/StudioContext';
import type { INodeEditProps } from '../../core/studio/types';
import type { ExpressionSource, IfNodeQueryState, NodeQueryIssue } from '../../domain/studio/contracts';
import { createDefaultIfRightLiteralSource, formatIfValuePreview, getDefaultIfOperator, IF_OPERATOR_LABELS } from './ifNodePredicate';
import type { IfNodeData } from './ifNodeModel';

function issueTone(severity: NodeQueryIssue['severity']) {
  switch (severity) {
    case 'error':
      return 'border-red-500/30 bg-red-500/10 text-red-100';
    case 'warning':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
    default:
      return 'border-slate-700 bg-slate-900/70 text-slate-300';
  }
}

function toLiteralValueType(kind: IfNodeQueryState['leftPreview']['scalarKind']): 'string' | 'number' | 'boolean' | 'address' {
  switch (kind) {
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'number';
    case 'address':
      return 'address';
    case 'string':
    case 'unsupported':
    default:
      return 'string';
  }
}

function ExpressionOperandDropZone({
  label,
  value,
  placeholder,
  helper,
  onAccept,
}: {
  label: string;
  value: ExpressionSource | null;
  placeholder: string;
  helper?: React.ReactNode;
  onAccept: (source: ExpressionSource) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCustomDragOver, setIsCustomDragOver] = useState(false);
  const { activeExpressionDrag, endExpressionDrag } = useExpressionDrag();

  const acceptSource = (source: ExpressionSource | null) => {
    if (!source || source.kind !== 'input-expression') {
      return;
    }

    onAccept(source);
  };

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div
        className={`rounded-xl border border-dashed px-3 py-3 transition-colors ${(isDragOver || isCustomDragOver) ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-slate-700 bg-slate-950/80'}`}
        onMouseEnter={() => {
          if (activeExpressionDrag) {
            setIsCustomDragOver(true);
          }
        }}
        onMouseLeave={() => setIsCustomDragOver(false)}
        onMouseUpCapture={(event) => {
          if (!activeExpressionDrag) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          setIsCustomDragOver(false);
          acceptSource(activeExpressionDrag.source);
          endExpressionDrag();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setIsDragOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragOver(false);
          setIsCustomDragOver(false);
          acceptSource(readExpressionDragData(event.dataTransfer));
        }}
      >
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Link2 size={14} className="text-cyan-300" />
          <span>{value ? getExpressionSourceDisplayValue(value) : placeholder}</span>
        </div>
      </div>
      {helper ? <div className="text-xs text-slate-500">{helper}</div> : null}
    </div>
  );
}

function QueryIssues({ issues }: { issues: NodeQueryIssue[] }) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {issues.map((issue) => (
        <div key={`${issue.code}-${issue.message}`} className={`rounded-xl border p-3 text-xs ${issueTone(issue.severity)}`}>
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{issue.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export const IfNodeEditor: React.FC<INodeEditProps<IfNodeData>> = ({ nodeId, data, updateData }) => {
  const query = useStudioQuery();
  const queryState = useMemo<IfNodeQueryState>(() => query.getNodeQueryState<IfNodeQueryState>(nodeId) ?? {
    kind: 'incomplete',
    leftPreview: {
      mode: 'expression',
      source: data.leftSource,
      displayText: data.leftSource ? getExpressionSourceDisplayValue(data.leftSource) : null,
      value: null,
      scalarKind: 'unsupported',
      resolved: false,
    },
    rightPreview: {
      mode: data.rightMode,
      source: data.rightSource,
      displayText: data.rightSource ? getExpressionSourceDisplayValue(data.rightSource) : null,
      value: null,
      scalarKind: 'unsupported',
      resolved: false,
    },
    availableOperators: [],
    operatorCompatible: false,
    predictedResult: null,
    summary: null,
    issues: [],
  }, [data.leftSource, data.rightMode, data.rightSource, nodeId, query]);

  useEffect(() => {
    if (queryState.availableOperators.length === 0 || queryState.operatorCompatible) {
      return;
    }

    const nextOperator = getDefaultIfOperator(queryState.leftPreview.scalarKind);
    if (nextOperator !== data.operator) {
      updateData({ operator: nextOperator });
    }
  }, [data.operator, queryState.availableOperators.length, queryState.leftPreview.scalarKind, queryState.operatorCompatible, updateData]);

  const setLeftSource = (source: ExpressionSource) => {
    if (source.kind !== 'input-expression') {
      return;
    }

    updateData({ leftSource: source });
  };

  const setRightMode = (rightMode: IfNodeData['rightMode']) => {
    if (rightMode === 'expression') {
      updateData({
        rightMode,
        rightSource: data.rightSource?.kind === 'input-expression' ? data.rightSource : null,
      });
      return;
    }

    updateData({
      rightMode,
      rightSource: data.rightSource?.kind === 'literal'
        ? data.rightSource
        : createDefaultIfRightLiteralSource(queryState.leftPreview.scalarKind),
    });
  };

  const setRightExpression = (source: ExpressionSource) => {
    if (source.kind !== 'input-expression') {
      return;
    }

    updateData({
      rightMode: 'expression',
      rightSource: source,
    });
  };

  const setRightLiteral = (raw: string) => {
    updateData({
      rightMode: 'literal',
      rightSource: createLiteralExpressionSource(raw, toLiteralValueType(queryState.leftPreview.scalarKind)),
    });
  };

  const rightLiteralRaw = data.rightSource?.kind === 'literal' ? data.rightSource.raw : '';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <GitBranch size={16} className="text-cyan-300" />
          <span>Condition</span>
        </div>

        <ExpressionOperandDropZone
          label="Left Operand"
          value={data.leftSource}
          placeholder="Drop an input expression here"
          helper={
            <span>
              Current: <span className="text-slate-300">{formatIfValuePreview(queryState.leftPreview.value)}</span>
              {' '}| Type: <span className="text-slate-300">{queryState.leftPreview.scalarKind}</span>
            </span>
          }
          onAccept={setLeftSource}
        />

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Operator</div>
          <select
            value={data.operator}
            onChange={(event) => updateData({ operator: event.target.value as IfNodeData['operator'] })}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-500"
          >
            {queryState.availableOperators.length > 0 ? queryState.availableOperators.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            )) : (
              <option value={data.operator}>{IF_OPERATOR_LABELS[data.operator]}</option>
            )}
          </select>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Right Operand</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRightMode('literal')}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${data.rightMode === 'literal' ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200' : 'border-slate-700 bg-slate-950 text-slate-300'}`}
            >
              Literal
            </button>
            <button
              type="button"
              onClick={() => setRightMode('expression')}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${data.rightMode === 'expression' ? 'border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200' : 'border-slate-700 bg-slate-950 text-slate-300'}`}
            >
              <ArrowRightLeft size={12} /> Expression
            </button>
          </div>
        </div>

        {data.rightMode === 'literal' ? (
          <div className="space-y-2">
            <div className="text-xs text-slate-500">
              Current: <span className="text-slate-300">{formatIfValuePreview(queryState.rightPreview.value)}</span>
            </div>
            {queryState.leftPreview.scalarKind === 'boolean' ? (
              <select
                value={rightLiteralRaw || 'false'}
                onChange={(event) => setRightLiteral(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-500"
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            ) : (
              <input
                type={queryState.leftPreview.scalarKind === 'number' ? 'number' : 'text'}
                value={rightLiteralRaw}
                onChange={(event) => setRightLiteral(event.target.value)}
                placeholder={queryState.leftPreview.scalarKind === 'address' ? '0x1234' : 'Enter comparison value'}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
              />
            )}
          </div>
        ) : (
          <ExpressionOperandDropZone
            label="Right Expression"
            value={data.rightSource?.kind === 'input-expression' ? data.rightSource : null}
            placeholder="Drop an input expression here"
            helper={
              <span>
                Current: <span className="text-slate-300">{formatIfValuePreview(queryState.rightPreview.value)}</span>
                {' '}| Type: <span className="text-slate-300">{queryState.rightPreview.scalarKind}</span>
              </span>
            }
            onAccept={setRightExpression}
          />
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 space-y-2 text-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Preview</div>
        <div className="text-slate-200">{queryState.summary ?? 'Condition incomplete'}</div>
        <div className="text-xs text-slate-500">
          Predicted Result: <span className={queryState.predictedResult === true ? 'text-emerald-300' : queryState.predictedResult === false ? 'text-amber-300' : 'text-slate-300'}>{queryState.predictedResult === null ? 'Pending' : queryState.predictedResult ? 'TRUE' : 'FALSE'}</span>
        </div>
      </div>

      <QueryIssues issues={queryState.issues} />
    </div>
  );
};

export default IfNodeEditor;