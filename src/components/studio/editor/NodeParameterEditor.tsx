import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  createLiteralExpressionSource,
  getExpressionPresentation,
  getExpressionSourceDisplayValue,
  readExpressionDragData,
} from '../../../core/studio/expression';
import { useStudioExpressionDragState } from '../../../application/studio/useStudioExpressionDragState';
import type { ExpressionSource, ParameterDefinition } from '../../../domain/studio/contracts';
import type { BaseNodeData, INodeEditProps, StudioNodeDefinition } from '../../../core/studio/types';

interface NodeParameterEditorProps<T extends BaseNodeData> extends INodeEditProps<T> {
  nodeDef: StudioNodeDefinition;
}

interface FieldShellProps {
  label: string;
  required?: boolean;
  helperText?: string;
  children: React.ReactNode;
}

interface ExpressionFieldProps {
  definition: ParameterDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

interface ScalarFieldProps {
  definition: ParameterDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

function createEditorItemId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `editor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createDefaultFieldValue(definition: ParameterDefinition, index: number): unknown {
  if (definition.valueType === 'collection') {
    return [];
  }

  if (definition.expressionSupport !== 'disabled') {
    const defaultValue = definition.defaultValue;
    return createLiteralExpressionSource(typeof defaultValue === 'string' ? defaultValue : '');
  }

  if (definition.defaultValue !== undefined) {
    return definition.defaultValue;
  }

  if (definition.ui?.autoSequencePrefix) {
    return `${definition.ui.autoSequencePrefix}${index + 1}`;
  }

  if (definition.valueType === 'boolean') {
    return false;
  }

  if (definition.valueType === 'number') {
    return 0;
  }

  return '';
}

function createDefaultCollectionItem(definition: ParameterDefinition, index: number) {
  const collection = definition.ui?.collection;
  const item: Record<string, unknown> = {};

  collection?.fields.forEach((field) => {
    item[field.name] = createDefaultFieldValue(field, index);
  });

  if (collection?.identityKey && !item[collection.identityKey]) {
    item[collection.identityKey] = createEditorItemId();
  }

  return item;
}

function formatReadonlyValue(definition: ParameterDefinition, value: unknown) {
  if (definition.expressionSupport !== 'disabled') {
    return getExpressionSourceDisplayValue((value ?? null) as ExpressionSource | null);
  }

  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }

  if (value === null || value === undefined || value === '') {
    return 'Not set';
  }

  return String(value);
}

const FieldShell: React.FC<FieldShellProps> = ({ label, required, helperText, children }) => {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        <span>{label}</span>
        {required ? <span className="text-red-400">Required</span> : null}
      </div>
      {children}
      {helperText ? <div className="mt-1.5 text-xs text-slate-500">{helperText}</div> : null}
    </label>
  );
};

const ExpressionFieldInput: React.FC<ExpressionFieldProps> = ({ definition, value, onChange }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCustomDragOver, setIsCustomDragOver] = useState(false);
  const expressionValue = (value ?? null) as ExpressionSource | null;
  const { activeExpressionDrag, endExpressionDrag } = useStudioExpressionDragState();
  const presentation = getExpressionPresentation(expressionValue);

  return (
    <div
      className={`rounded-lg border transition-all ${(isDragOver || isCustomDragOver) ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_18px_rgba(6,182,212,0.18)]' : 'border-slate-700 bg-slate-950'}`}
      onMouseEnter={() => {
        if (activeExpressionDrag) {
          setIsCustomDragOver(true);
        }
      }}
      onMouseLeave={() => {
        setIsCustomDragOver(false);
      }}
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
      {/* Redesigned to be clean and minimal, without the complex special presentation header */}
      {definition.ui?.multiline ? (
        <textarea
          value={getExpressionSourceDisplayValue(expressionValue)}
          rows={definition.ui.rows ?? 3}
          placeholder={definition.ui?.placeholder}
          onChange={(event) => onChange(createLiteralExpressionSource(event.target.value))}
          readOnly={Boolean(activeExpressionDrag)}
          className="w-full resize-y rounded-lg bg-transparent px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-500"
        />
      ) : (
        <input
          type="text"
          value={getExpressionSourceDisplayValue(expressionValue)}
          placeholder={definition.ui?.placeholder}
          onChange={(event) => onChange(createLiteralExpressionSource(event.target.value))}
          readOnly={Boolean(activeExpressionDrag)}
          className="w-full rounded-lg bg-transparent px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-500"
        />
      )}
    </div>
  );
};

const ScalarFieldEditor: React.FC<ScalarFieldProps> = ({ definition, value, onChange }) => {
  if (definition.ui?.readOnly) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-300">
        {formatReadonlyValue(definition, value)}
      </div>
    );
  }

  if (definition.expressionSupport !== 'disabled') {
    return <ExpressionFieldInput definition={definition} value={value} onChange={onChange} />;
  }

  if (definition.valueType === 'boolean') {
    return (
      <button
        type="button"
        onClick={() => onChange(!Boolean(value))}
        className={`inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${Boolean(value) ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600'}`}
      >
        {Boolean(value) ? 'Enabled' : 'Disabled'}
      </button>
    );
  }

  if (definition.valueType === 'selection' && definition.options) {
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-500"
      >
        {definition.options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }

  if (definition.ui?.multiline || definition.valueType === 'json') {
    return (
      <textarea
        rows={definition.ui?.rows ?? 4}
        value={typeof value === 'string' ? value : JSON.stringify(value ?? '', null, 2)}
        placeholder={definition.ui?.placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
      />
    );
  }

  return (
    <input
      type={definition.valueType === 'number' ? 'number' : 'text'}
      value={definition.valueType === 'number' ? Number(value ?? 0) : String(value ?? '')}
      placeholder={definition.ui?.placeholder}
      onChange={(event) => onChange(definition.valueType === 'number' ? Number(event.target.value) : event.target.value)}
      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500"
    />
  );
};

function renderField<T extends BaseNodeData>(
  definition: ParameterDefinition,
  value: unknown,
  onChange: (nextValue: unknown) => void,
  scopeKey: string,
): React.ReactNode {
  const helperText = definition.ui?.helperText ?? definition.ui?.tooltip;
  const collection = definition.ui?.collection;

  if (definition.valueType === 'collection' && collection) {
    const items = Array.isArray(value) ? value as Record<string, unknown>[] : [];
    const minItems = collection.minItems ?? 0;
    const itemLabel = collection.itemLabel ?? definition.displayName;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-200">{definition.displayName}</div>
            {helperText ? <div className="text-xs text-slate-500">{helperText}</div> : null}
          </div>
          <button
            type="button"
            onClick={() => onChange([...items, createDefaultCollectionItem(definition, items.length)])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 transition-colors hover:border-amber-400/50 hover:bg-amber-500/15"
          >
            <Plus size={14} /> {collection.addLabel ?? 'Add Item'}
          </button>
        </div>

        {items.map((item, index) => {
          const itemKey = typeof item?.[collection.identityKey ?? 'id'] === 'string'
            ? String(item[collection.identityKey ?? 'id'])
            : `${scopeKey}-${index}`;

          return (
            <div key={itemKey} className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{itemLabel} {index + 1}</span>
                <button
                  type="button"
                  disabled={items.length <= minItems}
                  onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={12} /> Remove
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {collection.fields.map((field) => (
                  <div key={`${scopeKey}-${index}-${field.name}`}>
                    {renderField(
                      field,
                      item?.[field.name],
                      (nextValue) => onChange(items.map((entry, itemIndex) => itemIndex === index ? { ...entry, [field.name]: nextValue } : entry)),
                      `${scopeKey}.${index}.${field.name}`,
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <FieldShell label={definition.displayName} required={definition.required} helperText={helperText}>
      <ScalarFieldEditor definition={definition} value={value} onChange={onChange} />
    </FieldShell>
  );
}

export function NodeParameterEditor<T extends BaseNodeData>({ nodeDef, data, updateData }: NodeParameterEditorProps<T>) {
  const sections = useMemo(() => {
    const groups = new Map<string, ParameterDefinition[]>();

    nodeDef.manifest.parameters.forEach((parameter) => {
      const section = parameter.ui?.section ?? 'General';
      const entries = groups.get(section) ?? [];
      entries.push(parameter);
      groups.set(section, entries);
    });

    return Array.from(groups.entries());
  }, [nodeDef.manifest.parameters]);

  if (nodeDef.manifest.parameters.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-semibold text-slate-200">{nodeDef.manifest.displayName} Configuration</div>
        <div className="mt-1 text-xs text-slate-500">{nodeDef.manifest.description}</div>
      </div>

      {sections.map(([sectionName, fields]) => (
        <div key={sectionName} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{sectionName}</div>
          <div className="space-y-4">
            {fields.map((field) => (
              <div key={field.name}>
                {renderField(
                  field,
                  data[field.name],
                  (nextValue) => updateData({ [field.name]: nextValue } as Partial<T>),
                  field.name,
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default NodeParameterEditor;