import React, { useState } from 'react';
import { Plus, Trash2, Type, Tag, Settings2, Hash, Text, ToggleLeft, Box } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Select } from '../../components/common/Select';
import {
  BaseNodeData,
  INodeComponentProps,
  INodeEditProps,
  IPort,
  NodeExecutionOutputMap,
  StudioNodeDefinition,
  StudioNodeExecutionDefinition,
  StudioNodePresentationDefinition,
  StudioNodeQueryDefinition,
  StudioNodeSerializationDefinition,
} from '../../core/studio/types';
import { createJsonPort, createParameterDefinitionsEnvelope, PARAMETER_DEFINITIONS_SCHEMA } from '../../core/studio/contracts';
import { defineStudioNode } from '../../core/studio/NodeRegistry';
import { Port } from '../../components/studio/canvas/Port';
import { getExpressionSourceDisplayValue, readExpressionDragData } from '../../core/studio/expression';
import { useStudioExpressionDragState } from '../../application/studio/useStudioExpressionDragState';
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

function createDefaultParameter(name = 'para1'): ParameterDefinitionEntry {
  return {
    id: createParameterId(),
    name,
    type: 'string',
    source: createParameterLiteralSource('string', 'value'),
  };
}

function createNextDefaultParameter(parameters: ParameterDefinitionEntry[]): ParameterDefinitionEntry {
  const usedNames = new Set(parameters.map((entry) => entry.name.trim()).filter((name) => name.length > 0));
  let nextIndex = 1;

  while (usedNames.has(`para${nextIndex}`)) {
    nextIndex += 1;
  }

  return createDefaultParameter(`para${nextIndex}`);
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

function createParameterNameValidationIssue(entry: ParameterDefinitionEntry, index: number, message: string): ValidationIssue {
  return {
    severity: 'error',
    code: 'parameters.name.invalid',
    message: `${entry.name.trim() || `para${index + 1}`}: ${message}`,
    target: `parameters.${entry.id}`,
  };
}

function getParameterResolvedName(entry: ParameterDefinitionEntry, index: number) {
  return entry.name.trim() || `para${index + 1}`;
}

function getParameterBindingKey(entry: ParameterDefinitionEntry) {
  return entry.id;
}

function buildParameterPayload(
  parameters: ParameterDefinitionEntry[],
  resolveValue: (entry: ParameterDefinitionEntry) => unknown,
): { payload: ParameterDefinitionPayload; issues: ValidationIssue[] } {
  const seenNames = new Set<string>();

  return parameters.reduce<{ payload: ParameterDefinitionPayload; issues: ValidationIssue[] }>((acc, entry, index) => {
    const resolvedName = getParameterResolvedName(entry, index);
    if (seenNames.has(resolvedName)) {
      acc.issues.push(createParameterNameValidationIssue(entry, index, 'Parameter names must be unique within the node.'));
      return acc;
    }

    seenNames.add(resolvedName);

    const parseResult = coerceParameterValue(entry.type, resolveValue(entry));
    if (!parseResult.ok) {
      acc.issues.push(createParameterValidationIssue(entry, index, parseResult.message));
      return acc;
    }

    acc.payload[resolvedName] = {
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
    name: getParameterResolvedName(entry, index),
    type: entry.type,
    source: normalizeParameterValueSource(entry.source, entry.type),
  }));
}

function hydrateParameterEntries(symbols: unknown): ParameterDefinitionEntry[] {
  if (!Array.isArray(symbols)) {
    return [createDefaultParameter()];
  }

  const seenIds = new Set<string>();

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

    const nextId = typeof candidate.stableId === 'string' && !seenIds.has(candidate.stableId)
      ? candidate.stableId
      : createParameterId();
    seenIds.add(nextId);

    return [{
      id: nextId,
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

const AnimatedToggle = ({ isOn, onToggle }: { isOn: boolean; onToggle: () => void }) => (
  <div
    className={`relative flex h-6 w-11 cursor-pointer items-center rounded-full p-1 transition-colors duration-300 ${isOn ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'bg-slate-700/50'}`}
    onClick={onToggle}
  >
    <motion.div
      layout
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`h-4 w-4 rounded-full bg-white shadow-sm`}
      style={{ marginLeft: isOn ? 'auto' : 0 }}
    />
  </div>
);

const ParameterValueInput: React.FC<ParameterValueInputProps> = ({ entry, onChange }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCustomDragOver, setIsCustomDragOver] = useState(false);
  const { activeExpressionDrag, endExpressionDrag } = useStudioExpressionDragState();
  const validation = entry.source.kind === 'literal' ? coerceParameterValue(entry.type, entry.source.raw) : null;
  
  const isDropZoneActive = isDragOver || isCustomDragOver;
  
  const inputClassBase = "w-full rounded-lg border px-3 py-2 text-sm outline-none transition-all duration-300";
  const inputStateClass = validation && !validation.ok 
    ? "border-red-500/50 bg-red-500/5 text-red-100 placeholder:text-red-300/50 focus:border-red-400 focus:shadow-[0_0_10px_rgba(239,68,68,0.2)]" 
    : "border-slate-700/60 bg-slate-900/50 text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/80 focus:bg-slate-800 focus:shadow-[0_0_15px_rgba(6,182,212,0.15)]";

  const handleLiteralChange = (raw: string) => {
    onChange(createParameterLiteralSource(entry.type, raw));
  };

  return (
    <div className="relative group/input">
      <div
        className={`relative overflow-hidden rounded-lg border transition-all duration-300 ${isDropZoneActive ? 'border-dashed border-cyan-400 bg-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.2)] scale-[1.02]' : 'border-transparent bg-transparent'}`}
        onMouseEnter={() => {
          if (activeExpressionDrag) setIsCustomDragOver(true);
        }}
        onMouseLeave={() => setIsCustomDragOver(false)}
        onMouseUpCapture={(event) => {
          if (!activeExpressionDrag) return;
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
        {isDropZoneActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-cyan-500/10 backdrop-blur-[2px] z-10 rounded-lg">
            <span className="text-sm font-medium text-cyan-300 tracking-wide drop-shadow-md">Drop Expression</span>
          </div>
        )}
        
        {entry.type === 'boolean' && entry.source.kind === 'literal' ? (
           <div className={`h-[42px] flex items-center px-3 rounded-lg border ${validation && !validation.ok ? 'border-red-500/50 bg-red-500/5' : 'border-slate-700/60 bg-slate-900/50 hover:border-slate-600 transition-colors duration-300'}`}>
             <div className="flex-1 text-sm text-slate-300 font-medium">
                {validation && validation.ok && typeof validation.value === 'boolean' && validation.value ? 'True' : 'False'}
             </div>
             <AnimatedToggle 
               isOn={validation && validation.ok && typeof validation.value === 'boolean' ? validation.value : false} 
               onToggle={() => {
                 const current = validation && validation.ok && typeof validation.value === 'boolean' ? validation.value : false;
                 handleLiteralChange(current ? 'false' : 'true');
               }} 
             />
           </div>
        ) : (
          <input
            type="text"
            value={getExpressionSourceDisplayValue(entry.source)}
            placeholder={getParameterValuePlaceholder(entry.type)}
            onChange={(event) => handleLiteralChange(event.target.value)}
            readOnly={Boolean(activeExpressionDrag)}
            className={`${inputClassBase} ${inputStateClass} h-[42px]`}
          />
        )}
      </div>

      <AnimatePresence>
        {validation && !validation.ok && (
          <motion.div 
            initial={{ opacity: 0, y: -5, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -5, height: 0 }}
            className="px-3 pt-1.5 text-[11px] text-red-400 font-medium"
          >
            {validation.message}
          </motion.div>
        )}
      </AnimatePresence>
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

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'string': return <Text size={14} className="text-cyan-400" />;
      case 'integer':
      case 'float': return <Hash size={14} className="text-amber-400" />;
      case 'boolean': return <ToggleLeft size={14} className="text-emerald-400" />;
      default: return <Box size={14} className="text-slate-400" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0f172a] rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/5">
      {/* Header */}
      <div className="relative overflow-hidden bg-slate-900 border-b border-slate-800/80 px-5 py-4 shrink-0">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-amber-500/5 to-transparent opacity-50 pointer-events-none" />
        <div className="relative flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-500/30 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
              <Settings2 size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 tracking-wide">Parameters</h3>
              <p className="text-xs text-slate-400 mt-0.5">定義下游可重用的 typed parameters。</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateParameters([...data.parameters, createNextDefaultParameter(data.parameters)])}
            className="group relative flex items-center gap-1.5 rounded-lg bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-400 transition-all hover:bg-cyan-500/20 hover:text-cyan-300 hover:shadow-[0_0_20px_rgba(6,182,212,0.25)] ring-1 ring-cyan-500/30 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent -translate-x-full group-hover:translate-x-full duration-1000 transition-transform ease-out pointer-events-none" />
            <Plus size={15} className="group-hover:rotate-90 transition-transform duration-300" /> 
            <span>Add Param</span>
          </button>
        </div>
      </div>

      {/* Editor Content Area */}
      <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {data.parameters.map((entry, index) => (
              <motion.div 
                key={entry.id} 
                initial={{ opacity: 0, y: 15, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                className="group/card relative rounded-xl border border-slate-700/50 bg-slate-900/40 backdrop-blur-sm p-4 transition-all hover:border-slate-600/80 hover:bg-slate-900/60 hover:shadow-lg"
              >
                {/* Visual Accent Line removed */}

                <div className="mb-4 flex items-center justify-between pl-1">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-5 h-5 rounded-md bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-400">{index + 1}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">Parameter</span>
                  </div>
                  <button
                    type="button"
                    disabled={data.parameters.length <= 1}
                    onClick={() => updateParameters(data.parameters.filter((candidate) => candidate.id !== entry.id))}
                    className="flex items-center justify-center w-7 h-7 rounded-md text-slate-500 transition-all hover:bg-red-500/10 hover:text-red-400 disabled:opacity-20 disabled:cursor-not-allowed group/btn focus:outline-none focus:ring-2 focus:ring-red-500/30"
                    title="Remove Parameter"
                  >
                    <Trash2 size={14} className="group-hover/btn:scale-110 transition-transform" />
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_160px_minmax(0,1.8fr)] items-start">
                  {/* Name field */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 pl-1">
                      <Tag size={12} className="text-cyan-500/70" /> Name
                    </label>
                    <input
                      type="text"
                      value={entry.name}
                      placeholder={`para${index + 1}`}
                      onChange={(event) => updateParameter(entry.id, (candidate) => ({ ...candidate, name: event.target.value }))}
                      className="h-[42px] w-full rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 text-sm text-slate-200 outline-none transition-all duration-300 placeholder:text-slate-600 focus:border-cyan-400/80 focus:bg-slate-800 focus:shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                    />
                  </div>

                  {/* Type field */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 pl-1">
                      <Box size={12} className="text-amber-500/70" /> Type
                    </label>
                    <Select
                      value={entry.type}
                      onChange={(value) => updateParameter(entry.id, (candidate) => {
                        const nextType = value as ParameterScalarValueType;
                        return {
                          ...candidate,
                          type: nextType,
                          source: normalizeParameterValueSource(candidate.source, nextType),
                        };
                      })}
                      options={PARAMETER_SCALAR_VALUE_TYPES.map((valueType) => ({
                        label: (
                          <div className="flex items-center gap-2">
                            {getTypeIcon(valueType)}
                            <span className="capitalize">{valueType}</span>
                          </div>
                        ),
                        value: valueType
                      }))}
                      className="h-[42px] !rounded-lg bg-slate-900/50 border-slate-700/60 hover:border-slate-600 focus:border-cyan-400/80 focus:bg-slate-800 shadow-none text-slate-200"
                    />
                  </div>

                  {/* Value field */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 pl-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-violet-400/70 mt-[1px]" />
                      Value
                    </label>
                    <ParameterValueInput
                      entry={entry}
                      onChange={(source) => updateParameter(entry.id, (candidate) => ({ ...candidate, source }))}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {/* Subtle Add Button at the bottom if list is long */}
          {data.parameters.length > 3 && (
            <motion.div layout>
              <button
                type="button"
                onClick={() => updateParameters([...data.parameters, createNextDefaultParameter(data.parameters)])}
                className="w-full py-3.5 mt-2 rounded-xl border border-dashed border-slate-700/60 hover:border-cyan-500/40 text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/5 transition-all duration-300 flex items-center justify-center gap-2 group text-sm font-medium"
              >
                <Plus size={16} className="group-hover:scale-110 transition-transform" /> Add Another Parameter
              </button>
            </motion.div>
          )}
        </div>
      </div>
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

const ParametersNodePresentation: StudioNodePresentationDefinition<ParametersNodeData> = {
  icon: Type,
  resolveDisplayName: (data) => data.nodeName?.trim() || undefined,
  EditComponent: ParametersNodeEditor,
  CanvasComponent: ParametersNodeCanvas,
};

const ParametersNodeSerialization: StudioNodeSerializationDefinition<ParametersNodeData> = {
  createInitialData: createParametersNodeData,
  hydrateData: (instance, baseData) => ({
    ...baseData,
    nodeName: instance.displayName,
    parameters: hydrateParameterEntries(parseParameterNodeDocumentState(instance.documentState).symbols),
  }),
  dehydrateData: (data) => ({
    displayName: data.nodeName?.trim() || undefined,
    parameters: {},
    bindings: Object.fromEntries(
      createRuntimeSymbols(data.parameters).map((entry) => [entry.id, entry.source]),
    ),
    documentState: {
      symbols: createRuntimeSymbols(data.parameters).map((entry) => ({
        stableId: entry.id as ReturnType<typeof createStableId>,
        name: entry.name,
        valueType: entry.type,
        valueSource: entry.source,
      })),
    } satisfies ParameterNodeDocumentState,
  }),
  createRuntimeState: (node) => ({
    displayName: node.data.nodeName?.trim() || undefined,
    parameters: {},
    bindings: Object.fromEntries(
      createRuntimeSymbols(node.data.parameters).map((entry) => [entry.id, entry.source]),
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
};

const ParametersNodeQuery: StudioNodeQueryDefinition<ParametersNodeData> = {
  buildQueryOutputs: buildParametersNodeQuerySnapshot,
};

const ParametersNodeExecution: StudioNodeExecutionDefinition = {
  executionContract: {
    validate: ({ documentState, resolvedBindings }) => {
      const symbols = hydrateParameterEntries(parseParameterNodeDocumentState(documentState).symbols);
      return buildParameterPayload(symbols, (entry) => entry.source.kind === 'literal' ? entry.source.raw : resolvedBindings[getParameterBindingKey(entry)]).issues;
    },
    execute: ({ documentState, resolvedBindings }) => {
      const symbols = hydrateParameterEntries(parseParameterNodeDocumentState(documentState).symbols);
      const { payload } = buildParameterPayload(symbols, (entry) => entry.source.kind === 'literal' ? entry.source.raw : resolvedBindings[getParameterBindingKey(entry)]);
      return {
        state: 'success',
        outputs: {
          'params-out': createParameterDefinitionsEnvelope(payload),
        },
      };
    },
  },
};

const ParametersNodeDefinition: StudioNodeDefinition<ParametersNodeData> = {
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
  ...ParametersNodePresentation,
  ...ParametersNodeSerialization,
  ...ParametersNodeQuery,
  ...ParametersNodeExecution,
};

export const ParametersNodeDef = defineStudioNode(ParametersNodeDefinition);

export default ParametersNodeDef;