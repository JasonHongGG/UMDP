export type PersistedSceneInspectorTab = {
  objectAddress: string;
  name: string;
  sceneName?: string;
  sceneKind?: string;
};

export type SceneWorkspacePersistenceSnapshot = {
  selectedObjectAddress: string | null;
  sceneTabs: PersistedSceneInspectorTab[];
  activeSceneTabIndex: number;
};

const SCENE_TABS_KEY = 'mndp_scene_tabs';
const SCENE_TAB_INDEX_KEY = 'mndp_scene_tab_index';
const SCENE_SELECTED_ADDRESS_KEY = 'mndp_scene_selected_address';

function readJsonValue<T>(key: string, fallback: T): T {
  try {
    const rawValue = sessionStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) as T : fallback;
  } catch {
    return fallback;
  }
}

function readStringValue(key: string): string | null {
  try {
    return sessionStorage.getItem(key) || null;
  } catch {
    return null;
  }
}

function readNumberValue(key: string, fallback: number): number {
  try {
    const rawValue = sessionStorage.getItem(key);
    return rawValue ? Number(rawValue) : fallback;
  } catch {
    return fallback;
  }
}

export function readSceneWorkspacePersistence(): SceneWorkspacePersistenceSnapshot {
  return {
    selectedObjectAddress: readStringValue(SCENE_SELECTED_ADDRESS_KEY),
    sceneTabs: readJsonValue<PersistedSceneInspectorTab[]>(SCENE_TABS_KEY, []),
    activeSceneTabIndex: readNumberValue(SCENE_TAB_INDEX_KEY, -1),
  };
}

export function persistSceneWorkspaceSelectedObject(selectedObjectAddress: string | null) {
  try {
    if (selectedObjectAddress) {
      sessionStorage.setItem(SCENE_SELECTED_ADDRESS_KEY, selectedObjectAddress);
      return;
    }

    sessionStorage.removeItem(SCENE_SELECTED_ADDRESS_KEY);
  } catch {
    return;
  }
}

export function persistSceneWorkspaceTabs(sceneTabs: PersistedSceneInspectorTab[]) {
  try {
    sessionStorage.setItem(SCENE_TABS_KEY, JSON.stringify(sceneTabs));
  } catch {
    return;
  }
}

export function persistSceneWorkspaceActiveTabIndex(activeSceneTabIndex: number) {
  try {
    sessionStorage.setItem(SCENE_TAB_INDEX_KEY, String(activeSceneTabIndex));
  } catch {
    return;
  }
}