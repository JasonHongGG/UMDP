import React, { useEffect, useMemo } from 'react';
import { AlertCircle, Box } from 'lucide-react';
import { Port } from '../../components/studio/canvas/Port';
import { useStudioGraph, useStudioRuntime } from '../../core/studio/StudioContext';
import { useStudioRuntimeData } from '../../core/studio/runtimeData';
import type { INodeComponentProps, IPort } from '../../core/studio/types';
import { hasExpressionSourceValue } from '../../core/studio/expression';
import { reconcileClassInfoSelection } from '../../domain/studio/editor';
import type { ClassNodeData } from './classNodeModel';
import { createEmptyCatalog, hasResolvedExecutionValue } from './classNodeModel';

export const ClassNodeCanvas: React.FC<INodeComponentProps<ClassNodeData>> = ({ id, data, inputs, outputs }) => {
  const { edges } = useStudioGraph();
  const { nodeStates } = useStudioRuntime();
  const runtimeData = useStudioRuntimeData();

  useEffect(() => {
    if (!data.binding) {
      return;
    }

    runtimeData.classCatalog.ensureOverlayLoaded(data.binding.classStableId);
  }, [data.binding, runtimeData]);

  const resolvedCatalog = useMemo(
    () => runtimeData.classCatalog.getByBinding(data.binding) ?? createEmptyCatalog(),
    [data.binding, runtimeData],
  );
  const resolvedSelection = useMemo(
    () => reconcileClassInfoSelection(data.infoSelection, resolvedCatalog),
    [data.infoSelection, resolvedCatalog],
  );

  const hasInputConnection = edges.some((edge) => edge.channel === 'data' && edge.targetNodeId === id && edge.targetPortId === 'instance-in');
  const hasInstanceSource = hasExpressionSourceValue(data.instanceSource);

  const isErrorState = !hasInputConnection && !hasInstanceSource;
  const executionState = nodeStates?.[id] || 'idle';
  const hasSelection = hasResolvedExecutionValue([
    ...resolvedSelection.members,
    ...resolvedSelection.statics,
    ...resolvedSelection.functions,
  ]);

  return (
    <div className="relative flex flex-col items-center group">
      <div className={`bg-[#1e293b]/95 backdrop-blur-md rounded-2xl border w-16 h-16 shadow-lg flex items-center justify-center relative z-10 transition-colors cursor-grab active:cursor-grabbing 
        ${isErrorState ? 'border-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.2)]' :
          executionState === 'running' ? 'border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.5)] scale-110' :
          executionState === 'success' ? 'border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]' :
          'border-slate-700 hover:border-cyan-500/60'}
      `}>
        {isErrorState ? (
          <span title="Missing Instance Address" className="absolute -top-1.5 -right-1.5 z-30 bg-[#0f172a] rounded-full border border-red-900/50">
            <AlertCircle size={14} className="text-red-400 animate-pulse" />
          </span>
        ) : null}

        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center gap-2 -translate-x-[calc(50%+1px)] z-20">
          {inputs.map((port) => <Port key={port.id} nodeId={id} port={port} type="target" />)}
        </div>

        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-evenly py-1 gap-1 translate-x-[calc(50%+1px)] z-20">
          {outputs.map((port: IPort) => <Port key={port.id} nodeId={id} port={port} type="source" />)}
        </div>

        <div className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-105 transition-transform duration-300 ${isErrorState ? 'bg-red-500/10 text-red-400' : 'bg-cyan-500/20 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]'}`}>
          <Box size={20} />
        </div>

        {hasSelection ? (
          <span className="absolute -bottom-1 -right-1 rounded-full border border-cyan-400/40 bg-cyan-500/20 px-1.5 py-0.5 text-[8px] font-bold tracking-wider text-cyan-100">
            INFO
          </span>
        ) : null}
      </div>

      <div className="absolute top-full mt-2 text-center pointer-events-none w-max flex flex-col items-center z-20">
        <span className="text-xs text-white font-medium tracking-wide">
          {data.nodeName?.trim() || data.binding?.name || 'Select Class...'}
        </span>
        <span className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wider">Class Ref</span>
      </div>
    </div>
  );
};