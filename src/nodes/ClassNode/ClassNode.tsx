import React, { useEffect, useMemo, useState } from 'react';
import { Box, Code, ExternalLink, AlertCircle, Layers3, Search, User } from 'lucide-react';
import {
  INodeComponentProps,
  INodeEditProps,
  INodeDefinition,
  BaseNodeData,
  IPort,
  ClassBinding,
  ClassInfoItemDescriptor,
  ClassInfoCatalog,
  ClassInfoSelection,
} from '../../core/studio/types';
import { defineStudioNode } from '../../core/studio/NodeRegistry';
import {
  CLASS_INFO_SCHEMA,
  INSTANCE_REFERENCE_SCHEMA,
  createClassInfoEnvelope,
  createFlowPort,
  createJsonPort,
} from '../../core/studio/contracts';
import {
  createEmptyClassInfoSelection,
  filterStudioClassCatalog,
  reconcileClassInfoSelection,
} from '../../core/studio/classCatalog';
import { Port } from '../../components/studio/canvas/Port';
import { useStudioClassCatalog } from '../../core/studio/StudioClassCatalogContext';
import { useStudioGraph, useStudioRuntime } from '../../core/studio/StudioContext';

export interface ClassNodeData extends BaseNodeData {
  binding: ClassBinding | null;
  staticFallbackAddress?: string;
  availableInfo: ClassInfoCatalog;
  infoSelection: ClassInfoSelection;
}

function validateClassNodeExecution(data: ClassNodeData, hasIncomingInstance: boolean) {
  const hasStaticFallback = Boolean(data.staticFallbackAddress && data.staticFallbackAddress.trim().length > 0);

  if (!hasIncomingInstance && !hasStaticFallback) {
    return {
      valid: false,
      error: 'Class node requires an incoming instance reference or a static fallback address.',
    };
  }

  return { valid: true };
}

const CLASS_INFO_OUTPUT: IPort = {
  ...createJsonPort('info-out', 'Info', CLASS_INFO_SCHEMA, 'Selected class metadata wrapped in the studio JSON envelope.'),
};

const CLASS_NODE_INPUTS: IPort[] = [
  createFlowPort('flow-in', 'Flow In'),
  createJsonPort('instance-in', 'Instance Ref', INSTANCE_REFERENCE_SCHEMA, 'Runtime instance reference envelope.'),
];

const CLASS_NODE_OUTPUTS: IPort[] = [
  createFlowPort('flow-out', 'Flow Out'),
  CLASS_INFO_OUTPUT,
];

function createEmptyCatalog(): ClassInfoCatalog {
  return {
    members: [],
    statics: [],
    functions: [],
  };
}

function createClassNodeData(): ClassNodeData {
  return {
    binding: null,
    staticFallbackAddress: '',
    availableInfo: createEmptyCatalog(),
    infoSelection: createEmptyClassInfoSelection(),
    inputs: CLASS_NODE_INPUTS.map((port) => ({ ...port })),
    outputs: CLASS_NODE_OUTPUTS.map((port) => ({ ...port })),
  };
}

function toggleSelectionEntry(selection: string[], itemId: string) {
  return selection.includes(itemId)
    ? selection.filter((item) => item !== itemId)
    : [...selection, itemId];
}

function createInfoPreview(data: ClassNodeData) {
  return createClassInfoEnvelope(data.binding, data.availableInfo, data.infoSelection);
}

function isDescriptorSelected(ids: string[], descriptor: ClassInfoItemDescriptor) {
  return ids.includes(descriptor.id);
}

type SelectionBucketKey = keyof ClassInfoSelection;

function createSectionTone(bucket: SelectionBucketKey) {
  if (bucket === 'members') {
    return {
      accentText: 'text-emerald-400',
      accentBg: 'bg-emerald-500/10 border-emerald-500/30',
      accentInput: 'text-emerald-500 focus:ring-emerald-500/30',
      icon: User,
      label: 'Members',
    };
  }

  if (bucket === 'statics') {
    return {
      accentText: 'text-purple-400',
      accentBg: 'bg-purple-500/10 border-purple-500/30',
      accentInput: 'text-purple-500 focus:ring-purple-500/30',
      icon: Box,
      label: 'Statics',
    };
  }

  return {
    accentText: 'text-blue-400',
    accentBg: 'bg-blue-500/10 border-blue-500/30',
    accentInput: 'text-blue-500 focus:ring-blue-500/30',
    icon: Code,
    label: 'Functions',
  };
}

const ClassNodeCanvas: React.FC<INodeComponentProps<ClassNodeData>> = ({ id, data }) => {
  const { edges } = useStudioGraph();
  const { nodeStates } = useStudioRuntime();
  
  // Logic to determine if we are missing the required instance address and static fallback
  const hasInputConnection = edges.some(e => e.targetNodeId === id && e.targetPortId === 'instance-in');
  const hasStaticFallback = !!data.staticFallbackAddress && data.staticFallbackAddress.trim().length > 0;
  
  const isErrorState = !hasInputConnection && !hasStaticFallback;
  const executionState = nodeStates?.[id] || 'idle';

  return (
    <div className="relative flex flex-col items-center group">
      
      {/* Node Body (Draggable) */}
      <div className={`bg-[#1e293b]/95 backdrop-blur-md rounded-2xl border w-16 h-16 shadow-lg flex items-center justify-center relative z-10 transition-colors cursor-grab active:cursor-grabbing 
        ${isErrorState ? 'border-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 
          executionState === 'running' ? 'border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.5)] scale-110' :
          executionState === 'success' ? 'border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]' :
          'border-slate-700 hover:border-cyan-500/60'}
      `}>
        
        {/* Error Indicator */}
        {isErrorState && (
            <span title="Missing Instance Address or Static Fallback" className="absolute -top-1.5 -right-1.5 z-30 bg-[#0f172a] rounded-full border border-red-900/50">
                <AlertCircle size={14} className="text-red-400 animate-pulse" />
            </span>
        )}

        {/* Input Ports Container */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center gap-2 -translate-x-[calc(50%+1px)] z-20">
           {data.inputs.map(port => <Port key={port.id} nodeId={id} port={port} type="target" />)}
        </div>

        {/* Output Ports Container */}
        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-evenly py-1 gap-1 translate-x-[calc(50%+1px)] z-20">
            {data.outputs.map(port => <Port key={port.id} nodeId={id} port={port} type="source" />)}
        </div>

        {/* Icon */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-105 transition-transform duration-300 ${isErrorState ? 'bg-red-500/10 text-red-400' : 'bg-cyan-500/20 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]'}`}>
          <Box size={20} />
        </div>
      </div>

      {/* Node Label (Below) */}
      <div className="absolute top-full mt-2 text-center pointer-events-none w-max flex flex-col items-center z-20">
        <span className="text-xs text-white font-medium tracking-wide">
          {data.binding?.name || 'Select Class...'}
        </span>
        <span className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wider">Class Ref</span>
      </div>
    </div>
  );
};

// --- Edit Component ---
const ClassNodeEdit: React.FC<INodeEditProps<ClassNodeData>> = ({ data, updateData }) => {
  const { classes, createNodeRequestFromBinding, openInspectorForBinding } = useStudioClassCatalog();
  const [bindingSearchQuery, setBindingSearchQuery] = useState('');
  const [isBindingPickerOpen, setIsBindingPickerOpen] = useState(!data.binding);

  useEffect(() => {
    if (!data.binding) {
      setIsBindingPickerOpen(true);
    }
  }, [data.binding]);

  const handleToggle = (type: 'member' | 'static' | 'function', itemId: string) => {
    const listKey = type === 'member' ? 'members' : type === 'static' ? 'statics' : 'functions';
    updateData({
      infoSelection: {
        ...data.infoSelection,
        [listKey]: toggleSelectionEntry(data.infoSelection[listKey], itemId),
      },
    });
  };

  const updateSelectionBucket = (bucket: SelectionBucketKey, ids: string[]) => {
    updateData({
      infoSelection: {
        ...data.infoSelection,
        [bucket]: ids,
      },
    });
  };

  const filteredBindings = useMemo(() => {
    return filterStudioClassCatalog(classes, bindingSearchQuery).slice(0, 60);
  }, [bindingSearchQuery, classes]);

  const handleBindClass = (classBinding: (typeof filteredBindings)[number]) => {
    const request = createNodeRequestFromBinding(classBinding);
    if (!request) {
      return;
    }

    updateData({
      binding: request.binding,
      availableInfo: request.availableInfo,
      infoSelection: reconcileClassInfoSelection(data.infoSelection, request.availableInfo),
    });
    setIsBindingPickerOpen(false);
  };

  const infoPreview = useMemo(() => createInfoPreview(data), [data]);
  const hasBinding = Boolean(data.binding);
  const hasSelectableInfo =
    data.availableInfo.members.length > 0 ||
    data.availableInfo.statics.length > 0 ||
    data.availableInfo.functions.length > 0;
  const availableCount =
    data.availableInfo.members.length +
    data.availableInfo.statics.length +
    data.availableInfo.functions.length;
  const selectedCount =
    data.infoSelection.members.length +
    data.infoSelection.statics.length +
    data.infoSelection.functions.length;

  const renderSelectionSection = (
    bucket: SelectionBucketKey,
    descriptors: ClassInfoItemDescriptor[]
  ) => {
    const tone = createSectionTone(bucket);
    const Icon = tone.icon;
    const selectedIds = data.infoSelection[bucket];

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${tone.accentText}`}>
            <Icon size={12} /> {tone.label}
            <span className="text-slate-600">{selectedIds.length}/{descriptors.length}</span>
          </div>
          {descriptors.length > 0 ? (
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
              <button
                type="button"
                className="text-slate-500 hover:text-slate-300 transition-colors"
                onClick={() => updateSelectionBucket(bucket, descriptors.map((item) => item.id))}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-slate-600 hover:text-slate-300 transition-colors"
                onClick={() => updateSelectionBucket(bucket, [])}
              >
                Clear
              </button>
            </div>
          ) : null}
        </div>

        {descriptors.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 p-3 text-xs text-slate-500">
            No {tone.label.toLowerCase()} available for this class binding.
          </div>
        ) : (
          descriptors.map((descriptor) => (
            <label
              key={descriptor.id}
              className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors border ${isDescriptorSelected(selectedIds, descriptor) ? tone.accentBg : 'hover:bg-slate-800 border-transparent'}`}
            >
              <input
                type="checkbox"
                checked={isDescriptorSelected(selectedIds, descriptor)}
                onChange={() => handleToggle(bucket === 'members' ? 'member' : bucket === 'statics' ? 'static' : 'function', descriptor.id)}
                className={`rounded border-slate-600 bg-slate-800 ${tone.accentInput} w-4 h-4 cursor-pointer`}
              />
              <div className="min-w-0">
                <span className="text-sm block truncate">{descriptor.label}</span>
                {descriptor.detail ? <span className="text-[10px] text-slate-500 font-mono block truncate">{descriptor.detail}</span> : null}
              </div>
            </label>
          ))
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full text-slate-300">
      <div className="mb-6 p-4 rounded-lg bg-slate-800/50 border border-slate-700 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Bound Class</label>
            {data.binding ? (
              <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 px-3 py-3">
                <div className="text-sm text-cyan-300 font-medium truncate">{data.binding.fullName}</div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                  <span>{data.binding.namespace || 'Global'}</span>
                  <span className="text-slate-700">•</span>
                  <span className="inline-flex items-center gap-1"><Layers3 size={10} /> {data.binding.imageName}</span>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-200">
                This node is not bound yet. Pick a concrete class below before configuring the info payload.
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-6">
            <button
              type="button"
              onClick={() => setIsBindingPickerOpen((prev) => !prev)}
              className="px-3 py-2 rounded-md border border-slate-700 bg-slate-900 text-xs font-medium text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300 transition-colors"
            >
              {isBindingPickerOpen ? 'Hide picker' : 'Rebind'}
            </button>
            {data.binding && openInspectorForBinding ? (
              <button
                type="button"
                onClick={() => openInspectorForBinding(data.binding!)}
                className="px-3 py-2 rounded-md border border-slate-700 bg-slate-900 text-xs font-medium text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300 transition-colors inline-flex items-center gap-1.5"
              >
                <ExternalLink size={12} /> Inspector
              </button>
            ) : null}
          </div>
        </div>

        {isBindingPickerOpen ? (
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-700/70 bg-slate-900/70 flex items-center gap-2">
              <Search size={14} className="text-cyan-400" />
              <input
                type="text"
                value={bindingSearchQuery}
                onChange={(event) => setBindingSearchQuery(event.target.value)}
                placeholder="Search classes by full name, namespace, or assembly..."
                className="flex-1 bg-transparent border-none outline-none text-sm text-slate-200 placeholder:text-slate-500"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-2 space-y-1">
              {filteredBindings.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-700 px-3 py-4 text-sm text-slate-500">
                  No classes found for "{bindingSearchQuery}".
                </div>
              ) : (
                filteredBindings.map((entry) => (
                  <button
                    key={`${entry.imageId}::${entry.classId}`}
                    type="button"
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${data.binding?.imageId === entry.imageId && data.binding?.classId === entry.classId ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-transparent hover:border-cyan-500/20 hover:bg-slate-800/70'}`}
                    onClick={() => handleBindClass(entry)}
                  >
                    <div className="text-sm font-medium text-slate-100 truncate">{entry.fullName}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                      <span>{entry.namespace || 'Global'}</span>
                      <span className="text-slate-700">•</span>
                      <span className="inline-flex items-center gap-1 text-cyan-500/80"><Layers3 size={10} /> {entry.imageName}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Static Fallback Address</label>
          <input
            type="text"
            placeholder="e.g. 0x12345678"
            value={data.staticFallbackAddress || ''}
            onChange={(e) => updateData({ staticFallbackAddress: e.target.value })}
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-mono"
          />
          <p className="text-xs text-slate-500 mt-2">
            Used if the <span className="text-cyan-400 bg-cyan-400/10 px-1 py-0.5 rounded font-mono">Instance Ref</span> port is unconnected.
          </p>
        </div>
      </div>

      <div className="font-medium text-sm text-slate-200 mb-3 px-1 border-b border-slate-700/50 pb-2 flex items-center justify-between gap-3">
        <span>Info Payload Selection</span>
        <span className="text-xs text-slate-500">{selectedCount}/{availableCount} selected</span>
      </div>
      
      <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          {!hasBinding ? (
              <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">
                  Bind a class first, then select which members, statics, and functions should be wrapped under the fixed <span className="text-cyan-400 font-mono">info</span> output payload.
              </div>
          ) : !hasSelectableInfo ? (
              <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">
                  This class has no exportable metadata categories available yet.
              </div>
          ) : null}

          {renderSelectionSection('members', data.availableInfo.members)}
          {renderSelectionSection('statics', data.availableInfo.statics)}
          {renderSelectionSection('functions', data.availableInfo.functions)}

          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Info Output Preview</div>
              <pre className="text-[11px] leading-relaxed text-cyan-100 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(infoPreview, null, 2)}</pre>
          </div>

      </div>
    </div>
  );
};

const ClassNodeDefinition: INodeDefinition<ClassNodeData> = {
  typeId: 'class-ref',
  displayName: 'Class Reference',
  description: 'Resolves a concrete class binding and wraps selected metadata into a fixed info JSON output.',
  icon: Box,
  category: 'Runtime',
  tags: ['class', 'metadata', 'json', 'unity'],
  defaultInputs: CLASS_NODE_INPUTS,
  defaultOutputs: CLASS_NODE_OUTPUTS,
  createInitialData: createClassNodeData,
  validateExecution: ({ node, incoming }) => validateClassNodeExecution(node.data, (incoming['instance-in']?.length ?? 0) > 0),
  execute: ({ node, incoming }) => {
    const data = node.data;
    const hasInput = (incoming['instance-in']?.length ?? 0) > 0;
    const validation = validateClassNodeExecution(data, hasInput);
    if (!validation.valid) {
      return {
        state: 'error',
        error: validation.error,
      };
    }

    return {
      state: 'success',
      outputs: {
        'info-out': createClassInfoEnvelope(data.binding, data.availableInfo, data.infoSelection),
      },
    };
  },
  CanvasComponent: ClassNodeCanvas,
  EditComponent: ClassNodeEdit,
};

export const ClassNodeDef = defineStudioNode(ClassNodeDefinition);

export default ClassNodeDef;
