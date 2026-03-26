import React from 'react';
import { ExpressionDragOverlay } from '@/features/studio/core/drag/ExpressionDragOverlay';
import { AddNodeModal } from './modals/AddNodeModal';
import { EditNodeModal } from './modals/EditNodeModal';

export function StudioModalLayer() {
  return (
    <>
      <AddNodeModal />
      <EditNodeModal />
      <ExpressionDragOverlay />
    </>
  );
}