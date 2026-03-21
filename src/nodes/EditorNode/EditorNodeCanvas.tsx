import React, { useMemo } from 'react';
import { AlertCircle, PencilLine } from 'lucide-react';
import { Port } from '../../components/studio/canvas/Port';
import { useStudioQuery, useStudioRuntime } from '../../core/studio/StudioContext';
import type { INodeComponentProps, IPort } from '../../core/studio/types';
import type { EditorNodeQueryState } from '../../domain/studio/contracts';
import type { EditorNodeData } from './editorNodeModel';

export const EditorNodeCanvas: React.FC<INodeComponentProps<EditorNodeData>> = ({ id, data, inputs, outputs }) => {
  const query = useStudioQuery();
  const { nodeStates } = useStudioRuntime();
  const queryState = useMemo(
    () => query.getNodeQueryState<EditorNodeQueryState>(id) ?? {
      kind: 'missing-edge' as const,
      payload: null,
      availableTargets: [],
      targets: [],
      summary: { totalTargets: data.targets.length, writableTargets: 0, invalidTargets: data.targets.length },
      issues: [],
    },
    [data.targets.length, id, query],
  );
  const executionState = nodeStates[id] ?? 'idle';
  const hasIssues = queryState.kind !== 'resolved' || queryState.summary.invalidTargets > 0;

  return (
    <div className="relative flex flex-col items-center group">
      <div className={`bg-[#1e293b]/95 backdrop-blur-md rounded-2xl border w-16 h-16 shadow-lg flex items-center justify-center relative z-10 transition-colors cursor-grab active:cursor-grabbing ${
        hasIssues
          ? 'border-amber-500/70 shadow-[0_0_18px_rgba(245,158,11,0.2)]'
          : executionState === 'running'
            ? 'border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.45)] scale-110'
            : executionState === 'success'
              ? 'border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
              : 'border-slate-700 hover:border-cyan-500/60'
      }`}>
        {hasIssues ? (
          <span className="absolute -top-1.5 -right-1.5 z-30 bg-[#0f172a] rounded-full border border-amber-900/50" title="Editor node has unresolved targets or missing input data">
            <AlertCircle size={14} className="text-amber-400" />
          </span>
        ) : null}

        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center gap-2 -translate-x-[calc(50%+1px)] z-20">
          {inputs.map((port) => <Port key={port.id} nodeId={id} port={port} type="target" />)}
        </div>

        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-evenly py-1 gap-1 translate-x-[calc(50%+1px)] z-20">
          {outputs.map((port: IPort) => <Port key={port.id} nodeId={id} port={port} type="source" />)}
        </div>

        <div className="w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-105 transition-transform duration-300 bg-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
          <PencilLine size={20} />
        </div>

        {queryState.summary.writableTargets > 0 ? (
          <span className="absolute -bottom-1 -right-1 rounded-full border border-cyan-400/40 bg-cyan-500/20 px-1.5 py-0.5 text-[8px] font-bold tracking-wider text-cyan-100">
            {queryState.summary.writableTargets}
          </span>
        ) : null}
      </div>

      <div className="absolute top-full mt-2 text-center pointer-events-none w-max flex flex-col items-center z-20">
        <span className="text-xs text-white font-medium tracking-wide">{data.nodeName?.trim() || 'Editor'}</span>
        <span className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wider">
          {queryState.summary.totalTargets} Target{queryState.summary.totalTargets === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
};