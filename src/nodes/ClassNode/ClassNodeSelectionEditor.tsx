import React, { useMemo } from 'react';
import { Box, Check, CheckCheck, Code, User, XSquare } from 'lucide-react';
import type { INodeEditProps } from '../../core/studio/types';
import { useStudioRuntimeData } from '../../core/studio/runtimeData';
import { useExpressionDrag } from '../../core/studio/drag/ExpressionDragContext';
import { beginPointerExpressionDrag } from '../../core/studio/drag/expressionPointerDrag';
import { createExpressionReferenceDragPayload, createStaticExpressionSource } from '../../core/studio/expression';
import { reconcileClassInfoSelection, type ClassInfoItemDescriptor } from '../../domain/studio/editor';
import type { StableId } from '../../domain/contracts/shared-identity';
import type { ClassNodeData } from './classNodeModel';
import { toggleSelectionEntry } from './classNodeModel';

type SelectionBucketKey = 'members' | 'statics' | 'functions';

function isDescriptorSelected(ids: string[], descriptor: ClassInfoItemDescriptor) {
  return ids.includes(descriptor.id);
}

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

export const ClassNodeSelectionEditor: React.FC<INodeEditProps<ClassNodeData>> = ({ data, updateData }) => {
  const runtimeData = useStudioRuntimeData();
  const drag = useExpressionDrag();
  const resolvedCatalog = useMemo(
    () => runtimeData.getClassInfoCatalogByBinding(data.binding) ?? data.availableInfo,
    [data.availableInfo, data.binding, runtimeData],
  );
  const resolvedSelection = useMemo(
    () => reconcileClassInfoSelection(data.infoSelection, resolvedCatalog),
    [data.infoSelection, resolvedCatalog],
  );

  const handleToggle = (type: 'member' | 'static' | 'function', itemId: StableId) => {
    const listKey = type === 'member' ? 'members' : type === 'static' ? 'statics' : 'functions';
    updateData({
      infoSelection: {
        ...resolvedSelection,
        [listKey]: toggleSelectionEntry(resolvedSelection[listKey], itemId),
      },
    });
  };

  const updateSelectionBucket = (bucket: SelectionBucketKey, ids: StableId[]) => {
    updateData({
      infoSelection: {
        ...resolvedSelection,
        [bucket]: ids,
      },
    });
  };

  const hasBinding = Boolean(data.binding);
  const hasSelectableInfo =
    resolvedCatalog.members.length > 0 ||
    resolvedCatalog.statics.length > 0 ||
    resolvedCatalog.functions.length > 0;
  const availableCount =
    resolvedCatalog.members.length +
    resolvedCatalog.statics.length +
    resolvedCatalog.functions.length;
  const selectedCount =
    resolvedSelection.members.length +
    resolvedSelection.statics.length +
    resolvedSelection.functions.length;

  const renderSelectionSection = (bucket: SelectionBucketKey, descriptors: ClassInfoItemDescriptor[]) => {
    const tone = createSectionTone(bucket);
    const Icon = tone.icon;
    const selectedIds = resolvedSelection[bucket];

    return (
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between gap-3 mb-3 px-1">
          <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${tone.accentText}`}>
            <Icon size={14} /> {tone.label}
            <span className="text-slate-500 font-medium ml-1 bg-slate-800/80 px-2 py-0.5 rounded-full">{selectedIds.length}/{descriptors.length}</span>
          </div>
          {descriptors.length > 0 ? (
            <div className="flex items-center gap-1.5 text-slate-400">
              <button
                type="button"
                className={`p-1.5 rounded-md hover:bg-slate-800 ${tone.accentText} transition-all`}
                onClick={() => updateSelectionBucket(bucket, descriptors.map((item) => item.id))}
                title={`Select all ${tone.label}`}
              >
                <CheckCheck size={14} />
              </button>
              <div className="w-px h-3 bg-slate-700 mx-0.5"></div>
              <button
                type="button"
                className="p-1.5 rounded-md hover:bg-red-500/10 hover:text-red-400 transition-all"
                onClick={() => updateSelectionBucket(bucket, [])}
                title={`Clear all ${tone.label}`}
              >
                <XSquare size={14} />
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
            {descriptors.map((descriptor, index) => {
              const isSelected = isDescriptorSelected(selectedIds, descriptor);
              const canDragStaticAddress = bucket === 'statics' && Boolean(data.binding);

              return (
                <div
                  key={`${descriptor.id}-${index}`}
                  style={{ WebkitAppRegion: 'no-drag', userSelect: 'none' } as React.CSSProperties}
                  onMouseDown={(event) => {
                    if (!canDragStaticAddress || !data.binding) {
                      return;
                    }

                    beginPointerExpressionDrag(
                      event,
                      createExpressionReferenceDragPayload(
                        createStaticExpressionSource(
                          data.binding.classStableId,
                          descriptor.id as StableId,
                          `${data.binding.name}.${descriptor.label}`,
                        ),
                        'class-static-panel',
                      ),
                      drag,
                      { stopPropagation: true },
                    );
                  }}
                  onClick={() => handleToggle(bucket === 'members' ? 'member' : bucket === 'statics' ? 'static' : 'function', descriptor.id)}
                  className={`group relative flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden
                    ${canDragStaticAddress ? 'cursor-grab active:cursor-grabbing' : ''}
                    ${isSelected
                      ? `${tone.accentBg} ${tone.accentBorder} ${tone.shadow} scale-[1.01]`
                      : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600 opacity-80 hover:opacity-100'}
                  `}
                  title={canDragStaticAddress ? `Drag static reference ${data.binding?.name}.${descriptor.label}` : undefined}
                >
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
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
    <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/30 p-4 text-slate-300">
      <div className="font-medium text-sm text-slate-200 px-1 border-b border-slate-700/50 pb-2 flex items-center justify-between gap-3">
        <span>Info Payload Selection</span>
        <span className="text-xs text-slate-500">{selectedCount}/{availableCount} selected</span>
      </div>

      <div className="space-y-4">
        {!hasBinding ? (
          <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">
            Bind a class first, then select which statics, members, and methods should be wrapped under the fixed <span className="text-cyan-400 font-mono">info</span> output payload.
          </div>
        ) : !hasSelectableInfo ? (
          <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">
            This class has no exportable metadata categories available yet.
          </div>
        ) : null}

        {renderSelectionSection('statics', resolvedCatalog.statics)}
        {renderSelectionSection('members', resolvedCatalog.members)}
        {renderSelectionSection('functions', resolvedCatalog.functions)}
      </div>
    </div>
  );
};