import { StudioNodeDefinition } from '../core/studio/types';
import TriggerNodeDef from './TriggerNode/TriggerNode';
import ClassNodeDef from './ClassNode/ClassNode';
import ParametersNodeDef from './ParametersNode/ParametersNode';
import CallFunctionNodeDef from './CallFunctionNode/CallFunctionNode';
import DisplayNodeDef from './DisplayNode/DisplayNode';

export const studioNodeCatalog: StudioNodeDefinition[] = [
  TriggerNodeDef,
  ParametersNodeDef,
  ClassNodeDef,
  CallFunctionNodeDef,
  DisplayNodeDef,
];
