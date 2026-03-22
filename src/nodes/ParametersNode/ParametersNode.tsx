import React, { useState } from 'react';
import { Plus, Trash2, Type } from 'lucide-react';
import { BaseNodeData, INodeComponentProps, INodeDefinition, INodeEditProps, IPort, NodeExecutionOutputMap } from '../../core/studio/types';
import { createJsonPort, createParameterDefinitionsEnvelope, PARAMETER_DEFINITIONS_SCHEMA } from '../../core/studio/contracts';
import { defineStudioNode } from '../../core/studio/NodeRegistry';
import { Port } from '../../components/studio/canvas/Port';
import { getExpressionSourceDisplayValue, readExpressionDragData } from '../../core/studio/expression';
import { useExpressionDrag } from '../../core/studio/drag/ExpressionDragContext';
import {
  parseParameterNodeDocumentState,
  type ExpressionSource,
  type ParameterDefinitionPayload,
  type ParameterNodeDocumentState,
  type ParameterScalarValueType,
  type ValidationIssue,
} from '../../domain/studio/contracts';
import { createStableId } from '../../domain/contracts/shared-identity';
import type { StudioNodeQueryContext } from '../../core/studio/queryTypes';
import {
  PARAMETER_SCALAR_VALUE_TYPES,
  coerceParameterValue,
  createParameterLiteralSource,
  getParameterValuePlaceholder,
  isParameterScalarValueType,
  normalizeParameterValueSource,
} from './parameterValueTypes';

interface ParameterDefinitionEntry {
  id: string;
  name: string;
  type: ParameterScalarValueType;
  source: ExpressionSource;
}

interface ParametersNodeData extends BaseNodeData {
  parameters: ParameterDefinitionEntry[];
}

const PARAMETERS_OUTPUTS: IPort[] = [
  createJsonPort('params-out', 'Params', PARAMETER_DEFINITIONS_SCHEMA, 'Parameter definitions for downstream node inputs.', { cardinality: 'multiple' }),
];

function createParameterId() {
  return `param-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultParameter(): ParameterDefinitionEntry {
  return {
    id: createParameterId(),
    name: 'para1',
    type: 'string',
    source: createParameterLiteralSource('string', 'value'),
  };
}

function createParametersNodeData(): ParametersNodeData {
  return {
    parameters: [createDefaultParameter()],
  };
}

function createParameterValidationIssue(entry: ParameterDefinitionEntry, index: number, message: string): ValidationIssue {
  return {
    severity: 'error',
    code: 'parameters.value.invalid',
    message: `${entry.name.trim() || `para${index + 1}`}: ${message}`,
    target: `parameters.${entry.id}`,
  };
}

function buildParameterPayload(
  parameters: ParameterDefinitionEntry[],
  resolveValue: (entry: ParameterDefinitionEntry) => unknown,
): { payload: ParameterDefinitionPayload; issues: ValidationIssue[] } {
  return parameters.reduce<{ payload: ParameterDefinitionPayload; issues: ValidationIssue[] }>((acc, entry, index) => {
    const parseResult = coerceParameterValue(entry.type, resolveValue(entry));
    if (!parseResult.ok) {
      acc.issues.push(createParameterValidationIssue(entry, index, parseResult.message));
      return acc;
    }

    acc.payload[entry.name.trim() || `para${index + 1}`] = {
      type: entry.type,
      value: parseResult.value,
      source: normalizeParameterValueSource(entry.source, entry.type),
    };
    return acc;
  }, { payload: {}, issues: [] });
}

function createRuntimeSymbols(parameters: ParameterDefinitionEntry[]) {
  return parameters.map((entry, index) => ({
    id: entry.id,
    name: entry.name.trim() || `para${index + 1}`,
    type: entry.type,
    source: normalizeParameterValueSource(entry.source, entry.type),
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

    const candidate = entry as { stableId?: unknown; name?: unknown; valueType?: unknown; valueSource?: unknown };
    if (
      typeof candidate.name !== 'string'
      || !isParameterScalarValueType(candidate.valueType)
      || !candidate.valueSource
      || typeof candidate.valueSource !== 'object'
    ) {
      return [];
    }

    return [{
      id: typeof candidate.stableId === 'string' ? candidate.stableId : createParameterId(),
      name: candidate.name,
      type: candidate.valueType,
      source: normalizeParameterValueSource(candidate.valueSource as ExpressionSource, candidate.valueType),
    }];
  });

  return entries.length > 0 ? entries : [createDefaultParameter()];
}

function buildParametersNodeQuerySnapshot(
  node: import('../../core/studio/types').StudioNode<ParametersNodeData>,
  context: StudioNodeQueryContext,
  dependencySnapshots: Record<string, import('../../core/studio/types').NodeExecutionSnapshot>,
): NodeExecutionOutputMap {
  const { payload } = buildParameterPayload(
    node.data.parameters,
    (entry) => entry.source.kind === 'literal'
      ? entry.source.raw
      : context.runtimeData.expressions.resolveSource(entry.source, dependencySnapshots) ?? null,
  );

  return {
    'params-out': createParameterDefinitionsEnvelope(payload),
  };
}

interface ParameterValueInputProps {
  entry: ParameterDefinitionEntry;
  onChange: (source: ExpressionSource) => void;
}

const ParameterValueInput: React.FC<ParameterValueInputProps> = ({ entry, onChange }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCustomDragOver, setIsCustomDragOver] = useState(false);
  const { activeExpressionDrag, endExpressionDrag } = useExpressionDrag();
  const validation = entry.source.kind === 'literal' ? coerceParameterValue(entry.type, entry.source.raw) : null;
  const inputClassName = `w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors ${validation && !validation.ok ? 'border-red-500/50 bg-red-500/5 text-red-100 placeholder:text-red-300/50 focus:border-red-400' : 'border-slate-700 bg-slate-950 text-slate-200 placeholder:text-slate-500 focus:border-cyan-500'}`;

  const handleLiteralChange = (raw: string) => {
    onChange(createParameterLiteralSource(entry.type, raw));
  };

  return (
    <div
      className={`rounded-lg border transition-all ${(isDragOver || isCustomDragOver) ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_18px_rgba(6,182,212,0.18)]' : 'border-slate-800 bg-transparent'}`}
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
        onChange(activeExpressionDrag.source);
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
        const expressionSource = readExpressionDragData(event.dataTransfer);
        if (expressionSource) {
          onChange(expressionSource);
        }
      }}
    >
      {entry.type === 'boolean' && entry.source.kind === 'literal' ? (
        <select
          value={validation && validation.ok && typeof validation.value === 'boolean' ? String(validation.value) : 'false'}
          onChange={(event) => handleLiteralChange(event.target.value)}
          className={inputClassName}
        >
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
      ) : (
        <input
          type="text"
          value={getExpressionSourceDisplayValue(entry.source)}
          placeholder={getParameterValuePlaceholder(entry.type)}
          onChange={(event) => handleLiteralChange(event.target.value)}
          readOnly={Boolean(activeExpressionDrag)}
          className={inputClassName}
        />
      )}
      {validation && !validation.ok ? (
        <div className="px-3 pb-2 text-[11px] text-red-300">{validation.message}</div>
      ) : null}
    </div>
  );
};

const ParametersNodeEditor: React.FC<INodeEditProps<ParametersNodeData>> = ({ data, updateData }) => {
  const updateParameters = (nextParameters: ParameterDefinitionEntry[]) => {
    updateData({ parameters: nextParameters });
  };

  const updateParameter = (parameterId: string, mutate: (entry: ParameterDefinitionEntry) => ParameterDefinitionEntry) => {
    updateParameters(data.parameters.map((entry) => entry.id === parameterId ? mutate(entry) : entry));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-200">Parameter Definitions</div>
          <div className="text-xs text-slate-500">定義下游可重用的 typed parameters。</div>
        </div>
        <button
          type="button"
          onClick={() => updateParameters([...data.parameters, createDefaultParameter()])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 transition-colors hover:border-amber-400/50 hover:bg-amber-500/15"
        >
          <Plus size={14} /> Add Param
        </button>
      </div>

      {data.parameters.map((entry, index) => (
        <div key={entry.id} className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Param {index + 1}</span>
            <button
              type="button"
              disabled={data.parameters.length <= 1}
              onClick={() => updateParameters(data.parameters.filter((candidate) => candidate.id !== entry.id))}
              className="inline-flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={12} /> Remove
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_minmax(0,1.4fr)]">
            <label className="block">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Name</div>
              <input
                type="text"
                value={entry.name}
                placeholder={`para${index + 1}`}
                onChange={(event) => updateParameter(entry.id, (candidate) => ({ ...candidate, name: event.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
              />
            </label>

            <label className="block">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Type</div>
              <select
                value={entry.type}
                onChange={(event) => updateParameter(entry.id, (candidate) => {
                  const nextType = event.target.value as ParameterScalarValueType;
                  return {
                    ...candidate,
                    type: nextType,
                    source: normalizeParameterValueSource(candidate.source, nextType),
                  };
                })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-500"
              >
                {PARAMETER_SCALAR_VALUE_TYPES.map((valueType) => (
                  <option key={valueType} value={valueType}>{valueType}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Value</div>
              <ParameterValueInput
                entry={entry}
                onChange={(source) => updateParameter(entry.id, (candidate) => ({ ...candidate, source }))}
              />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
};

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
    outputs: PARAMETERS_OUTPUTS.map((port) => ({ key: port.id, displayName: port.label, direction: 'output', channel: 'data', cardinality: port.cardinality, dataType: PARAMETER_DEFINITIONS_SCHEMA.id })),
    preview: {
      mode: 'supported',
      description: 'Parameter definitions are fully materialized from node-local configuration.',
    },
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
            valueType: 'selection',
            expressionSupport: 'disabled',
            defaultValue: 'string',
            options: PARAMETER_SCALAR_VALUE_TYPES.map((valueType) => ({ label: valueType, value: valueType })),
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
              placeholder: 'Literal or expression value',
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
  EditComponent: ParametersNodeEditor,
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
        valueType: entry.type,
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
        valueType: entry.type,
        valueSource: entry.source,
      })),
    } satisfies ParameterNodeDocumentState,
  }),
  buildQueryOutputs: buildParametersNodeQuerySnapshot,
  executionContract: {
    validate: ({ documentState, resolvedBindings }) => {
      const symbols = hydrateParameterEntries(parseParameterNodeDocumentState(documentState).symbols);
      return buildParameterPayload(symbols, (entry) => entry.source.kind === 'literal' ? entry.source.raw : resolvedBindings[entry.name]).issues;
    },
    execute: ({ documentState, resolvedBindings }) => {
      const symbols = hydrateParameterEntries(parseParameterNodeDocumentState(documentState).symbols);
      const { payload } = buildParameterPayload(symbols, (entry) => entry.source.kind === 'literal' ? entry.source.raw : resolvedBindings[entry.name]);
      return {
        state: 'success',
        outputs: {
          'params-out': createParameterDefinitionsEnvelope(payload),
        },
      };
    },
  },
  CanvasComponent: ParametersNodeCanvas,
};

export const ParametersNodeDef = defineStudioNode(ParametersNodeDefinition);

export default ParametersNodeDef;