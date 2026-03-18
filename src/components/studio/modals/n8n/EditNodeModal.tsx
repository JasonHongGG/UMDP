import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ArrowRight, Settings2, Box, LogIn, LogOut } from 'lucide-react';
import { useStudioGraph, useStudioUi } from '../../../../core/studio/StudioContext';
import { BaseNodeData, IPort } from '../../../../core/studio/types';
import { globalNodeRegistry } from '../../../../core/studio/NodeRegistry';

export function EditNodeModal() {
  const { nodes, edges, updateNodeData, updateNodePorts } = useStudioGraph();
  const { isEditModalOpen, closeEditModal, editingNodeId } = useStudioUi();
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftNodeName, setDraftNodeName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const node = useMemo(() => nodes.find(n => n.id === editingNodeId), [nodes, editingNodeId]);
  const nodeDef = useMemo(() => node ? globalNodeRegistry.get(node.type) : null, [node]);
  const resolvedNodeName = useMemo(() => {
    if (!node || !nodeDef) {
      return '';
    }

    const classBindingName = typeof node.data.binding === 'object' && node.data.binding && 'name' in node.data.binding
      ? String((node.data.binding as { name?: string }).name ?? '')
      : '';

    return (node.data.nodeName && node.data.nodeName.trim()) || classBindingName || nodeDef.displayName;
  }, [node, nodeDef]);

  // Derived state for the left column
  const incomingData = useMemo(() => {
    if (!node) return [];
    return edges
      .filter(e => e.targetNodeId === node.id)
      .map(e => {
        const sourceNode = nodes.find(n => n.id === e.sourceNodeId);
        const sourcePort = sourceNode?.data.outputs.find(p => p.id === e.sourcePortId);
        return { node: sourceNode, port: sourcePort };
      })
      .filter(d => d.node && d.port);
  }, [edges, nodes, node]);

  const EditComponent = nodeDef?.EditComponent;

  const handleUpdateData = (newData: Partial<BaseNodeData>) => {
    if (!node) {
      return;
    }

    updateNodeData(node.id, newData);
  };

  const handleUpdatePorts = (inputs: IPort[], outputs: IPort[]) => {
    if (!node) {
      return;
    }

    updateNodePorts(node.id, inputs, outputs);
  };

  const commitNodeName = () => {
    if (!node || !nodeDef) {
      return;
    }

    const trimmedName = draftNodeName.trim();
    const classBindingName = typeof node.data.binding === 'object' && node.data.binding && 'name' in node.data.binding
      ? String((node.data.binding as { name?: string }).name ?? '')
      : '';
    const fallbackName = classBindingName || nodeDef.displayName;

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
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={closeEditModal}
      />
      
      {/* Premium 3-Column Modal Container */}
      <div className="studio-modal-slide fixed inset-8 z-[70] bg-[#0a0f16]/95 backdrop-blur-2xl border border-slate-700/80 rounded-2xl shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
        
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
          <div className="w-64 bg-[#0a0f16] border-r border-slate-800 flex flex-col">
            <div className="h-10 border-b border-slate-800/80 flex items-center px-4 bg-slate-900/40">
                <LogIn size={14} className="text-slate-400 mr-2" />
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Input Data</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {incomingData.length === 0 ? (
                    <div className="text-center mt-10">
                        <div className="text-slate-600 text-sm mb-2">No incoming connections.</div>
                        <div className="text-slate-700 text-xs px-4">Connect other nodes to this node's input ports.</div>
                    </div>
                ) : (
                    incomingData.map((d, i) => (
                        <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 group cursor-grab active:cursor-grabbing hover:border-cyan-500/50 transition-colors">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-slate-300 truncate pr-2">{d.node?.type}</span>
                                <span className="text-[10px] text-cyan-500 bg-cyan-500/10 px-1.5 rounded">{d.port?.type}</span>
                            </div>
                            <div className="text-sm text-slate-200 font-mono truncate bg-slate-900/50 p-1.5 rounded border border-slate-800">
                                {d.port?.label}
                            </div>
                        </div>
                    ))
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
                {EditComponent ? (
                   <EditComponent 
                        nodeId={node.id} 
                        data={node.data} 
                        updateData={handleUpdateData}
                        updatePorts={handleUpdatePorts}
                   />
                ) : (
                   <div className="text-slate-500 text-center mt-20">This node has no configurable parameters.</div>
                )}
            </div>
          </div>

          {/* Right Column: Output Schema Preview */}
          <div className="w-72 bg-[#0a0f16] border-l border-slate-800 flex flex-col">
            <div className="h-10 border-b border-slate-800/80 flex items-center px-4 bg-slate-900/40">
                <LogOut size={14} className="text-slate-400 mr-2" />
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Output Schema</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                 {node.data.outputs.length === 0 ? (
                    <div className="text-center mt-10">
                        <div className="text-slate-600 text-sm">No configured outputs.</div>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {node.data.outputs.map((out: IPort) => (
                            <div key={out.id} className="flex items-center justify-between p-2 rounded hover:bg-slate-800/50 group">
                                <div className="flex items-center gap-2 overflow-hidden min-w-0">
                                  <ArrowRight size={14} className="text-cyan-500 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <span className="text-sm font-medium text-slate-300 truncate block group-hover:text-cyan-400 transition-colors">{out.label}</span>
                                    {renderPortSchema(out)}
                                  </div>
                                </div>
                                <span className="text-[10px] text-slate-500 uppercase flex-shrink-0 ml-2">{out.type}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
