import React, { useMemo } from 'react';
import { Eye, Plus, Search, Trash2 } from 'lucide-react';
import { useStudioQuery } from '../../core/studio/StudioContext';
import type { INodeEditProps } from '../../core/studio/types';
import type { DisplayNodeAvailableField, DisplayNodeQueryState } from '../../domain/studio/contracts';
import type { DisplayNodeData } from './displayNodeModel';
import { createDisplaySelectedField, syncDisplaySelectedField } from './displayNodeModel';

interface AvailableFieldTreeProps {
  field: DisplayNodeAvailableField;
  depth?: number;
  selectedPathTexts: Set<string>;
  onAdd: (field: DisplayNodeAvailableField) => void;
}

function createFallbackQueryState(message: string): DisplayNodeQueryState {
  return {
    kind: 'missing-edge',
    sourceKind: 'preview',
    sourceNodeId: null,
    sourcePortId: null,
    envelope: null,
    availableFields: [],
    selectedFields: [],
    issues: [{ severity: 'info', code: 'display.query.missing', message }],
  };
}

function valueTone(valueKind: DisplayNodeAvailableField['valueKind']) {
  switch (valueKind) {
    case 'primitive':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200';
    case 'object':
      return 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200';
    case 'array':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-200';
    case 'null':
    default:
      return 'border-slate-700 bg-slate-800/80 text-slate-300';
  }
}

const AvailableFieldTree: React.FC<AvailableFieldTreeProps> = ({
  field,
  depth = 0,
  selectedPathTexts,
  onAdd,
}) => {
  const isSelected = selectedPathTexts.has(field.pathText);

  return (
    <div className="space-y-2">
      <div
        className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"
        style={{ marginLeft: depth * 14 }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-slate-100 truncate">{field.label}</div>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${valueTone(field.valueKind)}`}>
                {field.valueKind}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500 break-all">{field.pathText}</div>
            <div className="mt-2 text-xs text-slate-300 break-words">{field.previewText}</div>
          </div>
          <button
            type="button"
            disabled={!field.selectable || isSelected}
            onClick={() => onAdd(field)}
            className="shrink-0 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-200 transition-colors hover:border-cyan-400/60 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500"
          >
            {isSelected ? 'Added' : 'Add'}
          </button>
        </div>
      </div>

      {field.children.length > 0 ? (
        <div className="space-y-2">
          {field.children.map((child) => (
            <AvailableFieldTree
              key={child.id}
              field={child}
              depth={depth + 1}
              selectedPathTexts={selectedPathTexts}
              onAdd={onAdd}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const DisplayNodeEditor: React.FC<INodeEditProps<DisplayNodeData>> = ({ nodeId, data, updateData }) => {
  const query = useStudioQuery();
  const queryState = useMemo(
    () => query.getNodeQueryState<DisplayNodeQueryState>(nodeId) ?? createFallbackQueryState('Connect a payload source to start selecting fields.'),
    [nodeId, query],
  );

  const selectedFields = useMemo(
    () => (data.selectedFields ?? []).map((field) => syncDisplaySelectedField(field)),
    [data.selectedFields],
  );
  const selectedPathTexts = useMemo(
    () => new Set(selectedFields.map((field) => field.pathText)),
    [selectedFields],
  );

  const addField = (field: DisplayNodeAvailableField) => {
    if (selectedPathTexts.has(field.pathText)) {
      return;
    }

    updateData({
      selectedFields: [...selectedFields, createDisplaySelectedField(field.pathTokens, field.label)],
    });
  };

  const updateSelectedField = (fieldId: string, label: string) => {
    updateData({
      selectedFields: selectedFields.map((field) => (
        field.id === fieldId ? { ...field, label } : field
      )),
    });
  };

  const removeSelectedField = (fieldId: string) => {
    updateData({
      selectedFields: selectedFields.filter((field) => field.id !== fieldId),
    });
  };

  const queryMessage = queryState.issues[0]?.message ?? 'Connect a payload source to start selecting fields.';

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Search size={16} className="text-cyan-300" />
          <span>Payload Fields</span>
        </div>
        <div className="text-xs text-slate-500">Display node 只會吃一份 payload。從這裡選你要顯示在節點上的欄位。</div>

        {queryState.kind !== 'resolved' ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">
            {queryMessage}
          </div>
        ) : queryState.availableFields.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">
            Current payload has no selectable fields.
          </div>
        ) : (
          <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
            {queryState.availableFields.map((field) => (
              <AvailableFieldTree
                key={field.id}
                field={field}
                selectedPathTexts={selectedPathTexts}
                onAdd={addField}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Eye size={16} className="text-cyan-300" />
          <span>Selected Fields</span>
        </div>
        <div className="text-xs text-slate-500">你選的欄位會直接顯示在 Display node 主畫面上。Label 可以自訂，path 由 payload 決定。</div>

        {selectedFields.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-950/70 text-slate-400">
              <Plus size={18} />
            </div>
            Add one or more payload fields from the left panel.
          </div>
        ) : (
          <div className="space-y-3">
            {selectedFields.map((field) => (
              <div key={field.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">Path</div>
                    <div className="mt-1 text-sm text-slate-300 break-all">{field.pathText}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSelectedField(field.id)}
                    className="rounded-lg border border-slate-700 bg-slate-900/70 p-2 text-slate-400 transition-colors hover:border-red-500/40 hover:text-red-300"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <label className="block">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Label</div>
                  <input
                    type="text"
                    value={field.label}
                    onChange={(event) => updateSelectedField(field.id, event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
                    placeholder="Field label"
                  />
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DisplayNodeEditor;