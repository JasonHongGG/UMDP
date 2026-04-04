import { useAppInfrastructure } from '@/app/AppInfrastructureContext';

export function useWorkspaceAttachIntentChannel() {
  return useAppInfrastructure().workspaceAttachIntentChannel;
}