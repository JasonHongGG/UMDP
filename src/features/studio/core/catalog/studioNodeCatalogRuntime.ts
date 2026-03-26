import { studioNodeCatalog as registeredDefinitions } from '@/features/studio/nodes';
import { getStudioNodeCatalog, initializeStudioNodeRegistry } from '../NodeRegistry';
import type { StudioNodeCatalog } from './StudioNodeCatalog';

export function getRegisteredStudioNodeCatalog(): StudioNodeCatalog {
  const catalog = getStudioNodeCatalog();
  if (catalog.getAll().length === 0) {
    initializeStudioNodeRegistry(registeredDefinitions, catalog);
  }

  return catalog;
}
