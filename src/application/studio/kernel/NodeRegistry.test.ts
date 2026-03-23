import { describe, expect, it } from 'vitest';
import type { NodeDefinition } from '../../../domain/studio/kernel';
import { createNodeRegistry } from './NodeRegistry';

const displayDefinition: NodeDefinition = {
  schema: {
    id: 'display',
    version: 1,
    family: 'runtime',
    displayName: 'Display',
    description: 'Shows runtime values.',
    ports: [],
    stateSchema: {
      version: 1,
      fields: [],
    },
    capabilityConfigs: [{ key: 'previewable' }],
  },
  behavior: {},
};

describe('NodeRegistry', () => {
  it('stores and resolves definitions by schema id', () => {
    const registry = createNodeRegistry([displayDefinition]);

    expect(registry.get('display')).toBe(displayDefinition);
    expect(registry.get('missing')).toBeNull();
  });

  it('replaces older definitions when the same schema id is registered again', () => {
    const registry = createNodeRegistry([displayDefinition]);
    const updatedDefinition: NodeDefinition = {
      ...displayDefinition,
      schema: {
        ...displayDefinition.schema,
        description: 'Shows and formats runtime values.',
      },
    };

    registry.register(updatedDefinition);

    expect(registry.get('display')?.schema.description).toBe('Shows and formats runtime values.');
    expect(registry.list()).toHaveLength(1);
  });
});