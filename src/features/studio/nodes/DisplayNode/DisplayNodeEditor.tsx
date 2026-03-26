import React, { useMemo, useState } from 'react';
import { Search, ChevronRight, ChevronDown, List, Braces, AlignLeft, CircleDashed, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioQueryViewState } from '@/features/studio/application/useStudioQueryViewState';
import type { INodeEditProps } from '@/features/studio/core/types';
import type { DisplayNodeAvailableField, DisplayNodeQueryState } from '@/domain/studio/contracts';
import type { DisplayNodeData } from './displayNodeModel';
import { createDisplaySelectedField, syncDisplaySelectedField } from './displayNodeModel';

interface AvailableFieldTreeProps {
  field: DisplayNodeAvailableField;
  depth?: number;
  selectedFields: ReturnType<typeof syncDisplaySelectedField>[];
  onToggle: (field: DisplayNodeAvailableField) => void;
  onUpdateLabel: (field: DisplayNodeAvailableField, label: string) => void;
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
      return { border: 'border-emerald-500/20', bg: 'bg-emerald-500/10', text: 'text-emerald-300', icon: AlignLeft };
    case 'object':
      return { border: 'border-cyan-500/20', bg: 'bg-cyan-500/10', text: 'text-cyan-300', icon: Braces };
    case 'array':
      return { border: 'border-violet-500/20', bg: 'bg-violet-500/10', text: 'text-violet-300', icon: List };
    case 'null':
    default:
      return { border: 'border-slate-700', bg: 'bg-slate-800/80', text: 'text-slate-400', icon: CircleDashed };
  }
}

const AvailableFieldTree: React.FC<AvailableFieldTreeProps> = ({
  field,
  depth = 0,
  selectedFields,
  onToggle,
  onUpdateLabel
}) => {
  const selectedField = selectedFields.find(f => f.pathText === field.pathText);
  const isSelected = !!selectedField;
  
  const [isExpanded, setIsExpanded] = useState(depth < 1);
  const tone = valueTone(field.valueKind);
  const Icon = tone.icon;
  const hasChildren = field.children.length > 0;

  return (
    <div className="flex flex-col relative w-full">
      {depth > 0 && (
        <div 
          className="absolute left-[11px] top-[-8px] bottom-0 w-[1px] bg-slate-800/60"
          style={{ zIndex: 0 }}
        />
      )}
      
      <div 
        className={`relative z-10 flex flex-col group p-2 mb-0.5 rounded-xl transition-colors ${isSelected ? 'bg-cyan-500/5 hover:bg-cyan-500/10 border border-cyan-500/10' : 'hover:bg-slate-800/30 border border-transparent'}`}
      >
        <div 
          className="flex items-center gap-3 w-full cursor-pointer"
          onClick={() => hasChildren && setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              type="button"
              onClick={(e) => {
                if (hasChildren) {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }
              }}
              className={hasChildren ? "text-slate-500 hover:text-slate-300 transition-colors" : "text-transparent"}
              disabled={!hasChildren}
            >
              {hasChildren ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <ChevronRight size={14} />}
            </button>
            
            <div className={`flex items-center justify-center w-6 h-6 rounded-md ${tone.bg} ${tone.border} border shrink-0`}>
              <Icon size={14} className={tone.text} />
            </div>
            
            <div className="flex flex-col min-w-0 truncate">
              <span className={`text-sm font-medium truncate ${isSelected ? 'text-cyan-100' : 'text-slate-200'}`}>
                {field.label}
              </span>
              {field.pathText !== field.label && (
                <span className={`text-[10px] truncate ${isSelected ? 'text-cyan-500/60' : 'text-slate-500'}`}>{field.pathText}</span>
              )}
            </div>
          </div>

          <motion.button
            type="button"
            disabled={!field.selectable}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(field);
            }}
            whileHover={field.selectable ? { scale: 1.1 } : undefined}
            whileTap={field.selectable ? { scale: 0.85 } : undefined}
            className={`relative flex items-center justify-center shrink-0 w-8 h-8 rounded-xl focus:outline-none overflow-hidden transition-all duration-300 ${!field.selectable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isSelected ? 'bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.3)] border border-cyan-500/30' : 'bg-slate-800/40 hover:bg-slate-700/50 border border-slate-700/50'}`}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {isSelected ? (
                <motion.div
                  key="eye-on"
                  initial={{ opacity: 0, scale: 0.2, rotate: -45 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.2, rotate: 45 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  className="text-cyan-400"
                >
                  <Eye size={15} strokeWidth={2.5} />
                </motion.div>
              ) : (
                <motion.div
                  key="eye-off"
                  initial={{ opacity: 0, scale: 0.2, rotate: 45 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.2, rotate: -45 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  className="text-slate-500"
                >
                  <EyeOff size={15} />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {isSelected && (
                <motion.div
                  key="burst"
                  initial={{ scale: 0, opacity: 0.5 }}
                  animate={{ scale: 2.5, opacity: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="absolute inset-0 rounded-xl bg-cyan-400"
                />
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        <AnimatePresence>
          {isSelected && selectedField && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pl-[38px] pr-2 pb-1 pt-2 w-full max-w-sm">
                <div 
                  className="flex items-center gap-2 bg-slate-950/50 border border-slate-700/60 rounded-lg p-1.5 focus-within:border-cyan-500/50 focus-within:bg-slate-900/80 transition-colors shadow-inner cursor-text"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 pl-2">Label</span>
                  <input
                    type="text"
                    value={selectedField.label}
                    onChange={(e) => onUpdateLabel(field, e.target.value)}
                    className="flex-1 min-w-0 bg-transparent text-sm font-medium text-cyan-50 placeholder:text-slate-600 focus:outline-none px-2 py-0.5"
                    placeholder="Custom display label..."
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden ml-[11px] pl-3 border-l border-transparent"
          >
            <div className="pt-1 flex flex-col">
              {field.children.map((child) => (
                <AvailableFieldTree
                  key={child.id}
                  field={child}
                  depth={depth + 1}
                  selectedFields={selectedFields}
                  onToggle={onToggle}
                  onUpdateLabel={onUpdateLabel}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const DisplayNodeEditor: React.FC<INodeEditProps<DisplayNodeData>> = ({ nodeId, data, updateData }) => {
  const query = useStudioQueryViewState();
  const queryState = useMemo(
    () => query.getNodeQueryState<DisplayNodeQueryState>(nodeId) ?? createFallbackQueryState('Connect a payload source to start selecting fields.'),
    [nodeId, query],
  );

  const selectedFields = useMemo(
    () => (data.selectedFields ?? []).map((field) => syncDisplaySelectedField(field)),
    [data.selectedFields],
  );

  const [searchQuery, setSearchQuery] = useState('');

  const handleToggle = (field: DisplayNodeAvailableField) => {
    const existing = selectedFields.find(f => f.pathText === field.pathText);
    if (existing) {
      updateData({
        selectedFields: selectedFields.filter(f => f.id !== existing.id)
      });
    } else {
      updateData({
        selectedFields: [...selectedFields, createDisplaySelectedField(field.pathTokens, field.label)]
      });
    }
  };

  const handleUpdateLabel = (field: DisplayNodeAvailableField, newLabel: string) => {
    const existing = selectedFields.find(f => f.pathText === field.pathText);
    if (existing) {
      updateData({
        selectedFields: selectedFields.map(f => f.id === existing.id ? { ...f, label: newLabel } : f)
      });
    }
  };

  const queryMessage = queryState.issues[0]?.message ?? 'Connect a payload source to start selecting fields.';

  // A simple filter function
  const flattenAndFilterFields = (fields: DisplayNodeAvailableField[], queryStr: string): DisplayNodeAvailableField[] => {
    if (!queryStr) return fields;
    const lowerQuery = queryStr.toLowerCase();
    
    const result: DisplayNodeAvailableField[] = [];
    
    const traverse = (field: DisplayNodeAvailableField) => {
      const matches = field.label.toLowerCase().includes(lowerQuery) || field.pathText.toLowerCase().includes(lowerQuery);
      if (matches) {
        // Create a clone without children if we just want a flat search result
        result.push({ ...field, children: [] });
      }
      field.children.forEach(traverse);
    };
    
    fields.forEach(traverse);
    return result;
  };

  const displayedFields = flattenAndFilterFields(queryState.availableFields, searchQuery);

  return (
    <div className="p-1 w-full max-w-4xl mx-auto">
      <div className="flex flex-col rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-xl shadow-lg relative overflow-hidden h-[600px] w-full">
        {/* Glow effect */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
        
        <div className="p-5 border-b border-slate-800/60 bg-slate-900/50 z-10 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                <Search size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100 tracking-wide">Payload Fields</h3>
                <p className="text-sm text-slate-500 mt-0.5">Toggle fields to pin them natively onto the display canvas</p>
              </div>
            </div>
            {selectedFields.length > 0 && (
              <div className="shrink-0 flex items-center shadow-inner bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-800">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)] mr-2.5 animate-pulse" />
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">{selectedFields.length} Selected</span>
              </div>
            )}
          </div>
          
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <Search size={16} />
            </div>
            <input
              type="text"
              placeholder="Search in payload..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/60 border border-slate-700/60 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all font-mono shadow-inner"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
          <AnimatePresence mode="wait">
            {queryState.kind !== 'resolved' ? (
              <motion.div 
                key="empty-state"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center justify-center h-full text-center p-6"
              >
                <div className="w-16 h-16 rounded-full border border-dashed border-slate-700 flex items-center justify-center mb-4">
                  <span className="w-2 h-2 bg-slate-600 rounded-full animate-pulse" />
                </div>
                <div className="text-base font-medium text-slate-300">{queryMessage}</div>
                <div className="text-sm text-slate-500 mt-2 max-w-sm leading-relaxed">Ensure the upstream node is executed and outputs a valid JSON payload.</div>
              </motion.div>
            ) : displayedFields.length === 0 ? (
              <motion.div 
                key="no-results"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-400"
              >
                <Search size={32} className="mb-4 opacity-20" />
                <span className="text-base">No fields found</span>
              </motion.div>
            ) : (
              <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-0.5">
                {displayedFields.map((field) => (
                  <AvailableFieldTree
                    key={field.id}
                    field={field}
                    selectedFields={selectedFields}
                    onToggle={handleToggle}
                    onUpdateLabel={handleUpdateLabel}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      
      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(71, 85, 105, 0.3); border-radius: 20px; border: 2px solid transparent; background-clip: padding-box; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(71, 85, 105, 0.6); }
      `}</style>
    </div>
  );
};

export default DisplayNodeEditor;