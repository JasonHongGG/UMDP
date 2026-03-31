export interface ExecutionState {
  isExecuting: boolean;
}

export function createExecutionState(): ExecutionState {
  return {
    isExecuting: false,
  };
}