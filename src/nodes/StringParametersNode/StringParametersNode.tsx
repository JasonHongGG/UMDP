import React from 'react';
import { Type, Plus, Trash2 } from 'lucide-react';
import { BaseNodeData, INodeComponentProps, INodeDefinition, INodeEditProps, IPort, ParameterValueType } from '../../core/studio/types';
import { createJsonPort, createParameterDefinitionsEnvelope, PARAMETER_DEFINITIONS_SCHEMA } from '../../core/studio/contracts';
import { defineStudioNode } from '../../core/studio/NodeRegistry';
import { Port } from '../../components/studio/canvas/Port';

interface ParameterDefinitionEntry {
  id: string;
  type: ParameterValueType;
  value: string;
}

interface ParametersNodeData extends BaseNodeData {
  parameters: ParameterDefinitionEntry[];
}

const STRING_PARAMS_INPUTS: IPort[] = [];

const STRING_PARAMS_OUTPUTS: IPort[] = [
  createJsonPort('params-out', 'Params', PARAMETER_DEFINITIONS_SCHEMA, 'Parameter definitions for downstream node inputs.'),
];

function createParameterId() {
  return `param-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultParameter(): ParameterDefinitionEntry {
  return {
    id: createParameterId(),
    type: 'string',
    value: 'value',
  };
}

function createParametersNodeData(): ParametersNodeData {
  return {
    parameters: [createDefaultParameter()],
    inputs: STRING_PARAMS_INPUTS.map((port) => ({ ...port })),
    outputs: STRING_PARAMS_OUTPUTS.map((port) => ({ ...port })),
  };
}

function buildParameterPayload(parameters: ParameterDefinitionEntry[]) {
  return Object.fromEntries(
    parameters
      .map((entry, index) => [`param${index + 1}`, { type: entry.type, value: entry.value }] as const),
  );
}

const ParametersNodeCanvas: React.FC<INodeComponentProps<ParametersNodeData>> = ({ id, data }) => {
  const parameterCount = data.parameters.length;

  return (
    <div className="relative flex flex-col items-center group">
      <div className="bg-[#1e293b]/95 backdrop-blur-md rounded-2xl border border-slate-700 hover:border-amber-500/60 w-16 h-16 shadow-lg flex items-center justify-center relative z-10 transition-colors cursor-grab active:cursor-grabbing">
        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-evenly py-1 gap-1 translate-x-[calc(50%+1px)] z-20">
          {data.outputs.map((port: IPort) => <Port key={port.id} nodeId={id} port={port} type="source" />)}
        </div>

        <div className="w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-105 transition-transform duration-300 bg-amber-500/20 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
          <Type size={20} />
        </div>
      </div>

      <div className="absolute top-full mt-2 text-center pointer-events-none w-max flex flex-col items-center z-20">
        <span className="text-xs text-white font-medium tracking-wide">
          {data.nodeName?.trim() || 'Parameters'}
        </span>
        <span className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wider">{parameterCount} Definition{parameterCount === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
};

const ParametersNodeEdit: React.FC<INodeEditProps<ParametersNodeData>> = ({ data, updateData }) => {
  const updateParameters = (parameters: ParameterDefinitionEntry[]) => {
    updateData({ parameters });
  };

  const addParameter = () => {
    updateParameters([...data.parameters, { id: createParameterId(), type: 'string', value: '' }]);
  };

  const removeParameter = (id: string) => {
    updateParameters(data.parameters.filter((entry) => entry.id !== id));
  };

  const updateParameterField = (id: string, value: string) => {
    updateParameters(
      data.parameters.map((entry) => entry.id === id ? { ...entry, value } : entry),
    );
  };

  const payloadPreview = buildParameterPayload(data.parameters);

  return (
    <div className="flex flex-col h-full text-slate-300">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-200">Parameter Definitions</div>
          <div className="text-xs text-slate-500">Define reusable parameters for downstream nodes. Current supported type: string.</div>
        </div>
        <button
          type="button"
          onClick={addParameter}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:border-amber-400/50 hover:bg-amber-500/15 transition-colors text-xs font-semibold"
        >
          <Plus size={14} /> Add Param
        </button>
      </div>

      <div className="space-y-3 mb-6">
        {data.parameters.map((entry, index) => (
          <div key={entry.id} className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Param {index + 1}</span>
              <button
                type="button"
                onClick={() => removeParameter(entry.id)}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-300 transition-colors"
                disabled={data.parameters.length <= 1}
              >
                <Trash2 size={12} /> Remove
              </button>
            </div>

            <div className="flex items-end gap-3">
              <div className="w-1/6 min-w-[96px]">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Type</label>
                <div className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300">
                  String
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Value</label>
                <input
                  type="text"
                  value={entry.value}
                  onChange={(event) => updateParameterField(entry.id, event.target.value)}
                  placeholder="string value"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ParametersNodeDefinition: INodeDefinition<ParametersNodeData> = {
  typeId: 'string-params',
  displayName: 'Parameters',
  description: 'Defines reusable parameters for downstream node inputs. Currently supports string values.',
  icon: Type,
  category: 'Data',
  tags: ['json', 'params', 'input', 'definitions'],
  defaultInputs: STRING_PARAMS_INPUTS,
  defaultOutputs: STRING_PARAMS_OUTPUTS,
  createInitialData: createParametersNodeData,
  execute: ({ node }) => ({
    state: 'success',
    outputs: {
      'params-out': createParameterDefinitionsEnvelope(buildParameterPayload(node.data.parameters)),
    },
  }),
  getExecutionPreview: (data: ParametersNodeData) => ({
    'params-out': createParameterDefinitionsEnvelope(buildParameterPayload(data.parameters)),
  }),
  CanvasComponent: ParametersNodeCanvas,
  EditComponent: ParametersNodeEdit,
};

export const StringParametersNodeDef = defineStudioNode(ParametersNodeDefinition);

export default StringParametersNodeDef;