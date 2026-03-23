// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditNodeModal } from './EditNodeModal';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const closeEditModal = vi.fn();
const setIsEditingName = vi.fn();
const setDraftNodeName = vi.fn();
const handleUpdateData = vi.fn();
const commitNodeName = vi.fn();

vi.mock('../../../application/studio/useStudioEditNodeModalViewState', () => ({
  useStudioEditNodeModalViewState: () => ({
    expressionDrag: { activeExpressionDrag: null },
    isEditModalOpen: true,
    closeEditModal,
    node: { id: 'node-1', type: 'display', data: { nodeName: 'Display Node' } },
    nodeDef: { manifest: { parameters: [] } },
    presentation: {
      icon: () => React.createElement('span', null, 'I'),
    },
    EditComponent: null,
    EditFooterComponent: null,
    hasParameterSchema: false,
    nodeOutputs: [],
    resolvedNodeName: 'Display Node',
    inputBindingStates: [],
    callFunctionInputState: null,
    liveQuerySnapshot: null,
    liveOutputPreview: null,
    snapshotOriginLabel: null,
    snapshotPhaseLabel: null,
    isEditingName: false,
    setIsEditingName,
    draftNodeName: 'Display Node',
    setDraftNodeName,
    nameInputRef: { current: null },
    handleUpdateData,
    commitNodeName,
  }),
}));

vi.mock('../../../application/studio/useStudioExpressionDragState', () => ({
  useStudioExpressionDragState: () => ({
    activeExpressionDrag: null,
    expressionDragPosition: null,
    beginExpressionDrag: vi.fn(),
    updateExpressionDrag: vi.fn(),
    endExpressionDrag: vi.fn(),
  }),
}));

vi.mock('../editor/NodeParameterEditor', () => ({
  NodeParameterEditor: () => React.createElement('div', null, 'Parameter Editor'),
}));

describe('EditNodeModal', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    closeEditModal.mockReset();
    setIsEditingName.mockReset();
    setDraftNodeName.mockReset();
    handleUpdateData.mockReset();
    commitNodeName.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders modal content from the application view-model hook and closes on backdrop click', async () => {
    await act(async () => {
      root.render(React.createElement(EditNodeModal));
    });

    expect(container.textContent).toContain('Display Node');
    expect(container.textContent).toContain('No incoming connections.');

    const backdrop = container.firstElementChild as HTMLDivElement;
    await act(async () => {
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(closeEditModal).toHaveBeenCalled();
  });
});