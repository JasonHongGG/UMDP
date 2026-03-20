import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ArrowRight, Settings2, Box, LogIn, LogOut, ChevronRight, ChevronDown, Braces, AlignLeft, Hash, ToggleLeft } from 'lucide-react';
import { useStudioGraph, useStudioQuery, useStudioUi } from '../../../../core/studio/StudioContext';
import { BaseNodeData, IPort, StudioNode } from '../../../../core/studio/types';
import { getNodePortsByDirection, getStudioNodePort, globalNodeRegistry } from '../../../../core/studio/NodeRegistry';
import { beginPointerExpressionDrag } from '../../../../core/studio/drag/expressionPointerDrag';
import { useExpressionDrag } from '../../../../core/studio/drag/ExpressionDragContext';
import { createExpressionReferenceDragPayload, createInputExpressionSource } from '../../../../core/studio/expression';
import { NodeParameterEditor } from '../../editor/NodeParameterEditor';
import type { CallFunctionClassInfoQueryState } from '../../../../domain/studio/contracts';

// --- Helper for Draggable JSON Tree ---
interface JsonTreeProps {
  data: any;
  path: string;
  depth?: number;
  sourceNode: StudioNode;
  sourcePortId: string;
}
const JsonDraggableTreeItem: React.FC<JsonTreeProps> = ({ data, path, depth = 0, sourceNode, sourcePortId }) => {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const expressionDrag = useExpressionDrag();
  
  const isObject = data !== null && typeof data === 'object' && !Array.isArray(data);
  const isArray = Array.isArray(data);
  const isPrimitive = !isObject && !isArray;

  const buildDragPayload = () => {
    const pathSegments = path ? path.split('.') : [];
    const displayText = pathSegments.length > 0
      ? `${sourceNode.data.nodeName || sourceNode.id}.${sourcePortId}.${pathSegments.join('.')}`
      : `${sourceNode.data.nodeName || sourceNode.id}.${sourcePortId}`;

    return createExpressionReferenceDragPayload(
      createInputExpressionSource(sourceNode.id, sourcePortId, pathSegments, displayText),
      'input-panel',
    );
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    if ((event.target as HTMLElement | null)?.closest('button')) {
      return;
    }
    beginPointerExpressionDrag(event, buildDragPayload(), expressionDrag);
  };
  const getPrimitiveIcon = (val: any) => {
    if (typeof val === 'string') return <AlignLeft size={10} className="text-amber-400" />;
    if (typeof val === 'number') return <Hash size={10} className="text-blue-400" />;
    if (typeof val === 'boolean') return <ToggleLeft size={10} className="text-pink-400" />;
    return <Box size={10} className="text-slate-500" />;
  };

  const currentKey = path.split('.').pop() || '';

  if (isPrimitive) {
    return (
      <div 
        onMouseDown={handleMouseDown}
        className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-800/80 cursor-grab active:cursor-grabbing group transition-colors ml-4"
        style={{ WebkitAppRegion: 'no-drag', userSelect: 'none' } as any}
      >
        <span className="shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">{getPrimitiveIcon(data)}</span>
        <span className="text-xs text-slate-300 font-medium tracking-wide">{currentKey || 'root'}</span>
        <span className="text-slate-600 text-[10px] mx-1">:</span>
        <span className="text-xs font-mono text-cyan-200/80 truncate">{String(data)}</span>
      </div>
    );
  }

  const items = isObject ? Object.entries(data) : (data as any[]).map((val, idx) => [String(idx), val]);

  return (
    <div className="flex flex-col">
      <div 
        onMouseDown={handleMouseDown}
        className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-slate-800/80 cursor-grab active:cursor-grabbing group transition-colors"
        style={{ WebkitAppRegion: 'no-drag', userSelect: 'none' } as any}
      >
        <button 
           type="button" 
           onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
           className="w-4 h-4 flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors shrink-0"
        >
          {items.length > 0 ? (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <div className="w-1 h-1 rounded-full bg-slate-700" />}
        </button>
        <Braces size={10} className={isObject ? "text-purple-400 opacity-80" : "text-emerald-400 opacity-80"} />
        <span className="text-xs text-slate-300 font-medium tracking-wide">{currentKey || (depth === 0 ? 'root' : '')}</span>
        {items.length > 0 && (
           <span className="text-[9px] text-slate-600 font-mono ml-1">
             {isArray ? `[${items.length}]` : `{${items.length}}`}
           </span>
        )}
      </div>
      
      {isExpanded && items.length > 0 && (
        <div className="ml-3 border-l border-slate-700/50 pl-1 space-y-0.5 mt-0.5">
          {items.map(([key, val]) => (
            <JsonDraggableTreeItem 
              key={key} 
              data={val} 
              path={path ? `${path}.${key}` : key} 
              depth={depth + 1} 
              sourceNode={sourceNode}
              sourcePortId={sourcePortId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export function EditNodeModal() {
  const { nodes, edges, updateNodeData } = useStudioGraph();
  const { isEditModalOpen, closeEditModal, editingNodeId } = useStudioUi();
  const query = useStudioQuery();
  const expressionDrag = useExpressionDrag();
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftNodeName, setDraftNodeName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const node = useMemo(() => nodes.find(n => n.id === editingNodeId), [nodes, editingNodeId]);
  const nodeDef = useMemo(() => node ? globalNodeRegistry.get(node.type) : null, [node]);
  const resolvedNodeName = useMemo(() => {
    if (!node || !nodeDef) {
      return '';
    }

    return (node.data.nodeName && node.data.nodeName.trim())
      || nodeDef.resolveDisplayName?.(node.data)
      || nodeDef.manifest.displayName;
  }, [node, nodeDef]);

  const inputBindingStates = useMemo(() => node ? query.getNodeInputBindingStates(node.id) : [], [node, query]);
  const callFunctionInputState = useMemo(
    () => node?.type === 'call-function'
      ? query.getNodeQueryState<CallFunctionClassInfoQueryState>(node.id)
      : null,
    [node, query],
  );
  const liveQuerySnapshot = useMemo(() => node ? query.getNodeSnapshot(node.id) : null, [node, query]);

  const liveOutputPreview = useMemo(() => {
    if (!node) {
      return null;
    }

    return query.getNodeOutputPreview(node.id);
  }, [node, query]);

  const snapshotOriginLabel = useMemo(() => {
    if (!liveQuerySnapshot) {
      return null;
    }

    return liveQuerySnapshot.originKind === 'runtime' ? 'runtime' : 'preview';
  }, [liveQuerySnapshot]);

  const snapshotPhaseLabel = useMemo(() => {
    if (!liveQuerySnapshot) {
      return null;
    }

    switch (liveQuerySnapshot.phase) {
      case 'running':
        return 'running';
      case 'execute':
        return 'executed';
      case 'materialize':
      default:
        return 'materialized';
    }
  }, [liveQuerySnapshot]);

  const EditComponent = nodeDef?.EditComponent;
  const EditFooterComponent = nodeDef?.EditFooterComponent;
  const hasParameterSchema = (nodeDef?.manifest.parameters.length ?? 0) > 0;

  const handleUpdateData = (newData: Partial<BaseNodeData>) => {
    if (!node) {
      return;
    }

    updateNodeData(node.id, newData);
  };

  const commitNodeName = () => {
    if (!node || !nodeDef) {
      return;
    }

    const trimmedName = draftNodeName.trim();
    const fallbackName = nodeDef.resolveDisplayName?.(node.data) || nodeDef.manifest.displayName;

    updateNodeData(node.id, {
      nodeName: trimmedName && trimmedName !== fallbackName ? trimmedName : undefined,
    });
    setIsEditingName(false);
  };

  useEffect(() => {
    setDraftNodeName(resolvedNodeName);
    setIsEditingName(false);
  }, [resolvedNodeName, node?.id]);

  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditingName]);

  const nodeOutputs = useMemo(() => nodeDef ? getNodePortsByDirection(nodeDef, 'output') : [], [nodeDef]);

  if (!isEditModalOpen || !node || !nodeDef) return null;

  const renderPortSchema = (port: IPort) => {
    if (port.type !== 'json' || !port.schema) return null;

    return (
      <div className="text-[10px] text-slate-500 mt-1 font-mono truncate">
        {port.schema.id}@v{port.schema.version}
      </div>
    );
  };

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-200 ${
        isEditModalOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onDragOver={(e) => {
        // Prevent the default "forbidden" cursor across the whole modal
        // to make the drag experience feel much better!
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault(); // If dropped on empty modal space, do nothing
      }}
      onClick={closeEditModal} // Close modal if clicking on the backdrop
    >  
      {/* Premium 3-Column Modal Container */}
      <div 
        className="studio-modal-slide fixed inset-8 z-[70] bg-[#0a0f16]/95 backdrop-blur-2xl border border-slate-700/80 rounded-2xl shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()} // Prevent clicks inside the modal from closing it
        onDragOver={(e) => {
          // IMPORTANT: Native drag within the modal itself needs this to avoid the forbidden cursor
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => e.preventDefault()}
      >
        
        {/* Header */}
        <div className="h-14 border-b border-slate-700/50 bg-slate-900/50 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded bg-cyan-500/20 flex items-center justify-center">
                 <nodeDef.icon size={18} className="text-cyan-400" />
             </div>
             <div>
                 {isEditingName ? (
                   <input
                     ref={nameInputRef}
                     type="text"
                     value={draftNodeName}
                     onChange={(event) => setDraftNodeName(event.target.value)}
                     onBlur={commitNodeName}
                     onKeyDown={(event) => {
                       if (event.key === 'Enter') {
                         event.preventDefault();
                         commitNodeName();
                       }

                       if (event.key === 'Escape') {
                         event.preventDefault();
                         setDraftNodeName(resolvedNodeName);
                         setIsEditingName(false);
                       }
                     }}
                     className="bg-transparent border-b border-cyan-500/50 text-slate-100 font-semibold text-lg leading-tight outline-none focus:border-cyan-400 min-w-[16rem]"
                   />
                 ) : (
                   <h2
                     className="text-slate-100 font-semibold text-lg leading-tight cursor-text"
                     onDoubleClick={() => setIsEditingName(true)}
                     title="Double click to rename node"
                   >
                     {resolvedNodeName}
                   </h2>
                 )}
                 <p className="text-slate-500 text-xs">{node.id}</p>
             </div>
          </div>
          
          <button 
            onClick={closeEditModal}
            className="w-8 h-8 rounded-md bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 3-Column Body */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Default to n8n column layout. */}
          
          {/* Left Column: Input Data */}
          <div className="w-80 bg-[#0a0f16] border-r border-slate-800 flex flex-col">
            <div className="h-10 border-b border-slate-800/80 flex items-center px-4 bg-slate-900/40">
                <LogIn size={14} className="text-slate-400 mr-2" />
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Input Data</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {inputBindingStates.length === 0 ? (
                    <div className="text-center mt-10">
                        <div className="text-slate-600 text-sm mb-2">No incoming connections.</div>
                        <div className="text-slate-700 text-xs px-4">Connect other nodes to this node's input ports.</div>
                    </div>
                ) : (
                    inputBindingStates.map((bindingState) => {
                      if (bindingState.sources.length === 0) {
                        return (
                          <div key={bindingState.port.id} className="bg-[#0f172a] border border-slate-800/80 rounded-xl overflow-hidden shadow-sm flex flex-col">
                            <div className="p-2.5 border-b border-slate-700/60 bg-slate-800/40 flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] font-bold text-slate-400 uppercase tracking-wider">{bindingState.port.type}</div>
                                <span className="text-xs font-bold text-slate-200 truncate">{bindingState.port.label}</span>
                              </div>
                            </div>
                            <div className="p-3 bg-[#0a0f16]">
                              <div className="text-[11px] text-slate-600 italic bg-slate-900/40 p-3 rounded border border-slate-800/50">
                                {bindingState.issues[0]?.message ?? 'No input bound.'}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return bindingState.sources.map((source, sourceIndex) => {
                        const sourceNodeDef = source.sourceNode ? globalNodeRegistry.get(source.sourceNode.type) : null;
                        const resolvedPayload = source.payload ?? { _notice: bindingState.issues[0]?.message ?? 'No payload preview available. Connect and execute to view structural data.' };

                        return (
                        <div key={`${bindingState.port.id}:${source.edge.id}:${sourceIndex}`} className="bg-[#0f172a] border border-slate-700/60 rounded-xl overflow-hidden shadow-sm flex flex-col group/card hover:border-slate-600 transition-colors">
                            <div 
                              onMouseDown={(event) => {
                                if (event.button !== 0 || !source.sourceNode || !source.sourcePort) {
                                  return;
                                }

                                beginPointerExpressionDrag(
                                  event,
                                  createExpressionReferenceDragPayload(
                                  createInputExpressionSource(
                                    source.sourceNode.id,
                                    source.sourcePort.id,
                                    [],
                                    `${source.sourceNode.data.nodeName || source.sourceNode.id}.${source.sourcePort.id}`,
                                  ),
                                  'input-panel',
                                  ),
                                  expressionDrag,
                                );
                              }}
                              className="p-2.5 border-b border-slate-700/60 bg-slate-800/60 hover:bg-slate-800 flex items-center justify-between cursor-grab active:cursor-grabbing transition-colors"
                              title="Drag to reference entire object"
                              style={{ WebkitAppRegion: 'no-drag', userSelect: 'none' } as any}
                            >
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-md bg-slate-900 flex items-center justify-center border border-slate-700 shrink-0">
                                    {sourceNodeDef?.icon ? React.createElement(sourceNodeDef.icon as any, { size: 10, className: "text-slate-400" }) : <Box size={10} className="text-slate-400" />}
                                  </div>
                                  <span className="text-xs font-bold text-slate-200 truncate">
                                    {source.sourceNode?.data.nodeName || sourceNodeDef?.manifest.displayName || source.sourceNode?.type}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-500 font-medium">{bindingState.port.label}</span>
                                </div>
                            </div>
                            <div className="p-3 overflow-x-auto bg-[#0a0f16] flex-1">
                                <div className="flex items-center gap-3 mb-2 ml-1 opacity-70">
                                  <div className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] font-bold text-slate-400 uppercase tracking-wider">{source.sourcePort?.type || 'JSON'}</div>
                                  <span className="text-[10px] text-slate-500 font-medium truncate">{source.sourcePort?.label}</span>
                                </div>
                                <div className="pl-1">
                                  <JsonDraggableTreeItem 
                                    data={resolvedPayload} 
                                    path="" 
                                    sourceNode={source.sourceNode!} 
                                    sourcePortId={source.sourcePort!.id} 
                                  />
                                </div>
                            </div>
                        </div>
                      );
                      });
                    })
                )}
            </div>
          </div>

          {/* Center Column: Node Configuration */}
          <div className="flex-1 flex flex-col bg-[#0d141f]">
             <div className="h-10 border-b border-slate-800/80 flex items-center px-6 bg-slate-900/40">
                <Settings2 size={14} className="text-slate-400 mr-2" />
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Parameters</span>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
                {EditComponent || hasParameterSchema || EditFooterComponent ? (
                  <div className="space-y-6">
                    {EditComponent ? (
                      <EditComponent 
                        nodeId={node.id} 
                        data={node.data} 
                        updateData={handleUpdateData}
                      />
                    ) : null}
                    {hasParameterSchema ? (
                      <NodeParameterEditor
                        nodeId={node.id}
                        data={node.data}
                        updateData={handleUpdateData}
                        nodeDef={nodeDef}
                      />
                    ) : null}
                    {EditFooterComponent ? (
                      <EditFooterComponent
                        nodeId={node.id}
                        data={node.data}
                        updateData={handleUpdateData}
                      />
                    ) : null}
                  </div>
                ) : (
                   <div className="text-slate-500 text-center mt-20">This node has no configurable parameters.</div>
                )}
            </div>
          </div>

          {/* Right Column: Output Schema & Payload Preview */}
          <div className="w-96 bg-[#0a0f16] border-l border-slate-800 flex flex-col">
            <div className="h-10 border-b border-slate-800/80 flex items-center px-4 bg-slate-900/40">
                <LogOut size={14} className="text-slate-400 mr-2" />
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Output</span>
                {liveQuerySnapshot ? (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider bg-slate-900/80 px-1.5 py-0.5 rounded">
                      {snapshotOriginLabel}
                    </span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider bg-slate-900/80 px-1.5 py-0.5 rounded">
                      {snapshotPhaseLabel}
                    </span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider bg-slate-900/80 px-1.5 py-0.5 rounded">
                      {liveQuerySnapshot.status}
                    </span>
                  </div>
                ) : null}
            </div>
            
            <div className="flex-1 overflow-y-auto w-full p-4">
                 {nodeOutputs.length === 0 ? (
                    <div className="text-center mt-6 mb-6">
                        <div className="text-slate-600 text-sm">No configured outputs.</div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {nodeOutputs.map((out: IPort) => {
                           const portPreview = liveOutputPreview?.[out.id];
                           
                           return (
                            <div key={out.id} className="flex flex-col rounded-xl border border-slate-800 overflow-hidden bg-slate-900/20">
                                {/* Port Header */}
                                <div className="flex items-center justify-between p-3 bg-slate-800/30 border-b border-slate-800/60">
                                    <div className="flex items-center gap-2 overflow-hidden min-w-0">
                                      <ArrowRight size={14} className="text-cyan-500 flex-shrink-0" />
                                      <div className="min-w-0">
                                        <span className="text-sm font-semibold text-slate-200 truncate block transition-colors">{out.label}</span>
                                        {renderPortSchema(out)}
                                      </div>
                                    </div>
                                    <span className="text-[10px] text-slate-500 uppercase flex-shrink-0 ml-2 font-medium tracking-wider bg-slate-900/80 px-1.5 py-0.5 rounded">{out.type}</span>
                                </div>
                                
                                {/* Port Payload Preview */}
                                <div className="p-3 bg-[#0a0f16] max-h-64 overflow-y-auto">
                                    {liveQuerySnapshot?.errorMessage ? (
                                      <div className="text-[10px] text-rose-300/90 bg-rose-500/10 border border-rose-500/20 rounded px-2 py-1.5 mb-2">
                                        {liveQuerySnapshot.errorMessage}
                                      </div>
                                    ) : null}
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 block">Payload Preview</span>
                                    {portPreview ? (
                                        <pre className="text-[11px] leading-relaxed text-cyan-200/90 font-mono whitespace-pre-wrap break-all bg-slate-950/50 p-3 rounded-lg border border-slate-800/80">
                                            {JSON.stringify(portPreview.payload, null, 2)}
                                        </pre>
                                    ) : (
                                        <div className="text-[11px] text-slate-600 italic bg-slate-900/40 p-3 rounded border border-slate-800/50">
                                        {node.type === 'call-function' && out.id === 'result-out'
                                          ? (callFunctionInputState?.issues[0]?.message ?? 'No payload mapped or generated yet.')
                                          : 'No payload mapped or generated yet.'}
                                        </div>
                                    )}
                                </div>
                            </div>
                           );
                        })}
                    </div>
                )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
