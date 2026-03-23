import type { NodeDefinition } from '../../../domain/studio/kernel';

export interface NodeRegistry {
  register(definition: NodeDefinition): void;
  get(schemaId: string): NodeDefinition | null;
  list(): NodeDefinition[];
}

export function createNodeRegistry(seed: NodeDefinition[] = []): NodeRegistry {
  const definitions = new Map<string, NodeDefinition>();

  for (const definition of seed) {
    definitions.set(definition.schema.id, definition);
  }

  return {
    register(definition) {
      definitions.set(definition.schema.id, definition);
    },
    get(schemaId) {
      return definitions.get(schemaId) ?? null;
    },
    list() {
      return [...definitions.values()];
    },
  };
}