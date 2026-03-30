import { useMemo } from 'react';
import { createTauriSceneGateway } from '@/infrastructure/tauri/TauriSceneGateway';

export function useSceneGateway() {
  return useMemo(() => createTauriSceneGateway(), []);
}