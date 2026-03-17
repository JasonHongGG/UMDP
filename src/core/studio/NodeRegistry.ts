import { BaseNodeData, INodeDefinition, IPort, StudioNodeDefinition } from './types';

function clonePorts(ports: IPort[]) {
  return ports.map((port) => ({ ...port }));
}

class NodeRegistry {
  private registry = new Map<string, StudioNodeDefinition>();

  public register(nodeDef: StudioNodeDefinition) {
    if (this.registry.has(nodeDef.typeId)) {
       console.warn(`Node type ${nodeDef.typeId} is already registered. Overwriting.`);
    }
    this.registry.set(nodeDef.typeId, nodeDef);
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

  public clear() {
    this.registry.clear();
  }
}

export const globalNodeRegistry = new NodeRegistry();

export function defineStudioNode<T extends BaseNodeData>(nodeDef: INodeDefinition<T>): StudioNodeDefinition {
  return nodeDef as unknown as StudioNodeDefinition;
}

export function createStudioNodeInitialData(nodeDef: StudioNodeDefinition, overrides?: Partial<BaseNodeData>): BaseNodeData {
  const initialData = nodeDef.createInitialData?.() ?? {
    inputs: clonePorts(nodeDef.defaultInputs),
    outputs: clonePorts(nodeDef.defaultOutputs),
    ...nodeDef.defaultData,
  };

  return {
    ...initialData,
    ...overrides,
    inputs: clonePorts(overrides?.inputs ?? initialData.inputs),
    outputs: clonePorts(overrides?.outputs ?? initialData.outputs),
  };
}

export function initializeStudioNodeRegistry(nodeDefs: StudioNodeDefinition[]) {
  globalNodeRegistry.clear();
  globalNodeRegistry.registerMany(nodeDefs);
}
