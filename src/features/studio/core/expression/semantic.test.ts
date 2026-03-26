import { describe, expect, it } from 'vitest';
import { createInputExpressionSource, createLiteralExpressionSource, createStaticExpressionSource } from './index';
import {
  classifyExpressionSemantic,
  classifySchemaTypeSemantic,
  normalizeExplicitAddressValue,
} from './semantic';

describe('expression semantic typing', () => {
  it('keeps generic text values as strings unless address semantics are explicit', () => {
    const genericSource = createInputExpressionSource('node-1', 'json-out', ['payload'], 'node.payload');

    expect(classifyExpressionSemantic(genericSource, '1')).toMatchObject({ kind: 'string' });
    expect(classifyExpressionSemantic(genericSource, '123')).toMatchObject({ kind: 'string' });
    expect(classifyExpressionSemantic(genericSource, 'abc')).toMatchObject({ kind: 'string' });
    expect(classifyExpressionSemantic(genericSource, 'dead')).toMatchObject({ kind: 'string' });
    expect(classifyExpressionSemantic(genericSource, 'cafe')).toMatchObject({ kind: 'string' });
  });

  it('treats only explicit address declarations or hints as addresses', () => {
    expect(classifyExpressionSemantic(createLiteralExpressionSource('0xCAFE', 'address'), '0xCAFE')).toMatchObject({ kind: 'address' });
    expect(classifyExpressionSemantic(createStaticExpressionSource('class-1' as never, 'field-1' as never, 'Enemy.ptr'), '0xCAFE')).toMatchObject({ kind: 'address', origin: 'source-hint' });
    expect(normalizeExplicitAddressValue('0xCAFE')).toBe('0xCAFE');
    expect(normalizeExplicitAddressValue('CAFE')).toBeNull();
  });

  it('derives editor schema semantics from CLR type names', () => {
    expect(classifySchemaTypeSemantic('System.Int32')).toMatchObject({ kind: 'number', numericKind: 'integer' });
    expect(classifySchemaTypeSemantic('System.Double')).toMatchObject({ kind: 'number', numericKind: 'float' });
    expect(classifySchemaTypeSemantic('System.UIntPtr')).toMatchObject({ kind: 'address' });
  });
});