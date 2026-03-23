// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddNodeModal } from './AddNodeModal';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const addNode = vi.fn();
const closeAddModal = vi.fn();

vi.mock('../../../application/studio/useStudioAddNodeModalState', () => ({
  useStudioAddNodeModalState: () => ({
    catalog: {
      getAll: () => [{
        manifest: {
          type: 'display',
          displayName: 'Display',
          description: 'Show a value',
          category: 'Output',
        },
        icon: () => React.createElement('span', null, 'I'),
      }],
    },
    addNode,
    isAddModalOpen: true,
    closeAddModal,
    addModalPosition: { x: 40, y: 60 },
    transform: { x: 0, y: 0, scale: 1 },
    classes: [],
    classCatalog: { createNodeRequest: vi.fn() },
  }),
}));

describe('AddNodeModal', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    addNode.mockReset();
    closeAddModal.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('adds a generic node through the application hook state', async () => {
    await act(async () => {
      root.render(React.createElement(AddNodeModal));
    });

    const displayButton = Array.from(container.querySelectorAll('button')).find((element) => element.textContent?.includes('Display'));
    expect(displayButton).toBeTruthy();

    await act(async () => {
      displayButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(addNode).toHaveBeenCalledWith('display', { x: 40, y: 60 });
    expect(closeAddModal).toHaveBeenCalled();
  });
});