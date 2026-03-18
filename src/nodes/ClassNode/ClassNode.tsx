import React, { useEffect, useMemo, useState } from 'react';
import { Box, Code, AlertCircle, Layers3, Search, User, Check } from 'lucide-react';
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
  PARAMETER_DEFINITIONS_SCHEMA,
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
  instanceAddress?: string;
  availableInfo: ClassInfoCatalog;
  infoSelection: ClassInfoSelection;
}

function validateClassNodeExecution(data: ClassNodeData, hasIncomingInstance: boolean) {
  const hasInstanceAddress = Boolean(data.instanceAddress && data.instanceAddress.trim().length > 0);

  if (!hasIncomingInstance && !hasInstanceAddress) {
    return {
      valid: false,
      error: 'Class node requires an incoming instance reference or a static instance address.',
    };
  }

  return { valid: true };
}

const CLASS_INFO_OUTPUT: IPort = {
  ...createJsonPort('info-out', 'Info', CLASS_INFO_SCHEMA, 'Selected class metadata wrapped in the studio JSON envelope.'),
};

const CLASS_NODE_INPUTS: IPort[] = [
  createFlowPort('flow-in', 'Flow In'),
  createJsonPort('instance-in', 'Instance Ref', PARAMETER_DEFINITIONS_SCHEMA, 'Parameter definitions used to supply instance reference data to this class node.'),
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
    instanceAddress: '',
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
      accentBg: 'bg-emerald-500/10',
      accentBorder: 'border-emerald-500/30',
      accentFill: 'bg-emerald-500',
      shadow: 'shadow-[0_0_15px_rgba(16,185,129,0.1)]',
      icon: User,
      label: 'Members',
    };
  }

  if (bucket === 'statics') {
    return {
      accentText: 'text-purple-400',
      accentBg: 'bg-purple-500/10',
      accentBorder: 'border-purple-500/30',
      accentFill: 'bg-purple-500',
      shadow: 'shadow-[0_0_15px_rgba(168,85,247,0.1)]',
      icon: Box,
      label: 'Statics',
    };
  }

  return {
    accentText: 'text-blue-400',
    accentBg: 'bg-blue-500/10',
    accentBorder: 'border-blue-500/30',
    accentFill: 'bg-blue-500',
    shadow: 'shadow-[0_0_15px_rgba(59,130,246,0.1)]',
    icon: Code,
    label: 'Methods',
  };
}

const ClassNodeCanvas: React.FC<INodeComponentProps<ClassNodeData>> = ({ id, data }) => {
  const { edges } = useStudioGraph();
  const { nodeStates } = useStudioRuntime();
  
  // Logic to determine if we are missing the required instance address and static fallback
  const hasInputConnection = edges.some(e => e.targetNodeId === id && e.targetPortId === 'instance-in');
  const hasInstanceAddress = !!data.instanceAddress && data.instanceAddress.trim().length > 0;
  
  const isErrorState = !hasInputConnection && !hasInstanceAddress;
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
            <span title="Missing Instance Address" className="absolute -top-1.5 -right-1.5 z-30 bg-[#0f172a] rounded-full border border-red-900/50">
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
          {data.nodeName?.trim() || data.binding?.name || 'Select Class...'}
        </span>
        <span className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wider">Class Ref</span>
      </div>
    </div>
  );
};

// --- Edit Component ---
const ClassNodeEdit: React.FC<INodeEditProps<ClassNodeData>> = ({ data, updateData }) => {
  const { classes, createNodeRequestFromBinding } = useStudioClassCatalog();
  const [bindingSearchQuery, setBindingSearchQuery] = useState('');
  const [isBindingPickerOpen, setIsBindingPickerOpen] = useState(!data.binding);
  const [isDragOverInput, setIsDragOverInput] = useState(false);

  useEffect(() => {
    if (!data.binding) {
      setIsBindingPickerOpen(true);
    }
  }, [data.binding]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOverInput) setIsDragOverInput(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOverInput(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOverInput(false);
    const address = e.dataTransfer.getData('text/plain');
    if (address) {
      updateData({ instanceAddress: address });
    }
  };

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
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between gap-3 mb-3 px-1">
          <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${tone.accentText}`}>
            <Icon size={14} /> {tone.label}
            <span className="text-slate-500 font-medium ml-1 bg-slate-800/80 px-2 py-0.5 rounded-full">{selectedIds.length}/{descriptors.length}</span>
          </div>
          {descriptors.length > 0 ? (
            <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider">
              <button
                type="button"
                className={`${tone.accentText} opacity-70 hover:opacity-100 transition-opacity`}
                onClick={() => updateSelectionBucket(bucket, descriptors.map((item) => item.id))}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-300 transition-opacity"
                onClick={() => updateSelectionBucket(bucket, [])}
              >
                Clear
              </button>
            </div>
          ) : null}
        </div>

        {descriptors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700/60 p-6 text-sm text-slate-500 flex flex-col items-center justify-center text-center bg-slate-900/40">
            <Icon size={24} className="mb-3 opacity-20" />
            No {tone.label.toLowerCase()} available for this class binding.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {descriptors.map((descriptor) => {
              const isSelected = isDescriptorSelected(selectedIds, descriptor);
              return (
                <div
                  key={descriptor.id}
                  onClick={() => handleToggle(bucket === 'members' ? 'member' : bucket === 'statics' ? 'static' : 'function', descriptor.id)}
                  className={`group relative flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden
                    ${isSelected 
                      ? `${tone.accentBg} ${tone.accentBorder} ${tone.shadow} scale-[1.01]` 
                      : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600 opacity-80 hover:opacity-100'}
                  `}
                >
                  <div className={`flex-1 min-w-0 flex flex-col justify-center`}>
                    <span className={`text-sm font-semibold truncate transition-colors ${isSelected ? 'text-slate-100' : 'text-slate-300 group-hover:text-slate-200'}`}>{descriptor.label}</span>
                    {descriptor.detail ? <span className="text-[10px] text-slate-500 font-mono block truncate mt-0.5">{descriptor.detail}</span> : null}
                  </div>

                  <div className={`flex items-center justify-center w-5 h-5 rounded-full border transition-all duration-300 shrink-0
                    ${isSelected 
                      ? `${tone.accentFill} text-white border-transparent scale-100` 
                      : 'border-slate-600 text-transparent scale-90 delay-75'}
                  `}>
                    <Check size={12} className={isSelected ? 'scale-100 opacity-100' : 'scale-50 opacity-0'} style={{ transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full text-slate-300">
      <div className="mb-8 p-1 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide px-1">Bound Class</label>
          
          <div className="relative group">
            {data.binding ? (
              <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-slate-900/50 p-4 shadow-[0_4px_20px_rgba(6,182,212,0.1)] transition-all duration-300 hover:shadow-[0_4px_25px_rgba(6,182,212,0.15)] hover:border-cyan-400/50">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-base text-cyan-100 font-bold truncate tracking-tight">{data.binding.fullName}</div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-400 flex-wrap font-medium">
                      <span className="bg-slate-900/80 px-2 py-0.5 rounded text-slate-300 border border-slate-700/50">{data.binding.namespace || 'Global'}</span>
                      <span className="inline-flex items-center gap-1.5 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/50 text-cyan-400/80"><Layers3 size={12} /> {data.binding.imageName}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsBindingPickerOpen((prev) => !prev)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700 hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-300 transition-all text-xs font-semibold text-slate-300 ml-4 backdrop-blur-sm"
                  >
                    {isBindingPickerOpen ? 'Hide Picker' : 'Rebind'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-slate-900/50 p-5 shadow-[0_4px_20px_rgba(245,158,11,0.1)]">
                 <div className="flex items-center justify-between">
                   <div className="text-sm font-medium text-amber-200/90 leading-relaxed">
                     This node is not bound yet. <br/> <span className="text-amber-400/70 text-xs">Pick a concrete class below to configure the info payload.</span>
                   </div>
                   <button
                    type="button"
                    onClick={() => setIsBindingPickerOpen((prev) => !prev)}
                    className="shrink-0 px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-200 transition-all text-xs font-semibold shadow-sm"
                   >
                    {isBindingPickerOpen ? 'Close' : 'Select Class'}
                   </button>
                 </div>
              </div>
            )}
          </div>
        </div>

        {isBindingPickerOpen ? (
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 backdrop-blur-md overflow-hidden shadow-2xl relative">
            <div className="px-4 py-3 border-b border-slate-700/70 bg-slate-800/80 flex items-center gap-3 relative">
              <Search size={16} className="text-cyan-400 absolute left-4" />
              <input
                type="text"
                value={bindingSearchQuery}
                onChange={(event) => setBindingSearchQuery(event.target.value)}
                placeholder="Search classes by name, namespace, or assembly..."
                className="w-full bg-slate-950/50 border border-slate-700/50 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-cyan-500/50 focus:bg-slate-950 transition-all"
              />
            </div>
            <div className="max-h-72 overflow-y-auto p-2 space-y-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700/50 hover:[&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full pr-1">
              {filteredBindings.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-700/50 px-3 py-8 text-sm text-slate-500 text-center">
                  No classes found matching "<span className="text-slate-300">{bindingSearchQuery}</span>".
                </div>
              ) : (
                filteredBindings.map((entry) => (
                  <button
                    key={`${entry.imageId}::${entry.classId}`}
                    type="button"
                    className={`group w-full text-left p-3 rounded-lg border transition-all duration-200 hover:-translate-y-0.5
                      ${data.binding?.imageId === entry.imageId && data.binding?.classId === entry.classId 
                        ? 'border-cyan-500/50 bg-cyan-500/15 shadow-[0_2px_10px_rgba(6,182,212,0.15)]' 
                        : 'border-transparent hover:border-slate-600/50 hover:bg-slate-800/80 hover:shadow-md'}`}
                    onClick={() => handleBindClass(entry)}
                  >
                    <div className={`text-sm font-semibold truncate transition-colors ${data.binding?.classId === entry.classId ? 'text-cyan-100' : 'text-slate-200 group-hover:text-white'}`}>{entry.fullName}</div>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-500 flex-wrap">
                      <span className="bg-slate-950/50 px-1.5 py-0.5 rounded border border-slate-800">{entry.namespace || 'Global'}</span>
                      <span className="text-slate-700">•</span>
                      <span className="inline-flex items-center gap-1 text-slate-400 group-hover:text-cyan-400/70 transition-colors"><Layers3 size={10} /> {entry.imageName}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        <div 
          className={`relative rounded-xl border p-5 transition-all duration-300
                     ${isDragOverInput ? 'bg-cyan-500/10 border-cyan-400 border-dashed shadow-[0_0_25px_rgba(6,182,212,0.25)] scale-[1.01]' : 'bg-slate-900/80 border-slate-700/70 hover:border-slate-600'}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <label className="block text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider flex items-center justify-between">
            <span>Instance Address</span>
            {isDragOverInput && <span className="text-cyan-300 text-[10px] bg-cyan-500/20 border border-cyan-500/30 px-2.5 py-1 rounded-full animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.5)]">Drop item here to assign</span>}
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="e.g. 0x12345678 or drag instance ref here..."
              value={data.instanceAddress || ''}
              onChange={(e) => updateData({ instanceAddress: e.target.value })}
              className={`w-full bg-slate-950 border rounded-lg px-4 py-2.5 text-sm text-slate-200 outline-none transition-all font-mono
                         ${isDragOverInput ? 'border-cyan-400 ring-2 ring-cyan-500/20 bg-cyan-950/20' : 'border-slate-700 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'}`}
            />
          </div>
        </div>
      </div>

      <div className="font-medium text-sm text-slate-200 mb-3 px-1 border-b border-slate-700/50 pb-2 flex items-center justify-between gap-3">
        <span>Info Payload Selection</span>
        <span className="text-xs text-slate-500">{selectedCount}/{availableCount} selected</span>
      </div>
      
      <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          {!hasBinding ? (
              <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">
                    Bind a class first, then select which statics, members, and methods should be wrapped under the fixed <span className="text-cyan-400 font-mono">info</span> output payload.
              </div>
          ) : !hasSelectableInfo ? (
              <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">
                  This class has no exportable metadata categories available yet.
              </div>
          ) : null}

          {renderSelectionSection('statics', data.availableInfo.statics)}
                {renderSelectionSection('members', data.availableInfo.members)}
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
