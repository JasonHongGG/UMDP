import { studioNodeCatalog as registeredDefinitions } from '../../../nodes';
import { defaultStudioNodeCatalog, type StudioNodeCatalog } from './StudioNodeCatalog';

let hasRegisteredDefaultCatalog = false;

export function getRegisteredStudioNodeCatalog(): StudioNodeCatalog {
  if (!hasRegisteredDefaultCatalog) {
    defaultStudioNodeCatalog.replaceAll(registeredDefinitions);
    hasRegisteredDefaultCatalog = true;
  }

  return defaultStudioNodeCatalog;
}
