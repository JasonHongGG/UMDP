import { useMemo } from 'react';
import { createTauriAnalysisRepository } from '../../../infrastructure/tauri/TauriAnalysisRepository';

export function useAnalysisRepository() {
  return useMemo(() => createTauriAnalysisRepository(), []);
}
