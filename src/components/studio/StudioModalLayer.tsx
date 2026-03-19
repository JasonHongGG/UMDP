import React from 'react';
import { ExpressionDragOverlay } from '../../core/studio/drag/ExpressionDragOverlay';
import { AddNodeModal } from './modals/AddNodeModal';
import { EditNodeModal } from './modals/n8n/EditNodeModal';

export function StudioModalLayer() {
  return (
    <>
      <AddNodeModal />
      <EditNodeModal />
      <ExpressionDragOverlay />
    </>
  );
}