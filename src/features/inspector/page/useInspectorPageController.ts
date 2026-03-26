import { useEffect, useRef } from 'react';

interface UseInspectorPageControllerOptions {
  tabsLength: number;
  activeTabIndex: number;
  selectedImageStableId: string | null;
  currentClasses: unknown[];
  pendingScrollImageStableId: string | null;
  pendingScrollClassStableId: string | null;
  clearPendingScrollTarget: () => void;
}

export function useInspectorPageController({
  tabsLength,
  activeTabIndex,
  selectedImageStableId,
  currentClasses,
  pendingScrollImageStableId,
  pendingScrollClassStableId,
  clearPendingScrollTarget,
}: UseInspectorPageControllerOptions) {
  const tabBarRef = useRef<HTMLDivElement>(null);
  const imageListRef = useRef<HTMLDivElement>(null);
  const classListRef = useRef<HTMLDivElement>(null);
  const previousTabsLengthRef = useRef(tabsLength);

  useEffect(() => {
    if (pendingScrollImageStableId && pendingScrollClassStableId && selectedImageStableId === pendingScrollImageStableId) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (imageListRef.current) {
            const activeImage = imageListRef.current.querySelector(`[data-id="${pendingScrollImageStableId}"]`);
            if (activeImage) {
              activeImage.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            }
          }
          if (classListRef.current) {
            const activeClass = classListRef.current.querySelector(`[data-id="${pendingScrollClassStableId}"]`);
            if (activeClass) {
              activeClass.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            }
          }
        }, 50);
      });
      clearPendingScrollTarget();
    }
  }, [
    clearPendingScrollTarget,
    currentClasses,
    pendingScrollClassStableId,
    pendingScrollImageStableId,
    selectedImageStableId,
  ]);

  useEffect(() => {
    const isClosing = tabsLength < previousTabsLengthRef.current;
    previousTabsLengthRef.current = tabsLength;

    if (tabBarRef.current && !isClosing) {
      const container = tabBarRef.current;
      const tab = container.querySelector('[data-active="true"]') as HTMLElement | null;

      if (tab) {
        const scrollOffset = tab.offsetLeft - (container.clientWidth / 2) + (tab.clientWidth / 2);
        container.scrollTo({ left: scrollOffset, behavior: 'smooth' });
      }
    }
  }, [activeTabIndex, tabsLength]);

  return {
    tabBarRef,
    imageListRef,
    classListRef,
  };
}
