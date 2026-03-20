import React from 'react';
import { Code2 } from 'lucide-react';
import { Port } from '../../components/studio/canvas/Port';
import type { INodeComponentProps } from '../../core/studio/types';
import type { CallFunctionNodeData } from './callFunctionNodeModel';

export const CallFunctionNodeCanvas: React.FC<INodeComponentProps<CallFunctionNodeData>> = ({ id, data, inputs, outputs }) => {
  const title = data.nodeName?.trim() || 'Call Function';
  const subtitle = data.selectedMethodStableId ? 'Method selected' : 'Select method';

  return (
    <div className="relative flex flex-col items-center group">
      <div className="bg-[#1e293b]/95 backdrop-blur-md rounded-2xl border border-slate-700 hover:border-cyan-500/60 w-16 h-16 shadow-lg flex items-center justify-center relative z-10 transition-colors cursor-grab active:cursor-grabbing">
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center gap-2 -translate-x-[calc(50%+1px)] z-20">
          {inputs.map((port) => <Port key={port.id} nodeId={id} port={port} type="target" />)}
        </div>

        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-evenly py-1 gap-1 translate-x-[calc(50%+1px)] z-20">
          {outputs.map((port) => <Port key={port.id} nodeId={id} port={port} type="source" />)}
        </div>

        <div className="w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-105 transition-transform duration-300 bg-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
          <Code2 size={20} />
        </div>
      </div>

      <div className="absolute top-full mt-2 text-center pointer-events-none w-max flex flex-col items-center z-20">
        <span className="text-xs text-white font-medium tracking-wide">{title}</span>
        <span className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wider">{subtitle}</span>
      </div>
    </div>
  );
};