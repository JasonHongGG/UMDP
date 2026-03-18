import { StudioNodeDefinition } from '../core/studio/types';
import TriggerNodeDef from './TriggerNode/TriggerNode';
import ClassNodeDef from './ClassNode/ClassNode';
import StringParametersNodeDef from './StringParametersNode/StringParametersNode';

export const studioNodeCatalog: StudioNodeDefinition[] = [
  TriggerNodeDef,
  StringParametersNodeDef,
  ClassNodeDef,
];
