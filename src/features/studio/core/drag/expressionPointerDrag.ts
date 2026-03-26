import type React from 'react';
import type { ExpressionReferenceDragPayload } from '@/domain/studio/contracts';
import type { ExpressionDragState } from './ExpressionDragContext';

type ExpressionDragController = Pick<ExpressionDragState, 'beginExpressionDrag' | 'updateExpressionDrag' | 'endExpressionDrag'>;

export function beginPointerExpressionDrag(
  event: React.MouseEvent<HTMLElement>,
  payload: ExpressionReferenceDragPayload,
  drag: ExpressionDragController,
  options?: { stopPropagation?: boolean },
) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  if (options?.stopPropagation) {
    event.stopPropagation();
  }

  drag.beginExpressionDrag(payload, { x: event.clientX, y: event.clientY });

  const handleMouseMove = (moveEvent: MouseEvent) => {
    drag.updateExpressionDrag({ x: moveEvent.clientX, y: moveEvent.clientY });
  };

  const handleMouseUp = () => {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);

    requestAnimationFrame(() => {
      drag.endExpressionDrag();
    });
  };

  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp, { once: true });
}