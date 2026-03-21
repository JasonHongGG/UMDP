import React from 'react';
import { useStudioGraph, useStudioRuntime } from '../../../core/studio/StudioContext';
import { getNodePortsByDirection } from '../../../core/studio/NodeRegistry';
import { getRegisteredStudioNodeCatalog } from '../../../core/studio/catalog/studioNodeCatalogRuntime';
import { NodeWrapper } from './NodeWrapper';

export function NodeLayer() {
  const catalog = getRegisteredStudioNodeCatalog();
  const { nodes } = useStudioGraph();
  const { nodeStates, nodeSnapshots, activeRun } = useStudioRuntime();

  return (
    // Needs pointer-events-none so we can still pan on the canvas beneath,
    // but the individual NodeWrapper re-enables pointer events.
    <div className="absolute inset-0 pointer-events-none w-full h-full">
      {nodes.map(node => {
        const def = catalog.get(node.type);
        if (!def) return null;

        const Component = def.CanvasComponent;

        return (
          <NodeWrapper
            key={node.id}
            node={node}
            executionState={nodeStates[node.id] ?? 'idle'}
            executionSnapshot={nodeSnapshots[node.id] ?? null}
            isRunActive={activeRun?.status === 'running'}
          >
             <div className="pointer-events-auto">
               <Component
                 id={node.id}
                 data={node.data}
                 inputs={getNodePortsByDirection(def, 'input')}
                 outputs={getNodePortsByDirection(def, 'output')}
               />
             </div>
          </NodeWrapper>
        );
      })}
    </div>
  );
}
