import { StudioNodeDefinition } from '../core/studio/types';
import TriggerNodeDef from './TriggerNode/TriggerNode';
import ClassNodeDef from './ClassNode/ClassNode';
import ParametersNodeDef from './ParametersNode/ParametersNode';
import CallFunctionNodeDef from './CallFunctionNode/CallFunctionNode';
import DisplayNodeDef from './DisplayNode/DisplayNode';
import EditorNodeDef from './EditorNode/EditorNode';
import IfNodeDef from './IfNode/IfNode';
import ForLoopNodeDef from './ForLoopNode/ForLoopNode';
import WaitNodeDef from './WaitNode/WaitNode';

export const studioNodeCatalog: StudioNodeDefinition[] = [
  TriggerNodeDef,
  ParametersNodeDef,
  ClassNodeDef,
  CallFunctionNodeDef,
  EditorNodeDef,
  DisplayNodeDef,
  IfNodeDef,
  ForLoopNodeDef,
  WaitNodeDef,
];
