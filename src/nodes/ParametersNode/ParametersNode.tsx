import React from 'react';
import { Type } from 'lucide-react';
import { BaseNodeData, INodeComponentProps, INodeDefinition, IPort, ParameterValueType } from '../../core/studio/types';
import { createJsonPort, createParameterDefinitionsEnvelope, PARAMETER_DEFINITIONS_SCHEMA } from '../../core/studio/contracts';
import { defineStudioNode } from '../../core/studio/NodeRegistry';
import { Port } from '../../components/studio/canvas/Port';
import { createLiteralExpressionSource, getExpressionSourceDisplayValue } from '../../core/studio/expression';
import { parseParameterNodeDocumentState, type ExpressionSource, type ParameterNodeDocumentState } from '../../domain/studio/contracts';
import { createStableId } from '../../domain/contracts/shared-identity';

interface ParameterDefinitionEntry {
  id: string;
  name: string;
  type: ParameterValueType;
  source: ExpressionSource;
}

interface ParametersNodeData extends BaseNodeData {
  parameters: ParameterDefinitionEntry[];
}

const PARAMETERS_OUTPUTS: IPort[] = [
  createJsonPort('params-out', 'Params', PARAMETER_DEFINITIONS_SCHEMA, 'Parameter definitions for downstream node inputs.'),
];

function createParameterId() {
  return `param-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultParameter(): ParameterDefinitionEntry {
  return {
    id: createParameterId(),
    name: 'para1',
    type: 'string',
    source: createLiteralExpressionSource('value'),
  };
}

function createParametersNodeData(): ParametersNodeData {
  return {
    parameters: [createDefaultParameter()],
  };
}

function buildParameterPayload(parameters: ParameterDefinitionEntry[]) {
  return Object.fromEntries(
    parameters
      .map((entry, index) => [entry.name.trim() || `para${index + 1}`, {
        type: entry.type,
        value: getExpressionSourceDisplayValue(entry.source),
        source: entry.source,
      }] as const),
  );
}

function createRuntimeSymbols(parameters: ParameterDefinitionEntry[]) {
  return parameters.map((entry, index) => ({
    id: entry.id,
    name: entry.name.trim() || `para${index + 1}`,
    type: entry.type,
    source: entry.source,
  }));
}

function hydrateParameterEntries(symbols: unknown): ParameterDefinitionEntry[] {
  if (!Array.isArray(symbols)) {
    return [createDefaultParameter()];
  }

  const entries = symbols.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const candidate = entry as { stableId?: unknown; name?: unknown; valueSource?: unknown };
    if (typeof candidate.name !== 'string' || !candidate.valueSource || typeof candidate.valueSource !== 'object') {
      return [];
    }

    return [{
      id: typeof candidate.stableId === 'string' ? candidate.stableId : createParameterId(),
      name: candidate.name,
      type: 'string' as const,
      source: candidate.valueSource as ExpressionSource,
    }];
  });

  return entries.length > 0 ? entries : [createDefaultParameter()];
}

const ParametersNodeCanvas: React.FC<INodeComponentProps<ParametersNodeData>> = ({ id, data, outputs }) => {
  const parameterCount = data.parameters.length;

  return (
    <div className="relative flex flex-col items-center group">
      <div className="bg-[#1e293b]/95 backdrop-blur-md rounded-2xl border border-slate-700 hover:border-amber-500/60 w-16 h-16 shadow-lg flex items-center justify-center relative z-10 transition-colors cursor-grab active:cursor-grabbing">
        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-evenly py-1 gap-1 translate-x-[calc(50%+1px)] z-20">
          {outputs.map((port: IPort) => <Port key={port.id} nodeId={id} port={port} type="source" />)}
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

const ParametersNodeDefinition: INodeDefinition<ParametersNodeData> = {
  manifest: {
    type: 'string-params',
    typeVersion: 1,
    family: 'data',
    displayName: 'Parameters',
    description: 'Defines reusable parameters for downstream node inputs.',
    category: 'Data',
    tags: ['json', 'params', 'input', 'definitions'],
    inputs: [],
    outputs: PARAMETERS_OUTPUTS.map((port) => ({ key: port.id, displayName: port.label, direction: 'output', channel: 'data', cardinality: 'single', dataType: PARAMETER_DEFINITIONS_SCHEMA.id })),
    parameters: [{
      name: 'parameters',
      displayName: 'Parameter Definitions',
      valueType: 'collection',
      expressionSupport: 'disabled',
      ui: {
        section: 'Definitions',
        helperText: 'Define reusable parameters for downstream nodes.',
        collection: {
          minItems: 1,
          addLabel: 'Add Param',
          itemLabel: 'Param',
          identityKey: 'id',
          fields: [{
            name: 'type',
            displayName: 'Type',
            valueType: 'string',
            expressionSupport: 'disabled',
            defaultValue: 'string',
            ui: {
              readOnly: true,
            },
          }, {
            name: 'name',
            displayName: 'Name',
            valueType: 'string',
            expressionSupport: 'disabled',
            ui: {
              placeholder: 'para1',
              autoSequencePrefix: 'para',
            },
          }, {
            name: 'source',
            displayName: 'Value',
            valueType: 'string',
            expressionSupport: 'optional',
            ui: {
              placeholder: 'string value',
              helperText: 'Literal or dragged expression source.',
            },
          }],
        },
      },
    }],
  },
  icon: Type,
  createInitialData: createParametersNodeData,
  resolveDisplayName: (data) => data.nodeName?.trim() || undefined,
  hydrateData: (instance, baseData) => ({
    ...baseData,
    nodeName: instance.displayName,
    parameters: hydrateParameterEntries(parseParameterNodeDocumentState(instance.documentState).symbols),
  }),
  dehydrateData: (data, instance) => ({
    displayName: data.nodeName?.trim() || undefined,
    parameters: {},
    bindings: Object.fromEntries(
      createRuntimeSymbols(data.parameters).map((entry) => [entry.name, entry.source]),
    ),
    documentState: {
      symbols: createRuntimeSymbols(data.parameters).map((entry, index) => ({
        stableId: createStableId('symbol', [instance.id, entry.name || `para${index + 1}`]),
        name: entry.name,
        valueSource: entry.source,
      } satisfies ParameterNodeDocumentState['symbols'][number])),
    } satisfies ParameterNodeDocumentState,
  }),
  createRuntimeState: (node) => ({
    displayName: node.data.nodeName?.trim() || undefined,
    parameters: {},
    bindings: Object.fromEntries(
      createRuntimeSymbols(node.data.parameters).map((entry) => [entry.name, entry.source]),
    ),
    documentState: {
      symbols: createRuntimeSymbols(node.data.parameters).map((entry) => ({
        stableId: entry.id as ReturnType<typeof createStableId>,
        name: entry.name,
        valueSource: entry.source,
      })),
    } satisfies ParameterNodeDocumentState,
  }),
  executionContract: {
    validate: () => [],
    execute: ({ documentState }) => {
      const symbols = hydrateParameterEntries(parseParameterNodeDocumentState(documentState).symbols);
      return {
        state: 'success',
        outputs: {
          'params-out': createParameterDefinitionsEnvelope(buildParameterPayload(symbols)),
        },
      };
    },
  },
  getExecutionPreview: (data: ParametersNodeData) => ({
    'params-out': createParameterDefinitionsEnvelope(buildParameterPayload(data.parameters)),
  }),
  CanvasComponent: ParametersNodeCanvas,
};

export const ParametersNodeDef = defineStudioNode(ParametersNodeDefinition);

export default ParametersNodeDef;