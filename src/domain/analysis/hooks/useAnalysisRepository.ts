import { useAppInfrastructure } from '@/app/AppInfrastructureContext';

export function useAnalysisRepository() {
  return useAppInfrastructure().analysisRepository;
}
