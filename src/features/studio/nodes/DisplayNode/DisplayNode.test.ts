import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeInstanceFieldSnapshot, RuntimeOverlaySnapshot } from '@/domain/analysis/contracts';
import type { ClassBinding, ClassInfoCatalog, ClassInfoSelection } from '@/domain/studio/editor';
import { createClassInfoEnvelope } from '@/features/studio/core/contracts';
import { createInputExpressionSource } from '@/features/studio/core/expression';
import DisplayNodeDef from './DisplayNode';

const getRuntimeInstanceFieldsMock = vi.fn();
const getRuntimeStaticFieldsMock = vi.fn();

vi.mock('@/features/studio/application/runtime/StudioRuntimeGateway', () => ({
  getStudioRuntimeInstanceFields: (...args: unknown[]) => getRuntimeInstanceFieldsMock(...args),
  getStudioRuntimeStaticFields: (...args: unknown[]) => getRuntimeStaticFieldsMock(...args),
}));

const binding: ClassBinding = {
  imageStableId: 'image-1' as ClassBinding['imageStableId'],
  classStableId: 'class-1' as ClassBinding['classStableId'],
  fullName: 'Gameplay.WorldData',
  name: 'WorldData',
  namespace: 'Gameplay',
  imageName: 'Assembly-CSharp',
};

const catalog: ClassInfoCatalog = {
  members: [{
    id: 'field-health' as ClassInfoCatalog['members'][number]['id'],
    label: 'health',
    name: 'health',
    typeName: 'System.Int32',
    offset: '0x10',
    address: null,
    value: null,
    isStatic: false,
  }],
  statics: [{
    id: 'field-instance' as ClassInfoCatalog['statics'][number]['id'],
    label: 'Instance',
    name: 'Instance',
    typeName: 'Gameplay.WorldData',
    offset: null,
    address: '0x2000',
    value: '0x1234',
    isStatic: true,
  }],
  functions: [],
};

const selection: ClassInfoSelection = {
  members: ['field-health' as ClassInfoSelection['members'][number]],
  statics: ['field-instance' as ClassInfoSelection['statics'][number]],
  functions: [],
};

beforeEach(() => {
  getRuntimeInstanceFieldsMock.mockReset();
  getRuntimeStaticFieldsMock.mockReset();
});

describe('DisplayNode execution', () => {
  it('refreshes class info payload values when flow is not directly from the class node', async () => {
    const staticSnapshot: RuntimeOverlaySnapshot = {
      schemaVersion: 1,
      generatedAt: 'now',
      classes: {
        [binding.classStableId]: {
          classStableId: binding.classStableId,
          fields: [],
          staticFields: [{
            stableId: catalog.statics[0].id,
            name: 'Instance',
            fieldType: 'Gameplay.WorldData',
            offset: null,
            address: '0x2000',
            value: '0x9999',
          }],
        },
      },
    };
    const instanceSnapshot: RuntimeInstanceFieldSnapshot = {
      classStableId: binding.classStableId,
      instanceAddress: '0x1234',
      fields: [{
        stableId: catalog.members[0].id,
        name: 'health',
        fieldType: 'System.Int32',
        offset: '0x10',
        address: '0x1244',
        value: '88',
      }],
    };

    getRuntimeStaticFieldsMock.mockResolvedValue(staticSnapshot);
    getRuntimeInstanceFieldsMock.mockResolvedValue(instanceSnapshot);

    const payload = createClassInfoEnvelope(binding, catalog, selection, '0x1234').payload;
    const result = await DisplayNodeDef.executionContract?.execute({
      documentId: 'doc-1',
      nodeId: 'display-1',
      nodeType: 'display',
      parameters: {},
      bindings: {},
      resolvedBindings: {},
      documentState: { selectedFields: [] },
      runtimeState: {},
      inputBindings: {
        'payload-in': [createInputExpressionSource('class-node', 'info-out', [], 'class.info-out')],
      },
      resolvedInputs: {
        'payload-in': [payload],
      },
      controlInputs: ['editor-node'],
      getClassInfoCatalogByBinding: () => catalog,
      abortSignal: null,
      reportProgress: () => undefined,
    });

    expect(getRuntimeStaticFieldsMock).toHaveBeenCalledWith(binding.classStableId);
    expect(getRuntimeInstanceFieldsMock).toHaveBeenCalledWith(binding.classStableId, '0x1234');
    expect(result).toMatchObject({
      state: 'success',
      nextRuntimeState: {
        observedPayload: {
          statics: [expect.objectContaining({ value: '0x9999' })],
          members: [expect.objectContaining({ value: 88, address: '0x1244' })],
        },
      },
    });
  });

  it('skips refresh when flow comes directly from the same class node', async () => {
    const payload = createClassInfoEnvelope(binding, catalog, selection, '0x1234').payload;
    const result = await DisplayNodeDef.executionContract?.execute({
      documentId: 'doc-1',
      nodeId: 'display-1',
      nodeType: 'display',
      parameters: {},
      bindings: {},
      resolvedBindings: {},
      documentState: { selectedFields: [] },
      runtimeState: {},
      inputBindings: {
        'payload-in': [createInputExpressionSource('class-node', 'info-out', [], 'class.info-out')],
      },
      resolvedInputs: {
        'payload-in': [payload],
      },
      controlInputs: ['class-node'],
      getClassInfoCatalogByBinding: () => catalog,
      abortSignal: null,
      reportProgress: () => undefined,
    });

    expect(getRuntimeStaticFieldsMock).not.toHaveBeenCalled();
    expect(getRuntimeInstanceFieldsMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      state: 'success',
      outputs: {},
      nextRuntimeState: undefined,
    });
  });
});