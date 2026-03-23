import React from 'react';
import { Play } from 'lucide-react';
import { useStudioRuntimeViewState } from '../../application/studio/useStudioRuntimeViewState';
import {
  INodeComponentProps,
  INodeEditProps,
  BaseNodeData,
  IPort,
  StudioNodeDefinition,
  StudioNodeExecutionDefinition,
  StudioNodePresentationDefinition,
  StudioNodeSerializationDefinition,
} from '../../core/studio/types';
import { createFlowPort } from '../../core/studio/contracts';
import { defineStudioNode } from '../../core/studio/NodeRegistry';
import { Port } from '../../components/studio/canvas/Port';
import { parseTriggerNodeDocumentState, type TriggerNodeDocumentState } from '../../domain/studio/contracts';

interface TriggerNodeData extends BaseNodeData {}

const TriggerNodeCanvas: React.FC<INodeComponentProps<TriggerNodeData>> = ({ id, data, inputs, outputs }) => {
  const { nodeStates, executeFlow, canExecuteFlow, executionBlockedReason } = useStudioRuntimeViewState();
  const executionState = nodeStates?.[id] || 'idle';
  const triggerTitle = canExecuteFlow
    ? 'Run workflow'
    : executionBlockedReason ?? 'Workspace is not ready for execution.';

  return (
    <div className="relative flex flex-col items-center group">
      {/* Node Body (Draggable) */}
      <div className={`bg-[#1e293b]/95 backdrop-blur-md rounded-2xl border w-16 h-16 shadow-lg flex items-center justify-center relative z-10 transition-colors cursor-grab active:cursor-grabbing
        ${executionState === 'running' ? 'border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.5)] scale-110' :
          executionState === 'success' ? 'border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]' :
          'border-slate-700 hover:border-emerald-500/60'}
      `}>
        
        {/* Input Ports Container */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center gap-2 -translate-x-[calc(50%+1px)] z-20">
           {inputs.map((port: IPort) => <Port key={port.id} nodeId={id} port={port} type="target" />)}
        </div>

        {/* Output Ports Container */}
        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center gap-2 translate-x-[calc(50%+1px)] z-20">
          {outputs.map((port: IPort) => <Port key={port.id} nodeId={id} port={port} type="source" />)}
        </div>

        {/* Icon (Play Button) */}
        <div 
            data-studio-no-drag="true"
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300 shadow-[0_0_10px_rgba(16,185,129,0.2)] ${canExecuteFlow
              ? 'cursor-pointer group-hover:scale-105 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 hover:text-white'
              : 'cursor-not-allowed bg-amber-500/15 text-amber-300'}
            `}
            onClick={(e) => { e.stopPropagation(); executeFlow(id); }}
            title={triggerTitle}
            aria-disabled={!canExecuteFlow}
        >
          <Play size={20} className={`ml-1 ${executionState === 'running' ? 'animate-pulse' : ''}`} fill="currentColor" />
        </div>
      </div>

      {/* Node Label (Below) */}
      <div className="absolute top-full mt-2 text-center pointer-events-none w-max">
        <span className="text-xs text-white font-medium tracking-wide">
          {data.nodeName?.trim() || 'Trigger'}
        </span>
      </div>
    </div>
  );
};

const TriggerNodeEditorHelp: React.FC<INodeEditProps<TriggerNodeData>> = () => {
  return (
    <div className="text-center py-10">
      <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
        <Play size={32} className="text-emerald-400 ml-1" />
      </div>
      <h3 className="text-lg font-medium text-slate-200 mb-2">Manual Trigger</h3>
      <p className="text-sm text-slate-400 max-w-xs mx-auto">
        Click the play button on this node physically on the canvas to start the execution flow.
      </p>
    </div>
  );
};

const TriggerNodePresentation: StudioNodePresentationDefinition<TriggerNodeData> = {
  icon: Play,
  CanvasComponent: TriggerNodeCanvas,
  EditFooterComponent: TriggerNodeEditorHelp,
};

const TriggerNodeSerialization: StudioNodeSerializationDefinition<TriggerNodeData> = {
  createInitialData: () => ({}),
  hydrateData: (instance, baseData) => ({
    ...baseData,
    nodeName: instance.displayName,
    ...parseTriggerNodeDocumentState(instance.documentState),
  }),
  dehydrateData: (data) => ({
    displayName: data.nodeName?.trim() || undefined,
    parameters: {},
    bindings: {},
    documentState: { mode: 'manual' } satisfies TriggerNodeDocumentState,
  }),
  createRuntimeState: () => ({ parameters: {}, bindings: {}, documentState: { mode: 'manual' } satisfies TriggerNodeDocumentState }),
};

const TriggerNodeExecution: StudioNodeExecutionDefinition = {
  executionContract: {
    validate: () => [],
    execute: () => ({ state: 'success', outputs: {} }),
  },
};

const TriggerNodeDefinition: StudioNodeDefinition<TriggerNodeData> = {
  manifest: {
    type: 'trigger',
    typeVersion: 1,
    family: 'control',
    displayName: 'Trigger',
    description: 'Starts the execution of a workflow.',
    category: 'Control',
    tags: ['flow', 'start', 'manual'],
    inputs: [],
    outputs: [{ key: 'flow-out', displayName: 'Flow Out', direction: 'output', channel: 'control', cardinality: 'multiple' }],
    parameters: [],
    preview: {
      mode: 'execute-only',
      description: 'Trigger nodes only participate during live execution.',
    },
    isTrigger: true,
  },
  ...TriggerNodePresentation,
  ...TriggerNodeSerialization,
  ...TriggerNodeExecution,
};

export const TriggerNodeDef = defineStudioNode(TriggerNodeDefinition);

export default TriggerNodeDef;
