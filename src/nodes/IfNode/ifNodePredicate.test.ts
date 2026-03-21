import { describe, expect, it } from 'vitest';
import {
  classifyIfScalarKind,
  coerceComparablePair,
  evaluateIfPredicate,
  getAllowedIfOperators,
  parseLiteralForIfKind,
} from './ifNodePredicate';

describe('ifNodePredicate', () => {
  it('classifies scalar kinds using runtime values', () => {
    expect(classifyIfScalarKind(true)).toBe('boolean');
    expect(classifyIfScalarKind(12)).toBe('number');
    expect(classifyIfScalarKind('hello')).toBe('string');
    expect(classifyIfScalarKind('0x1234')).toBe('address');
    expect(classifyIfScalarKind({ ok: true })).toBe('unsupported');
  });

  it('returns operator matrices by scalar kind', () => {
    expect(getAllowedIfOperators('boolean')).toEqual(['is', 'is-not']);
    expect(getAllowedIfOperators('string')).toContain('contains');
    expect(getAllowedIfOperators('number')).toContain('gt');
  });

  it('parses literal values for the expected scalar kind', () => {
    expect(parseLiteralForIfKind('boolean', 'true')).toMatchObject({ valid: true, value: true });
    expect(parseLiteralForIfKind('number', '42')).toMatchObject({ valid: true, value: 42 });
    expect(parseLiteralForIfKind('address', '1234')).toMatchObject({ valid: true, value: '0x1234' });
    expect(parseLiteralForIfKind('boolean', 'maybe')).toMatchObject({ valid: false });
  });

  it('normalizes comparable operands before evaluation', () => {
    expect(coerceComparablePair('address', '1234', '0x1234')).toMatchObject({ valid: true, left: '0x1234', right: '0x1234' });
    expect(coerceComparablePair('number', 10, '10')).toMatchObject({ valid: false });
  });

  it('evaluates predicates for literals and normalized values', () => {
    expect(evaluateIfPredicate('number', 10, 'gt', 5)).toBe(true);
    expect(evaluateIfPredicate('string', 'PlayerController', 'contains', 'Player')).toBe(true);
    expect(evaluateIfPredicate('boolean', true, 'is-not', false)).toBe(true);
  });
});