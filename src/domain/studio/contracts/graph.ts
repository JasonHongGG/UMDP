import type { ExpressionSource } from './expression';

export interface CanvasPosition {
  x: number;
  y: number;
}

export interface NodeInstance {
  id: string;
  nodeType: string;
  typeVersion: number;
  position: CanvasPosition;
  displayName?: string;
  parameters: Record<string, unknown>;
  bindings: Record<string, ExpressionSource | ExpressionSource[]>;
  documentState: Record<string, unknown>;
}

export interface ConnectionEndpoint {
  nodeId: string;
  connectionKey: string;
}

export interface ControlConnection {
  id: string;
  source: ConnectionEndpoint;
  target: ConnectionEndpoint;
}

export interface DataConnection {
  id: string;
  source: ConnectionEndpoint;
  target: ConnectionEndpoint;
  bindingKey: string;
}

export interface GraphDocument {
  schemaVersion: 1;
  id: string;
  nodes: NodeInstance[];
  controlConnections: ControlConnection[];
  dataConnections: DataConnection[];
}