import { getCurrentWindow } from '@tauri-apps/api/window';

function currentWindow() {
  return getCurrentWindow();
}

export function getCurrentWindowLabel() {
  return currentWindow().label;
}

export async function hideCurrentWindow() {
  await currentWindow().hide();
}

export async function minimizeCurrentWindow() {
  await currentWindow().minimize();
}

export async function toggleCurrentWindowMaximized() {
  const win = currentWindow();
  if (await win.isMaximized()) {
    await win.unmaximize();
    return;
  }

  await win.maximize();
}

export async function closeCurrentWindow() {
  await currentWindow().close();
}

export async function onCurrentWindowFocusChanged(handler: (focused: boolean) => void | Promise<void>) {
  return currentWindow().onFocusChanged(({ payload }) => handler(payload));
}