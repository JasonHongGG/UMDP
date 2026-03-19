import React from 'react';
import { useExpressionDrag } from './ExpressionDragContext';
import { getExpressionPresentation } from '../expression';

const DRAG_PREVIEW_X_OFFSET = 4;

export function ExpressionDragOverlay() {
  const { activeExpressionDrag, expressionDragPosition } = useExpressionDrag();

  if (!activeExpressionDrag || !expressionDragPosition) {
    return null;
  }

  const presentation = getExpressionPresentation(activeExpressionDrag.source);

  return (
    <div
      className="pointer-events-none fixed z-[120] flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-[#06131d]/92 px-3 py-2 text-xs text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.18)]"
      style={{
        left: expressionDragPosition.x + DRAG_PREVIEW_X_OFFSET,
        top: expressionDragPosition.y,
        transform: 'translateY(-50%)',
      }}
    >
      {presentation ? (
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider ${presentation.badgeClassName}`}>
          {presentation.badgeText}
        </span>
      ) : null}
      <span>{activeExpressionDrag.source.displayText}</span>
    </div>
  );
}