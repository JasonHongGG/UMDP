import { useAppInfrastructure } from '@/app/AppInfrastructureContext';

export function useSceneGateway() {
  return useAppInfrastructure().sceneGateway;
}