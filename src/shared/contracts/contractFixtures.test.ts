import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SCHEMA_VERSION,
  BRIDGE_OPERATIONS,
  BRIDGE_OPERATION_GROUPS,
  createBridgeCommandEnvelope,
  createBridgeResponseEnvelope,
  type BridgeCommandEnvelope,
  type BridgeResponseEnvelope,
} from './bridge';
import type { RuntimeMethodInvokeRequest, RuntimeMethodInvokeResult } from './analysis';
import type { GraphDocumentEnvelope } from '@/domain/studio/contracts';
import type { SystemContractVersions } from './workspace';

interface BridgeOperationRegistryFixture {
  schemaVersion: number;
  protocolVersion: number;
  groups: Record<string, string[]>;
  operations: string[];
}

function readFixture<T>(name: string): T {
  const raw = readFileSync(join(process.cwd(), 'contract-fixtures', name), 'utf8');
  return JSON.parse(raw) as T;
}

describe('shared contract fixtures', () => {
  it('keeps the bridge command fixture aligned with the shared bridge envelope contract', () => {
    const fixture = readFixture<BridgeCommandEnvelope<RuntimeMethodInvokeRequest>>('bridge-command-envelope.json');

    expect(fixture.commandVersion).toBe(BRIDGE_PROTOCOL_VERSION);
    expect(fixture.schemaVersion).toBe(BRIDGE_SCHEMA_VERSION);
    expect(fixture.operation).toBe('runtime-method-invoke');
    expect(fixture.payload.arguments[0]).toEqual({
      name: 'target',
      typeName: 'UnityEngine.Transform',
      valueKind: 'address',
      value: '0x0000000000002000',
    });
    expect(createBridgeCommandEnvelope(fixture.operation, fixture.requestId, fixture.payload)).toEqual(fixture);
  });

  it('keeps the bridge response fixture aligned with the shared bridge envelope contract', () => {
    const fixture = readFixture<BridgeResponseEnvelope<RuntimeMethodInvokeResult>>('bridge-response-envelope.json');

    expect(fixture.commandVersion).toBe(BRIDGE_PROTOCOL_VERSION);
    expect(fixture.schemaVersion).toBe(BRIDGE_SCHEMA_VERSION);
    expect(createBridgeResponseEnvelope(fixture.requestId, fixture.ok, fixture.result, fixture.error)).toEqual(fixture);
  });

  it('keeps the bridge operation registry aligned across the shared contract surface', () => {
    const fixture = readFixture<BridgeOperationRegistryFixture>('bridge-operation-registry.json');

    expect(fixture.schemaVersion).toBe(BRIDGE_SCHEMA_VERSION);
    expect(fixture.protocolVersion).toBe(BRIDGE_PROTOCOL_VERSION);
    expect(fixture.operations).toEqual([...BRIDGE_OPERATIONS]);
    expect(fixture.groups).toEqual({
      workspace: [...BRIDGE_OPERATION_GROUPS.workspace],
      metadataQuery: [...BRIDGE_OPERATION_GROUPS.metadataQuery],
      sceneQuery: [...BRIDGE_OPERATION_GROUPS.sceneQuery],
      sceneMutation: [...BRIDGE_OPERATION_GROUPS.sceneMutation],
      runtime: [...BRIDGE_OPERATION_GROUPS.runtime],
    });
  });

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
      bridgeProtocolVersion: 2,
      analysisSchemaVersion: 2,
      workflowSchemaVersion: 1,
    });
  });
});