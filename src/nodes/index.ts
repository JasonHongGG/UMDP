import { StudioNodeDefinition } from '../core/studio/types';
import TriggerNodeDef from './TriggerNode/TriggerNode';
import ClassNodeDef from './ClassNode/ClassNode';
import ParametersNodeDef from './ParametersNode/ParametersNode';

export const studioNodeCatalog: StudioNodeDefinition[] = [
  TriggerNodeDef,
  ParametersNodeDef,
  ClassNodeDef,
];
