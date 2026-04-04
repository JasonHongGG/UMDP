import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GraphDocumentEnvelope } from '@/domain/studio/contracts';
import type {
  RuntimeSceneObjectChildrenTaskState,
  RuntimeSceneObjectInspectorTaskState,
  SceneWorkspaceState,
} from '@/domain/analysis/contracts';
import type { SystemContractVersions } from './workspace';

function readFixture<T>(name: string): T {
  const raw = readFileSync(join(process.cwd(), 'contract-fixtures', name), 'utf8');
  return JSON.parse(raw) as T;
}

describe('shared contract fixtures', () => {
  it('keeps the workflow envelope fixture aligned with the studio persistence contract', () => {
    const fixture = readFixture<GraphDocumentEnvelope>('workflow-envelope.json');

    expect(fixture.format).toBe('studio-graph');
    expect(fixture.schemaVersion).toBe(1);
    expect(fixture.document.schemaVersion).toBe(1);
    expect(fixture.document.nodes[0]?.documentState).toEqual({ mode: 'manual' });
  });

  it('keeps the workspace versions fixture aligned with the shell contract', () => {
    const fixture = readFixture<SystemContractVersions>('workspace-contract-versions.json');

    expect(fixture).toEqual({
      tauriCommandVersion: 2,
      analysisSchemaVersion: 3,
      workflowSchemaVersion: 1,
    });
  });

  it('keeps the scene resource fixture aligned with the scene resource contracts', () => {
    const fixture = readFixture<{
      workspace: SceneWorkspaceState;
      childrenTask: RuntimeSceneObjectChildrenTaskState;
      inspectorTask: RuntimeSceneObjectInspectorTaskState;
    }>('scene-resource-contract.json');

    expect(fixture.workspace.resourceState.resourceKind).toBe('catalog');
    expect(fixture.workspace.resourceState.freshness).toBe('fresh');
    expect(fixture.workspace.mutationEpoch).toBe(3);
    expect(fixture.childrenTask.resourceState.resourceKind).toBe('children');
    expect(fixture.childrenTask.resourceState.freshness).toBe('refreshing');
    expect(fixture.childrenTask.resourceState.isRetainingSnapshot).toBe(true);
    expect(fixture.inspectorTask.resourceState.resourceKind).toBe('inspector');
    expect(fixture.inspectorTask.resourceState.lastSuccessfulAt).toBe('2026-04-04T09:59:55.000Z');
  });
});