import { describe, expect, it } from 'vitest';
import { createLiteralExpressionSource } from '../../core/studio/expression';
import ParametersNodeDef from './ParametersNode';

describe('ParametersNode', () => {
  it('hydrates persisted parameter types and values from document state', () => {
    const hydrated = ParametersNodeDef.hydrateData?.({
      id: 'params-1',
      nodeType: 'string-params',
      typeVersion: 1,
      position: { x: 0, y: 0 },
      displayName: 'Params',
      parameters: {},
      bindings: {},
      documentState: {
        symbols: [{
          stableId: 'symbol-1',
          name: 'lives',
          valueType: 'integer',
          valueSource: createLiteralExpressionSource('3', 'number'),
        }],
      },
    }, {});

    expect(hydrated?.parameters).toEqual([{
      id: 'symbol-1',
      name: 'lives',
      type: 'integer',
      source: createLiteralExpressionSource('3', 'number'),
    }]);
  });

  it('materializes typed payload values during execution', () => {
    const result = ParametersNodeDef.executionContract?.execute({
      documentId: 'doc-1',
      nodeId: 'params-1',
      nodeType: 'string-params',
      parameters: {},
      bindings: {},
      resolvedBindings: {},
      documentState: {
        symbols: [{
          stableId: 'symbol-1',
          name: 'lives',
          valueType: 'integer',
          valueSource: createLiteralExpressionSource('3', 'number'),
        }, {
          stableId: 'symbol-2',
          name: 'speed',
          valueType: 'float',
          valueSource: createLiteralExpressionSource('2.5', 'number'),
        }, {
          stableId: 'symbol-3',
          name: 'enabled',
          valueType: 'boolean',
          valueSource: createLiteralExpressionSource('true', 'boolean'),
        }],
      },
      runtimeState: {},
      inputBindings: {},
      resolvedInputs: {},
      controlInputs: [],
      getClassInfoCatalogByBinding: () => null,
      abortSignal: null,
      reportProgress: () => undefined,
    });

    if (!result || result instanceof Promise || result.state !== 'success') {
      throw new Error('Expected successful execution result.');
    }

    expect(result.outputs?.['params-out']).toMatchObject({
      payload: {
        lives: { type: 'integer', value: 3 },
        speed: { type: 'float', value: 2.5 },
        enabled: { type: 'boolean', value: true },
      },
    });
  });

  it('reports validation errors for invalid typed literals', () => {
    const issues = ParametersNodeDef.executionContract?.validate({
      documentId: 'doc-1',
      nodeId: 'params-1',
      nodeType: 'string-params',
      parameters: {},
      bindings: {},
      resolvedBindings: {},
      documentState: {
        symbols: [{
          stableId: 'symbol-1',
          name: 'lives',
          valueType: 'integer',
          valueSource: createLiteralExpressionSource('3.5', 'number'),
        }],
      },
      runtimeState: {},
      inputBindings: {},
      resolvedInputs: {},
      controlInputs: [],
      getClassInfoCatalogByBinding: () => null,
      abortSignal: null,
      reportProgress: () => undefined,
    });

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'parameters.value.invalid',
        message: 'lives: Integer parameter must not contain a decimal value.',
      }),
    ]);
  });
});