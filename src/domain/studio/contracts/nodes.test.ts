import { describe, expect, it } from 'vitest';
import { createLiteralExpressionSource } from '../../../core/studio/expression';
import { parseParameterNodeDocumentState } from './nodes';

describe('parseParameterNodeDocumentState', () => {
  it('keeps only symbols with explicit typed value metadata', () => {
    expect(parseParameterNodeDocumentState({
      symbols: [{
        stableId: 'symbol-1',
        name: 'speed',
        valueType: 'float',
        valueSource: createLiteralExpressionSource('2.5', 'number'),
      }, {
        stableId: 'symbol-3',
        name: 'playerAddress',
        valueType: 'address',
        valueSource: createLiteralExpressionSource('0x1234', 'address'),
      }, {
        stableId: 'symbol-2',
        name: 'legacy',
        valueSource: createLiteralExpressionSource('old', 'string'),
      }],
    })).toEqual({
      symbols: [{
        stableId: 'symbol-1',
        name: 'speed',
        valueType: 'float',
        valueSource: createLiteralExpressionSource('2.5', 'number'),
      }, {
        stableId: 'symbol-3',
        name: 'playerAddress',
        valueType: 'address',
        valueSource: createLiteralExpressionSource('0x1234', 'address'),
      }],
    });
  });
});