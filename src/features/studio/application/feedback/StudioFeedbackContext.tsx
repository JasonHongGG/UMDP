import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type StudioFeedbackTone = 'info' | 'success' | 'warning' | 'error';

export interface StudioFeedbackMessage {
  tone: StudioFeedbackTone;
  title: string;
  description: string;
  updatedAt: number;
}

interface StudioFeedbackContextValue {
  documentFeedback: StudioFeedbackMessage | null;
  runtimeFeedback: StudioFeedbackMessage | null;
  reportDocumentFeedback: (message: Omit<StudioFeedbackMessage, 'updatedAt'> | null) => void;
  reportRuntimeFeedback: (message: Omit<StudioFeedbackMessage, 'updatedAt'> | null) => void;
  clearRuntimeFeedback: () => void;
  clearDocumentFeedback: () => void;
}

const noop = () => undefined;

const StudioFeedbackContext = createContext<StudioFeedbackContextValue>({
  documentFeedback: null,
  runtimeFeedback: null,
  reportDocumentFeedback: noop,
  reportRuntimeFeedback: noop,
  clearRuntimeFeedback: noop,
  clearDocumentFeedback: noop,
});

function toFeedbackMessage(message: Omit<StudioFeedbackMessage, 'updatedAt'> | null) {
  return message ? { ...message, updatedAt: Date.now() } : null;
}

export function StudioFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [documentFeedback, setDocumentFeedback] = useState<StudioFeedbackMessage | null>(null);
  const [runtimeFeedback, setRuntimeFeedback] = useState<StudioFeedbackMessage | null>(null);

  const reportDocumentFeedback = useCallback((message: Omit<StudioFeedbackMessage, 'updatedAt'> | null) => {
    setDocumentFeedback(toFeedbackMessage(message));
  }, []);

  const reportRuntimeFeedback = useCallback((message: Omit<StudioFeedbackMessage, 'updatedAt'> | null) => {
    setRuntimeFeedback(toFeedbackMessage(message));
  }, []);

  const clearRuntimeFeedback = useCallback(() => {
    setRuntimeFeedback(null);
  }, []);

  const clearDocumentFeedback = useCallback(() => {
    setDocumentFeedback(null);
  }, []);

  const value = useMemo(() => ({
    documentFeedback,
    runtimeFeedback,
    reportDocumentFeedback,
    reportRuntimeFeedback,
    clearRuntimeFeedback,
    clearDocumentFeedback,
  }), [clearDocumentFeedback, clearRuntimeFeedback, documentFeedback, reportDocumentFeedback, reportRuntimeFeedback, runtimeFeedback]);

  return (
    <StudioFeedbackContext.Provider value={value}>
      {children}
    </StudioFeedbackContext.Provider>
  );
}

export function useStudioFeedback() {
  return useContext(StudioFeedbackContext);
}