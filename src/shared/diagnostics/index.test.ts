// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  DIAGNOSTICS_STORAGE_KEY,
  configureDiagnostics,
  createDiagnosticsLogger,
  getDiagnosticsBuffer,
  getDiagnosticsPolicy,
  resetDiagnosticsStateForTests,
  setDiagnosticsRuntimeOverride,
} from './index';

describe('diagnostics', () => {
  beforeEach(() => {
    resetDiagnosticsStateForTests();
  });

  it('captures buffered records when diagnostics are enabled', () => {
    configureDiagnostics({
      clearBuffer: true,
      policy: {
        enabled: true,
        captureBuffer: true,
        consoleOutput: false,
        minimumLevel: 'warn',
      },
    });

    const logger = createDiagnosticsLogger({
      channel: 'studio',
      origin: 'diagnostics-test',
    });

    logger.debug('ignored debug event');
    logger.error('captured error event', {
      error: new Error('boom'),
      context: {
        runId: 'run-1',
      },
    });

    expect(getDiagnosticsBuffer()).toEqual([
      expect.objectContaining({
        level: 'error',
        channel: 'studio',
        origin: 'diagnostics-test',
        message: 'captured error event',
        context: expect.objectContaining({
          runId: 'run-1',
        }),
        error: expect.objectContaining({
          message: 'boom',
        }),
      }),
    ]);
  });

  it('reads localStorage runtime overrides into policy state', () => {
    setDiagnosticsRuntimeOverride({
      enabled: true,
      minimumLevel: 'info',
      channels: ['scene'],
      origins: ['sceneWorkspaceState'],
      captureBuffer: true,
      consoleOutput: false,
      maxBufferEntries: 25,
    });

    expect(window.localStorage.getItem(DIAGNOSTICS_STORAGE_KEY)).not.toBeNull();
    expect(getDiagnosticsPolicy()).toEqual(expect.objectContaining({
      enabled: true,
      minimumLevel: 'info',
      channels: ['scene'],
      origins: ['sceneWorkspaceState'],
      captureBuffer: true,
      consoleOutput: false,
      maxBufferEntries: 25,
    }));
  });
});