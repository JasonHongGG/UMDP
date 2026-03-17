import React from 'react';
import { useStudioGraph } from '../../../core/studio/StudioContext';
import { globalNodeRegistry } from '../../../core/studio/NodeRegistry';
import { NodeWrapper } from './NodeWrapper';

export function NodeLayer() {
  const { nodes } = useStudioGraph();

  return (
    // Needs pointer-events-none so we can still pan on the canvas beneath,
    // but the individual NodeWrapper re-enables pointer events.
    <div className="absolute inset-0 pointer-events-none w-full h-full">
      {nodes.map(node => {
        const def = globalNodeRegistry.get(node.type);
        if (!def) return null;

        const Component = def.CanvasComponent;

        return (
          <NodeWrapper key={node.id} node={node}>
             <div className="pointer-events-auto">
               <Component id={node.id} data={node.data} />
             </div>
          </NodeWrapper>
        );
      })}
    </div>
  );
}
