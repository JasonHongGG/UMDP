import React, { createContext, useContext, useMemo } from 'react';
import type { ClassInfo, ClassSummary, ImageInfo } from '../../types';
import {
  buildStudioClassCatalog,
  createPendingClassNodeRequest,
} from './classCatalog';
import type { ClassBinding, PendingClassNodeRequest, StudioClassCatalogEntry } from './types';

interface StudioClassCatalogContextType {
  classes: StudioClassCatalogEntry[];
  createNodeRequestFromBinding: (
    binding: ClassBinding,
    suggestedPosition?: { x: number; y: number }
  ) => PendingClassNodeRequest | null;
  getClassInfoByBinding: (binding: ClassBinding | null | undefined) => ClassInfo | null;
  openInspectorForBinding?: (binding: ClassBinding) => void;
}

const StudioClassCatalogContext = createContext<StudioClassCatalogContextType | null>(null);

interface StudioClassCatalogProviderProps {
  children: React.ReactNode;
  images: ImageInfo[];
  classesByImage: Record<string, ClassSummary[]>;
  classDetailsByKey: Record<string, ClassInfo>;
  onOpenInspectorForBinding?: (binding: ClassBinding) => void;
}

function createBindingKey(binding: Pick<ClassBinding, 'imageId' | 'classId'>) {
  return `${binding.imageId}::${binding.classId}`;
}

export function StudioClassCatalogProvider({
  children,
  images,
  classesByImage,
  classDetailsByKey,
  onOpenInspectorForBinding,
}: StudioClassCatalogProviderProps) {
  const classes = useMemo(() => buildStudioClassCatalog(images, classesByImage), [images, classesByImage]);

  const value = useMemo<StudioClassCatalogContextType>(() => ({
    classes,
    createNodeRequestFromBinding: (binding, suggestedPosition) => {
      const classInfo = classDetailsByKey[createBindingKey(binding)];
      if (!classInfo) {
        return null;
      }

      return createPendingClassNodeRequest(binding, classInfo, suggestedPosition);
    },
    getClassInfoByBinding: (binding) => {
      if (!binding) {
        return null;
      }

      return classDetailsByKey[createBindingKey(binding)] ?? null;
    },
    openInspectorForBinding: onOpenInspectorForBinding,
  }), [classDetailsByKey, classes, onOpenInspectorForBinding]);

  return (
    <StudioClassCatalogContext.Provider value={value}>
      {children}
    </StudioClassCatalogContext.Provider>
  );
}

export function useStudioClassCatalog() {
  const context = useContext(StudioClassCatalogContext);
  if (!context) {
    throw new Error('useStudioClassCatalog must be used within a StudioClassCatalogProvider');
  }

  return context;
}