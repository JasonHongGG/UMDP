import { StudioNodeDefinition } from '../core/studio/types';
import TriggerNodeDef from './TriggerNode/TriggerNode';
import ClassNodeDef from './ClassNode/ClassNode';

export const studioNodeCatalog: StudioNodeDefinition[] = [
  TriggerNodeDef,
  ClassNodeDef,
];
