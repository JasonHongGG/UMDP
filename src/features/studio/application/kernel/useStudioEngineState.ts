import { useReducer } from 'react';
import {
  createStudioEngineState,
  reduceStudioEngineState,
  type StudioEngineCommand,
  type StudioEngineState,
} from './StudioEngine';

export interface StudioEngineController {
  state: StudioEngineState;
  dispatch: React.Dispatch<StudioEngineCommand>;
}

export function useStudioEngineState(externalController?: StudioEngineController): StudioEngineController {
  const [state, dispatch] = useReducer(reduceStudioEngineState, undefined, () => createStudioEngineState());
  return externalController ?? { state, dispatch };
}