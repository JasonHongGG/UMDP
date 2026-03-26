import type { StudioNodeDefinition } from '../types';

export class StudioNodeCatalog {
  private registry = new Map<string, StudioNodeDefinition>();

  public register(nodeDef: StudioNodeDefinition) {
    if (this.registry.has(nodeDef.manifest.type)) {
      console.warn(`Node type ${nodeDef.manifest.type} is already registered. Overwriting.`);
    }
    this.registry.set(nodeDef.manifest.type, nodeDef);
  }

  public get(typeId: string): StudioNodeDefinition | undefined {
    return this.registry.get(typeId);
  }

  public getAll(): StudioNodeDefinition[] {
    return Array.from(this.registry.values());
  }

  public registerMany(nodeDefs: StudioNodeDefinition[]) {
    nodeDefs.forEach((nodeDef) => this.register(nodeDef));
  }

  public replaceAll(nodeDefs: StudioNodeDefinition[]) {
    this.clear();
    this.registerMany(nodeDefs);
  }

  public clear() {
    this.registry.clear();
  }
}

export const defaultStudioNodeCatalog = new StudioNodeCatalog();
