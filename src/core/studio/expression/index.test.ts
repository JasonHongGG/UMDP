import { describe, expect, it } from 'vitest';
import { readExpressionDragData, createLiteralExpressionSource } from './index';

function createDataTransfer(values: Record<string, string>): DataTransfer {
  return {
    getData: (type: string) => values[type] ?? '',
  } as DataTransfer;
}

describe('readExpressionDragData', () => {
  it('falls back to string literals for plain-text drops', () => {
    const source = readExpressionDragData(createDataTransfer({ 'text/plain': 'dead' }));

    expect(source).toEqual(createLiteralExpressionSource('dead', 'string'));
  });
});