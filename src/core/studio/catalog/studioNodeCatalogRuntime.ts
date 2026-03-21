import { studioNodeCatalog as registeredDefinitions } from '../../../nodes';
import { defaultStudioNodeCatalog, type StudioNodeCatalog } from './StudioNodeCatalog';

export function getRegisteredStudioNodeCatalog(): StudioNodeCatalog {
  if (defaultStudioNodeCatalog.getAll().length === 0) {
    defaultStudioNodeCatalog.replaceAll(registeredDefinitions);
  }

  return defaultStudioNodeCatalog;
}
