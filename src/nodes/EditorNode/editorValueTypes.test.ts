import { describe, expect, it } from 'vitest';
import { classifyEditorScalarKind } from './editorValueTypes';

describe('classifyEditorScalarKind', () => {
  it('keeps primitive schema types as their native editor kinds', () => {
    expect(classifyEditorScalarKind('System.Int32', 123)).toBe('integer');
    expect(classifyEditorScalarKind('System.String', 'hello')).toBe('string');
    expect(classifyEditorScalarKind('System.Boolean', true)).toBe('boolean');
  });

  it('treats object reference types as address when runtime value is null', () => {
    expect(classifyEditorScalarKind('PlayerController', null)).toBe('address');
    expect(classifyEditorScalarKind('Gameplay.PlayerController', null)).toBe('address');
  });

  it('treats object reference types as address when runtime value is a hex pointer', () => {
    expect(classifyEditorScalarKind('PlayerController', '0x1234')).toBe('address');
    expect(classifyEditorScalarKind('System.Collections.Generic.List<PlayerController>', '0xABCDEF')).toBe('address');
  });

  it('does not reclassify unsupported types as address when runtime value is non-address data', () => {
    expect(classifyEditorScalarKind('GameState', 2)).toBe('unsupported');
    expect(classifyEditorScalarKind('CustomBlob', 'not-an-address')).toBe('unsupported');
  });
});