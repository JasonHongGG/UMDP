import type { NodeInstance } from '../../domain/studio/contracts';
import { defaultStudioNodeCatalog, StudioNodeCatalog } from './catalog/StudioNodeCatalog';
import { BaseNodeData, INodeDefinition, IPort, StudioNode, StudioNodeDefinition, StudioNodeRuntimeState } from './types';
import { resolveJsonSchemaReference } from './contracts';

export function defineStudioNode<T extends BaseNodeData>(nodeDef: INodeDefinition<T>): StudioNodeDefinition {
  return nodeDef as unknown as StudioNodeDefinition;
}

function clonePortsFromManifest(nodeDef: StudioNodeDefinition, direction: 'input' | 'output') {
  const connections = direction === 'input' ? nodeDef.manifest.inputs : nodeDef.manifest.outputs;

  return connections.map<IPort>((connection) => ({
    id: connection.key,
    label: connection.displayName,
    type: connection.channel === 'control' ? 'flow' : 'json',
    direction: connection.direction,
    channel: connection.channel,
    cardinality: connection.cardinality,
    required: connection.required,
    dataType: connection.dataType,
    schema: connection.channel === 'data' ? resolveJsonSchemaReference(connection.dataType) : undefined,
  }));
}

function createBaseNodeData(nodeDef: StudioNodeDefinition, nodeName?: string): BaseNodeData {
  return {
    nodeName,
  };
}

export function createStudioNodeInitialData(nodeDef: StudioNodeDefinition, overrides?: Partial<BaseNodeData>): BaseNodeData {
  const initialData = nodeDef.createInitialData?.() ?? createBaseNodeData(nodeDef);

  return {
    ...initialData,
    ...overrides,
  };
}

export function hydrateStudioNodeData(nodeDef: StudioNodeDefinition, instance: NodeInstance): BaseNodeData {
  const baseData = createBaseNodeData(nodeDef, instance.displayName);
  const hydratedData = nodeDef.hydrateData?.(instance, baseData) ?? { ...baseData };

  return {
    ...hydratedData,
    nodeName: hydratedData.nodeName ?? instance.displayName,
  };
}

export function dehydrateStudioNodeData<T extends BaseNodeData>(nodeDef: INodeDefinition<T>, data: T, instance: NodeInstance): StudioNodeRuntimeState {
  return nodeDef.dehydrateData?.(data, instance) ?? {
    displayName: data.nodeName?.trim() || undefined,
    parameters: {},
    bindings: {},
    documentState: {},
  };
}

export function initializeStudioNodeRegistry(nodeDefs: StudioNodeDefinition[], catalog: StudioNodeCatalog = defaultStudioNodeCatalog) {
  catalog.replaceAll(nodeDefs);
}

export function getNodePortsByDirection(nodeDef: StudioNodeDefinition, direction: 'input' | 'output') {
  return clonePortsFromManifest(nodeDef, direction);
}

export function getStudioNodePorts(node: StudioNode, direction: 'input' | 'output', catalog: StudioNodeCatalog = defaultStudioNodeCatalog) {
  const nodeDef = catalog.get(node.type);
  if (!nodeDef) {
    return [];
  }

  return getNodePortsByDirection(nodeDef, direction);
}

export function getStudioNodePort(node: StudioNode | undefined, direction: 'input' | 'output', portId: string, catalog: StudioNodeCatalog = defaultStudioNodeCatalog) {
  if (!node) {
    return undefined;
  }

  return getStudioNodePorts(node, direction, catalog).find((port) => port.id === portId);
}
