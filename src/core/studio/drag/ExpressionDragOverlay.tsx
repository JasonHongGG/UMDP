import React from 'react';
import { useExpressionDrag } from './ExpressionDragContext';

const DRAG_PREVIEW_X_OFFSET = 4;

export function ExpressionDragOverlay() {
  const { activeExpressionDrag, expressionDragPosition } = useExpressionDrag();

  if (!activeExpressionDrag || !expressionDragPosition) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed z-[120] flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-[#06131d]/92 px-3 py-2 text-xs text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.18)]"
      style={{
        left: expressionDragPosition.x + DRAG_PREVIEW_X_OFFSET,
        top: expressionDragPosition.y,
        transform: 'translateY(-50%)',
      }}
    >
      {/* Removed the presentation badge (e.g., STATIC or INPUT tags) as requested for a cleaner UI */}
      <span>{activeExpressionDrag.source.displayText}</span>
    </div>
  );
}