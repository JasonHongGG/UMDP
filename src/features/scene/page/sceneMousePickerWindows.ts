import type { ProcessWindowCandidate } from '@/domain/analysis/contracts';

export function recommendScenePickerWindow(windows: ProcessWindowCandidate[]) {
  const foregroundCandidates = windows.filter((window) => window.isForeground && !window.isMinimized);
  if (foregroundCandidates.length === 1) {
    return foregroundCandidates[0];
  }

  if (windows.length === 1) {
    return windows[0];
  }

  return null;
}

export function formatScenePickerWindowLabel(window: ProcessWindowCandidate) {
  const title = window.title.trim();
  if (title.length > 0) {
    return title;
  }

  const className = window.className.trim();
  if (className.length > 0) {
    return `${className} ${window.windowHandle}`;
  }

  return window.windowHandle;
}