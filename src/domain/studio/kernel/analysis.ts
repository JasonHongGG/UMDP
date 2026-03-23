export interface AnalysisSession {
  status: 'detached' | 'attaching' | 'snapshot-loading' | 'ready' | 'error';
  processId: number | null;
  sessionKey: string | null;
  lastError: string | null;
}

export interface RuntimeSession {
  status: 'idle' | 'starting' | 'ready' | 'degraded' | 'recovering' | 'error';
  bridgeConnected: boolean;
  capabilityKeys: string[];
  lastError: string | null;
}

export function createInitialAnalysisSession(): AnalysisSession {
  return {
    status: 'detached',
    processId: null,
    sessionKey: null,
    lastError: null,
  };
}

export function createInitialRuntimeSession(): RuntimeSession {
  return {
    status: 'idle',
    bridgeConnected: false,
    capabilityKeys: [],
    lastError: null,
  };
}