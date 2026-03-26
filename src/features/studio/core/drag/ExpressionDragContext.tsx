import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ExpressionReferenceDragPayload } from '@/domain/studio/contracts';

export interface ExpressionDragState {
  activeExpressionDrag: ExpressionReferenceDragPayload | null;
  expressionDragPosition: { x: number; y: number } | null;
  beginExpressionDrag: (payload: ExpressionReferenceDragPayload, position: { x: number; y: number }) => void;
  updateExpressionDrag: (position: { x: number; y: number }) => void;
  endExpressionDrag: () => void;
}

const ExpressionDragContext = createContext<ExpressionDragState | null>(null);

export function ExpressionDragProvider({ children }: { children: React.ReactNode }) {
  const [activeExpressionDrag, setActiveExpressionDrag] = useState<ExpressionReferenceDragPayload | null>(null);
  const [expressionDragPosition, setExpressionDragPosition] = useState<{ x: number; y: number } | null>(null);

  const beginExpressionDrag = useCallback((payload: ExpressionReferenceDragPayload, position: { x: number; y: number }) => {
    setActiveExpressionDrag(payload);
    setExpressionDragPosition(position);
  }, []);

  const updateExpressionDrag = useCallback((position: { x: number; y: number }) => {
    setExpressionDragPosition(position);
  }, []);

  const endExpressionDrag = useCallback(() => {
    setActiveExpressionDrag(null);
    setExpressionDragPosition(null);
  }, []);

  const value = useMemo(() => ({
    activeExpressionDrag,
    expressionDragPosition,
    beginExpressionDrag,
    updateExpressionDrag,
    endExpressionDrag,
  }), [activeExpressionDrag, beginExpressionDrag, endExpressionDrag, expressionDragPosition, updateExpressionDrag]);

  return (
    <ExpressionDragContext.Provider value={value}>
      {children}
    </ExpressionDragContext.Provider>
  );
}

export function useExpressionDrag() {
  const context = useContext(ExpressionDragContext);
  if (!context) {
    throw new Error('useExpressionDrag must be used within an ExpressionDragProvider');
  }

  return context;
}