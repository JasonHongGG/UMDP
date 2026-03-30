export const BRIDGE_OPERATION_GROUPS = {
  workspace: [
    'process-fetch',
    'process-attach',
  ],
  metadataQuery: [
    'analysis-snapshot-load',
    'analysis-overlay-load',
  ],
  sceneQuery: [
    'scene-catalog-load',
    'scene-object-children-load',
    'scene-object-children-page-load',
    'scene-object-inspect',
    'scene-object-inspect-header',
    'scene-object-inspect-children-page',
    'scene-object-inspect-components-page',
  ],
  sceneMutation: [
    'scene-object-create-root',
    'scene-object-create-child',
    'scene-object-duplicate',
    'scene-object-delete',
    'scene-object-rename',
    'scene-object-set-tag',
    'scene-object-set-layer',
    'scene-object-set-hide-flags',
    'scene-object-reparent',
    'scene-object-set-active',
    'scene-object-set-transform',
    'scene-component-set-behaviour-enabled',
    'scene-component-create',
    'scene-component-delete',
    'scene-load-by-build-index',
  ],
  runtime: [
    'runtime-field-read',
    'runtime-field-write',
    'runtime-method-invoke',
  ],
} as const;

export const BRIDGE_OPERATIONS = [
  ...BRIDGE_OPERATION_GROUPS.workspace,
  ...BRIDGE_OPERATION_GROUPS.metadataQuery,
  ...BRIDGE_OPERATION_GROUPS.sceneQuery,
  ...BRIDGE_OPERATION_GROUPS.sceneMutation,
  ...BRIDGE_OPERATION_GROUPS.runtime,
] as const;

export type BridgeOperationGroup = keyof typeof BRIDGE_OPERATION_GROUPS;
export type BridgeOperation = typeof BRIDGE_OPERATIONS[number];

export function isBridgeOperation(value: string): value is BridgeOperation {
  return (BRIDGE_OPERATIONS as readonly string[]).includes(value);
}