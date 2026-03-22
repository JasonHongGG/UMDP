import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, GitBranch, Link2, Activity, Zap, Variable, Hash, FileCode2, Command } from 'lucide-react';
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
import { Select } from '../../components/common/Select';

function issueTone(severity: NodeQueryIssue['severity']) {
  switch (severity) {
    case 'error':
      return 'border-red-500/30 bg-red-500/10 text-red-200 outline-red-500/20';
    case 'warning':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-200 outline-amber-500/20';
    default:
      return 'border-blue-500/30 bg-blue-500/10 text-blue-200 outline-blue-500/20';
  }
}

function issueIconColor(severity: NodeQueryIssue['severity']) {
  switch (severity) {
    case 'error':
      return 'text-red-400';
    case 'warning':
      return 'text-amber-400';
    default:
      return 'text-blue-400';
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
  activeColor = 'cyan',
}: {
  label: string;
  value: ExpressionSource | null;
  placeholder: string;
  helper?: React.ReactNode;
  onAccept: (source: ExpressionSource | null) => void;
  activeColor?: 'cyan' | 'fuchsia';
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCustomDragOver, setIsCustomDragOver] = useState(false);
  const { activeExpressionDrag, endExpressionDrag } = useExpressionDrag();

  const isHighlighted = isDragOver || isCustomDragOver;

  const acceptSource = (source: ExpressionSource | null) => {
    if (!source) {
      onAccept(null);
      return;
    }
    if (source.kind !== 'input-expression') {
      return;
    }
    onAccept(source);
  };

  const gradients = {
    cyan: 'from-cyan-500/20 to-blue-500/20',
    fuchsia: 'from-fuchsia-500/20 to-purple-500/20',
  };
  const borderColors = {
    cyan: 'rgba(34, 211, 238, 0.5)',
    fuchsia: 'rgba(217, 70, 239, 0.5)',
  };
  const iconBg = {
    cyan: 'bg-cyan-500/10 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]',
    fuchsia: 'bg-fuchsia-500/10 text-fuchsia-400 shadow-[0_0_15px_rgba(217,70,239,0.2)]',
  };

  return (
    <div className="space-y-2 relative">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500/80">{label}</span>
      </div>

      <motion.div
        layout
        animate={{
          scale: isHighlighted ? 1.02 : 1,
          borderColor: isHighlighted ? borderColors[activeColor] : 'rgba(51, 65, 85, 0.4)',
          backgroundColor: isHighlighted ? `var(--tw-colors-${activeColor}-950/20)` : 'rgba(15, 23, 42, 0.4)',
        }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="relative rounded-2xl border-2 border-dashed overflow-hidden flex flex-col justify-center min-h-[56px] transition-colors duration-300"
        onMouseEnter={() => {
          if (activeExpressionDrag) setIsCustomDragOver(true);
        }}
        onMouseLeave={() => setIsCustomDragOver(false)}
        onMouseUpCapture={(event) => {
          if (!activeExpressionDrag) return;
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
        <AnimatePresence>
          {isHighlighted && (
            <motion.div
              key="glow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`absolute inset-0 bg-gradient-to-r ${gradients[activeColor]} blur-2xl pointer-events-none`}
            />
          )}
        </AnimatePresence>

        <div className="relative z-10 px-4 py-2 flex items-center justify-between w-full h-full">
          <AnimatePresence mode="wait">
            {value ? (
              <motion.div
                key="value"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-3 w-full group cursor-pointer"
                onClick={() => onAccept(null)}
              >
                <div className={`p-2 rounded-xl flex items-center justify-center transition-all group-hover:scale-105 ${iconBg[activeColor]}`}>
                  <Link2 size={16} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <span className="text-sm font-semibold text-slate-200 truncate block transition-colors group-hover:text-white">
                    {getExpressionSourceDisplayValue(value)}
                  </span>
                </div>
                <div className="px-2 py-1 rounded bg-slate-800/50 text-[10px] text-slate-400 font-medium uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                  Click to Remove
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-center gap-2 text-slate-400/60 w-full pointer-events-none"
              >
                <div className="p-1.5 bg-slate-800/30 rounded-lg text-slate-500">
                  <Zap size={14} />
                </div>
                <span className="text-sm font-medium">{placeholder}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <AnimatePresence>
        {helper && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="text-xs text-slate-500 pt-1 px-1">
              {helper}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QueryIssues({ issues }: { issues: NodeQueryIssue[] }) {
  if (issues.length === 0) return null;

  return (
    <motion.div layout className="space-y-2 mt-4">
      <AnimatePresence>
        {issues.map((issue) => (
          <motion.div
            key={`${issue.code}-${issue.message}`}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`rounded-xl border p-3 text-xs outline outline-2 outline-offset-2 ${issueTone(issue.severity)} shadow-lg shadow-black/20`}
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle size={16} className={`mt-0.5 shrink-0 ${issueIconColor(issue.severity)}`} />
              <span className="font-medium leading-relaxed">{issue.message}</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

function SegmentedControl({
  value,
  onChange
}: {
  value: 'literal' | 'expression';
  onChange: (val: 'literal' | 'expression') => void
}) {
  const options = [
    { id: 'literal', label: 'Literal', icon: Hash },
    { id: 'expression', label: 'Expression', icon: Variable }
  ] as const;

  return (
    <div className="flex bg-slate-950/50 border border-slate-800/60 p-1 rounded-xl w-full relative shadow-inner">
      {options.map((option) => {
        const isActive = value === option.id;
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`relative flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-lg transition-colors z-10 ${isActive ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {isActive && (
              <motion.div
                layoutId="segmented-bg"
                className="absolute inset-0 bg-slate-800/80 rounded-lg shadow-sm border border-slate-700/50"
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon size={12} className={isActive ? 'text-cyan-400' : 'text-slate-500'} />
              {option.label}
            </span>
          </button>
        );
      })}
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

  const setLeftSource = (source: ExpressionSource | null) => {
    if (source && source.kind !== 'input-expression') return;
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

  const setRightExpression = (source: ExpressionSource | null) => {
    if (source && source.kind !== 'input-expression') return;
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
    <motion.div layout className="space-y-6">

      {/* Condition Editor Card */}
      <motion.div layout className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-5 shadow-2xl backdrop-blur-xl relative overflow-hidden group">
        {/* Decorative background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-cyan-500/20 transition-all duration-700" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-fuchsia-500/20 transition-all duration-700" />

        <motion.div layout className="space-y-4">

          <ExpressionOperandDropZone
            label="Left Operand"
            value={data.leftSource}
            placeholder="Drag left variable here..."
            activeColor="cyan"
            helper={
              <div className="flex items-center gap-2">
                <span className="opacity-70">Evaluates to:</span>
                <span className="font-mono text-cyan-300 bg-cyan-500/10 px-1.5 py-0.5 rounded text-[10px]">{formatIfValuePreview(queryState.leftPreview.value)}</span>
                <span className="opacity-40">|</span>
                <span className="opacity-70">Type:</span>
                <span className="font-mono text-slate-300">{queryState.leftPreview.scalarKind}</span>
              </div>
            }
            onAccept={setLeftSource}
          />

          <motion.div layout className="relative flex flex-col items-center py-2">
            <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent -translate-y-1/2" />
            <div className="relative z-10 flex flex-col items-center gap-1">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500/80 mb-0.5 bg-slate-900/60 px-2 rounded-full">Operator</span>
              <div className="w-48 bg-slate-900 border border-slate-700/80 rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.5)] focus-within:border-cyan-500/50 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all">
                <Select
                  value={data.operator}
                  onChange={(val) => updateData({ operator: val as IfNodeData['operator'] })}
                  options={queryState.availableOperators.length > 0 ? queryState.availableOperators : [{ value: data.operator, label: IF_OPERATOR_LABELS[data.operator] }]}
                  className="!border-none !bg-transparent text-center font-mono py-2 text-cyan-400 font-bold"
                />
              </div>
            </div>
          </motion.div>

          <motion.div layout className="space-y-3 p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500/80">Right Operand</span>
              <div className="w-[180px]">
                <SegmentedControl value={data.rightMode} onChange={setRightMode} />
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {data.rightMode === 'literal' ? (
                <motion.div
                  key="literal"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="space-y-2 pt-1 min-h-[70px]"
                >
                  {queryState.leftPreview.scalarKind === 'boolean' ? (
                    <div className="w-full bg-slate-900 border border-slate-700/80 rounded-xl focus-within:border-fuchsia-500/50 focus-within:ring-2 focus-within:ring-fuchsia-500/20 transition-all">
                      <Select
                        value={rightLiteralRaw || 'false'}
                        onChange={(val) => setRightLiteral(String(val))}
                        options={[
                          { value: 'false', label: 'False' },
                          { value: 'true', label: 'True' }
                        ]}
                        className="!border-none !bg-transparent text-fuchsia-300 font-mono"
                      />
                    </div>
                  ) : (
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <FileCode2 size={14} className="text-slate-500 group-focus-within:text-fuchsia-400 transition-colors" />
                      </div>
                      <input
                        type={queryState.leftPreview.scalarKind === 'number' ? 'number' : 'text'}
                        value={rightLiteralRaw}
                        onChange={(event) => setRightLiteral(event.target.value)}
                        placeholder={queryState.leftPreview.scalarKind === 'address' ? '0x...' : 'Enter value...'}
                        className="w-full rounded-xl border border-slate-700/80 bg-slate-900 pl-9 pr-3 py-2.5 text-sm font-mono text-fuchsia-300 outline-none placeholder:text-slate-600 focus:border-fuchsia-500/60 focus:ring-2 focus:ring-fuchsia-500/20 transition-all shadow-inner"
                      />
                    </div>
                  )}
                  <div className="text-[10px] text-slate-500 flex items-center gap-1.5 px-1">
                    <Activity size={10} /> Parsed as: <span className="font-mono text-slate-400">{formatIfValuePreview(queryState.rightPreview.value)}</span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="expression"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="pt-1 min-h-[70px]"
                >
                  <ExpressionOperandDropZone
                    label="Comparison Variable"
                    value={data.rightSource?.kind === 'input-expression' ? data.rightSource : null}
                    placeholder="Drag right variable here..."
                    activeColor="fuchsia"
                    helper={
                      <div className="flex items-center gap-2">
                        <span className="opacity-70">Evaluates to:</span>
                        <span className="font-mono text-fuchsia-300 bg-fuchsia-500/10 px-1.5 py-0.5 rounded text-[10px]">{formatIfValuePreview(queryState.rightPreview.value)}</span>
                        <span className="opacity-40">|</span>
                        <span className="opacity-70">Type:</span>
                        <span className="font-mono text-slate-300">{queryState.rightPreview.scalarKind}</span>
                      </div>
                    }
                    onAccept={setRightExpression}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Prediction / Preview Footer */}
      <motion.div layout className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-4 shadow-lg relative overflow-hidden flex flex-col gap-3">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-600/50 to-transparent" />

        <div className="flex items-center gap-2 text-slate-400">
          <Command size={14} className="opacity-70" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Live Preview</span>
        </div>

        <div className="flex flex-col gap-2 relative z-10">
          <div className="text-sm font-medium text-slate-200 bg-slate-950/50 rounded-lg p-2 border border-slate-800">
            {queryState.summary ? (
              <span className="font-mono text-cyan-100">{queryState.summary}</span>
            ) : (
              <span className="text-slate-500 italic">Expression incomplete...</span>
            )}
          </div>

          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-slate-500 font-medium">Predicted Result:</span>
            <motion.div
              layout
              animate={{
                scale: queryState.predictedResult !== null ? [1, 1.05, 1] : 1,
              }}
              transition={{ duration: 0.3 }}
              className={`font-bold px-3 py-1 rounded-full border ${queryState.predictedResult === true
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : queryState.predictedResult === false
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
            >
              {queryState.predictedResult === null ? 'Pending' : queryState.predictedResult ? 'TRUE' : 'FALSE'}
            </motion.div>
          </div>
        </div>
      </motion.div>

      <QueryIssues issues={queryState.issues} />
    </motion.div>
  );
};

export default IfNodeEditor;