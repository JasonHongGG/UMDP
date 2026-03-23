export interface CanvasPosition {
  x: number;
  y: number;
}

export interface NodePortRef {
  nodeId: string;
  portKey: string;
}

export type EdgeChannel = 'control' | 'data';

export interface NodeRecord {
  id: string;
  schemaId: string;
  schemaVersion: number;
  position: CanvasPosition;
  displayName?: string;
  state: Record<string, unknown>;
}

export interface EdgeRecord {
  id: string;
  channel: EdgeChannel;
  source: NodePortRef;
  target: NodePortRef;
}

export interface GraphMetadata {
  name?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StudioDocument {
  version: 1;
  id: string;
  metadata: GraphMetadata;
  nodes: NodeRecord[];
  edges: EdgeRecord[];
}

export function createEmptyStudioDocument(id = 'studio-document'): StudioDocument {
  return {
    version: 1,
    id,
    metadata: {},
    nodes: [],
    edges: [],
  };
}