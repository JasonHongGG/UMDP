import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Code2 } from 'lucide-react';
import { useStudioExpressionDragState } from '@/features/studio/application/useStudioExpressionDragState';
import { useStudioQueryViewState } from '@/features/studio/application/useStudioQueryViewState';
import {
  getExpressionSourceDisplayValue,
  readExpressionDragData,
  createLiteralExpressionSource,
} from '@/features/studio/core/expression';
import type { INodeEditProps } from '@/features/studio/core/types';
import type { StableId } from '@/domain/contracts/shared-identity';
import type { CallFunctionClassInfoQueryState, ClassInfoFunctionPayload, ExpressionSource } from '@/domain/studio/contracts';
import type { CallFunctionNodeData } from './callFunctionNodeModel';
import {
  findSelectedFunction,
  hasSameCallFunctionArguments,
  reconcileCallFunctionArguments,
} from './callFunctionNodeModel';
import { Select } from '@/shared/ui/Select';


function ArgumentInput({
  value,
  onChange,
}: {
  value: ExpressionSource;
  onChange: (nextValue: ExpressionSource) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const { activeExpressionDrag, endExpressionDrag } = useStudioExpressionDragState();

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${isDragOver ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-700 bg-slate-950'}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        const source = readExpressionDragData(event.dataTransfer);
        if (source) {
          onChange(source);
        }
      }}
      onMouseUpCapture={(event) => {
        if (!activeExpressionDrag) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onChange(activeExpressionDrag.source);
        endExpressionDrag();
      }}
    >
      <input
        type="text"
        value={getExpressionSourceDisplayValue(value)}
        placeholder="Literal or drag expression"
        onChange={(event) => onChange(createLiteralExpressionSource(event.target.value))}
        className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
      />
    </div>
  );
}

export const CallFunctionNodeEditor: React.FC<INodeEditProps<CallFunctionNodeData>> = ({ nodeId, data, updateData }) => {
  const query = useStudioQueryViewState();
  const classInfoState = useMemo(
    () => query.getNodeQueryState<CallFunctionClassInfoQueryState>(nodeId) ?? {
      kind: 'missing-edge' as const,
      payload: null,
      methods: [],
      issues: [],
    },
    [nodeId, query],
  );
  const classInfoPayload = classInfoState.kind === 'resolved' || classInfoState.kind === 'no-functions'
    ? classInfoState.payload
    : null;
  const availableMethods = classInfoState.kind === 'resolved' ? classInfoState.methods : [];
  const selectedMethod = findSelectedFunction(classInfoPayload, data.selectedMethodStableId);

  useEffect(() => {
    if (!selectedMethod) {
      if (data.arguments.length > 0 && data.selectedMethodStableId && !availableMethods.some((item: ClassInfoFunctionPayload) => item.runtimeRef.methodStableId === data.selectedMethodStableId)) {
        updateData({ selectedMethodStableId: null, arguments: [] });
      }
      return;
    }

    const reconciledArguments = reconcileCallFunctionArguments(nodeId, data.selectedMethodStableId, selectedMethod.parameters, data.arguments);
    if (!hasSameCallFunctionArguments(data.arguments, reconciledArguments)) {
      updateData({ arguments: reconciledArguments });
    }
  }, [availableMethods, data.arguments, data.selectedMethodStableId, nodeId, selectedMethod, updateData]);

  const instanceState = selectedMethod
    ? selectedMethod.isStatic
      ? 'Static method, no instance required.'
      : typeof classInfoPayload?.instanceAddress === 'string' && classInfoPayload.instanceAddress.length > 0
        ? `Instance: ${classInfoPayload.instanceAddress}`
        : 'Instance method, waiting for upstream instanceAddress.'
    : 'Select a method to configure invocation.';

  return (
    <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/30 p-4 text-slate-300">
      <div className="font-medium text-sm text-slate-200 px-1 border-b border-slate-700/50 pb-2 flex items-center gap-2">
        <Code2 size={16} className="text-cyan-300" />
        <span>Call Function</span>
      </div>

      {classInfoState.issues.length > 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">
          {classInfoState.issues[0]?.message}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Method</div>
        <Select
          value={data.selectedMethodStableId ?? ''}
          onChange={(val) => updateData({
            selectedMethodStableId: (val || null) as StableId | null,
          })}
          placeholder="Select method"
          options={availableMethods.map((method: ClassInfoFunctionPayload) => ({
            value: method.runtimeRef.methodStableId,
            label: `${method.name} :: ${method.signature}`
          }))}
        />
      </div>

      {selectedMethod ? (
        <div className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-3 space-y-2">
          <div className="text-sm font-semibold text-slate-100">{selectedMethod.signature}</div>
          <div className="text-xs text-slate-500">Return: {selectedMethod.returnType}</div>
          <div className={`text-xs flex items-center gap-2 ${selectedMethod.isStatic ? 'text-emerald-300' : typeof classInfoPayload?.instanceAddress === 'string' ? 'text-cyan-300' : 'text-amber-300'}`}>
            {selectedMethod.isStatic || typeof classInfoPayload?.instanceAddress === 'string'
              ? <CheckCircle2 size={14} />
              : <AlertCircle size={14} />}
            <span>{instanceState}</span>
          </div>
        </div>
      ) : null}

      {selectedMethod ? (
        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Arguments</div>
          {selectedMethod.parameters.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 p-3 text-sm text-slate-500">
              This method does not require any arguments.
            </div>
          ) : data.arguments.map((entry, index) => {
            const parameter = selectedMethod.parameters[index];
            if (!parameter) {
              return null;
            }

            return (
              <div key={entry.id} className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-100">{parameter.name || `arg${parameter.position + 1}`}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{parameter.typeName}</div>
                </div>
                <ArgumentInput
                  value={entry.source}
                  onChange={(nextValue) => updateData({
                    arguments: data.arguments.map((candidate) => candidate.id === entry.id ? { ...candidate, source: nextValue } : candidate),
                  })}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};