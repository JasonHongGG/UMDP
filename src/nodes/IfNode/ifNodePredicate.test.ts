import { describe, expect, it } from 'vitest';
import { createInputExpressionSource, createLiteralExpressionSource, createStaticExpressionSource } from '../../core/studio/expression';
import {
  classifyIfScalarKind,
  coerceComparablePair,
  evaluateIfPredicate,
  getAllowedIfOperators,
  parseLiteralForIfKind,
} from './ifNodePredicate';

describe('ifNodePredicate', () => {
  it('classifies scalar kinds using declared source semantics before runtime heuristics', () => {
    expect(classifyIfScalarKind(createLiteralExpressionSource('true', 'boolean'), true)).toMatchObject({ kind: 'boolean' });
    expect(classifyIfScalarKind(createLiteralExpressionSource('12', 'number'), 12)).toMatchObject({ kind: 'number' });
    expect(classifyIfScalarKind(createLiteralExpressionSource('hello', 'string'), 'hello')).toMatchObject({ kind: 'string' });
    expect(classifyIfScalarKind(createLiteralExpressionSource('0x1234', 'address'), '0x1234')).toMatchObject({ kind: 'address' });
    expect(classifyIfScalarKind(createInputExpressionSource('stats-1', 'json-out', ['name'], 'stats.name'), 'dead')).toMatchObject({ kind: 'string' });
    expect(classifyIfScalarKind(createStaticExpressionSource('class-1' as never, 'member-1' as never, 'Enemy.HealthPtr'), '0x1234')).toMatchObject({ kind: 'address' });
    expect(classifyIfScalarKind(createInputExpressionSource('stats-1', 'json-out', ['value'], 'stats.value'), { ok: true })).toMatchObject({ kind: 'unsupported' });
  });

  it('returns operator matrices by scalar kind', () => {
    expect(getAllowedIfOperators('boolean')).toEqual(['is', 'is-not']);
    expect(getAllowedIfOperators('string')).toContain('contains');
    expect(getAllowedIfOperators('number')).toContain('gt');
  });

  it('parses literal values for the expected scalar kind', () => {
    expect(parseLiteralForIfKind('boolean', 'true')).toMatchObject({ valid: true, value: true });
    expect(parseLiteralForIfKind('number', '42')).toMatchObject({ valid: true, value: 42 });
    expect(parseLiteralForIfKind('address', '0x1234')).toMatchObject({ valid: true, value: '0x1234' });
    expect(parseLiteralForIfKind('address', '1234')).toMatchObject({ valid: false });
    expect(parseLiteralForIfKind('boolean', 'maybe')).toMatchObject({ valid: false });
  });

  it('normalizes comparable operands before evaluation', () => {
    expect(coerceComparablePair('address', '0x1234', '0x1234')).toMatchObject({ valid: true, left: '0x1234', right: '0x1234' });
    expect(coerceComparablePair('address', '1234', '0x1234')).toMatchObject({ valid: false });
    expect(coerceComparablePair('number', 10, '10')).toMatchObject({ valid: false });
  });

  it('evaluates predicates for literals and normalized values', () => {
    expect(evaluateIfPredicate('number', 10, 'gt', 5)).toBe(true);
    expect(evaluateIfPredicate('string', 'PlayerController', 'contains', 'Player')).toBe(true);
    expect(evaluateIfPredicate('boolean', true, 'is-not', false)).toBe(true);
  });
});