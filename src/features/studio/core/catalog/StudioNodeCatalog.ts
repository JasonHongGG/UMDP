import type { StudioNodeDefinition } from '../types';
import { createDiagnosticsLogger } from '@/shared/diagnostics';

const studioCatalogDiagnostics = createDiagnosticsLogger({
  channel: 'studio',
  origin: 'StudioNodeCatalog',
});

export class StudioNodeCatalog {
  private registry = new Map<string, StudioNodeDefinition>();

  public register(nodeDef: StudioNodeDefinition) {
    if (this.registry.has(nodeDef.manifest.type)) {
      studioCatalogDiagnostics.warn('Node type already registered; overwriting definition.', {
        context: {
          nodeType: nodeDef.manifest.type,
        },
      });
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
