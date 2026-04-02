import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GraphDocumentEnvelope } from '@/domain/studio/contracts';
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
      tauriCommandVersion: 1,
      analysisSchemaVersion: 2,
      workflowSchemaVersion: 1,
    });
  });
});