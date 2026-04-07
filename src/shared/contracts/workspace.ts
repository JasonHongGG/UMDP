export type {
  RuntimeCapability,
  RuntimeSceneObjectComponentsCapabilityState,
  RuntimeSceneObjectComponentsCapabilityStatus,
  RuntimeSceneObjectComponentsStrategy,
  RuntimeSessionState,
  RuntimeSessionStatus,
  SystemContractVersions,
  WorkspaceLifecycleState,
  WorkspaceLifecycleStatus,
} from './generated/workspace.generated';
export {
  CURRENT_SYSTEM_CONTRACT_VERSIONS,
  currentSystemContractVersions,
} from './generated/workspace.generated';

export type WorkspacePage = 'inspector' | 'studio' | 'scene';

export type WorkspacePageSystemState =
  | 'session-required'
  | 'session-unavailable'
  | 'catalog-loading'
  | 'catalog-error'
  | 'capability-unavailable'
  | 'runtime-loading'
  | 'runtime-degraded'
  | 'runtime-error'
  | 'ready';
