import { useState, useCallback } from 'react';

export interface InspectorTab {
  imageId: string;
  classId: string;
  name: string;
  namespace: string;
  imageName: string;
}

export function useTabs() {
  const [tabs, setTabs] = useState<InspectorTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(-1);

  const openTabForClass = useCallback((entry: InspectorTab) => {
    setTabs(prev => {
      const existingIndex = prev.findIndex(t => t.imageId === entry.imageId && t.classId === entry.classId);
      if (existingIndex >= 0) {
        setActiveTabIndex(existingIndex);
        return prev;
      }
      setActiveTabIndex(prev.length);
      return [...prev, entry];
    });
  }, []);

  const handleCloseTab = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(prev => {
      const newTabs = [...prev];
      newTabs.splice(index, 1);
      
      if (newTabs.length === 0) {
        setActiveTabIndex(-1);
      } else {
        setActiveTabIndex(curr => {
            if (curr >= index) return Math.max(0, curr - 1);
            return curr;
        });
      }
      return newTabs;
    });
  }, []);

  const resetTabs = useCallback(() => {
    setTabs([]);
    setActiveTabIndex(-1);
  }, []);

  return {
    tabs,
    activeTabIndex,
    setActiveTabIndex,
    openTabForClass,
    handleCloseTab,
    resetTabs
  };
}
