import React from 'react';
import { useStudioNodeLayerState } from '../../../application/studio/useStudioNodeLayerState';
import { NodeWrapper } from './NodeWrapper';

export function NodeLayer() {
  const entries = useStudioNodeLayerState();

  return (
    // Needs pointer-events-none so we can still pan on the canvas beneath,
    // but the individual NodeWrapper re-enables pointer events.
    <div className="absolute inset-0 pointer-events-none w-full h-full">
      {entries.map(({ node, Component, inputs, outputs, executionState, executionSnapshot, isRunActive }) => {
        return (
          <NodeWrapper
            key={node.id}
            node={node}
            executionState={executionState}
            executionSnapshot={executionSnapshot}
            isRunActive={isRunActive}
          >
             <div className="pointer-events-auto">
               <Component
                 id={node.id}
                 data={node.data}
                 inputs={inputs}
                 outputs={outputs}
               />
             </div>
          </NodeWrapper>
        );
      })}
    </div>
  );
}
