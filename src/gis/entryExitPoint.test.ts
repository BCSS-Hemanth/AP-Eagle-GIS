import { describe, expect, it } from 'vitest';
import {
  classifyEntryExit,
  colorForEntryExitKind,
  entryExitHoverLabel,
} from './entryExitPoint';

describe('entryExitPoint', () => {
  it('classifies Entry / Exit / Entry-Exit names from KMZ', () => {
    expect(classifyEntryExit({ name: 'Entry' })).toBe('entry');
    expect(classifyEntryExit({ name: 'Exit' })).toBe('exit');
    expect(classifyEntryExit({ name: 'Entry/Exit' })).toBe('both');
    expect(classifyEntryExit({ name: 'Entry / Exit' })).toBe('both');
    expect(classifyEntryExit({ name: '' })).toBe('unknown');
  });

  it('returns distinct hover labels', () => {
    expect(entryExitHoverLabel({ name: 'Entry' })).toBe('Entry Point');
    expect(entryExitHoverLabel({ name: 'Exit' })).toBe('Exit Point');
    expect(entryExitHoverLabel({ name: 'Entry/Exit' })).toBe('Entry / Exit Point');
  });

  it('uses distinct marker colours per kind', () => {
    expect(colorForEntryExitKind('entry')).not.toBe(colorForEntryExitKind('exit'));
    expect(colorForEntryExitKind('both')).not.toBe(colorForEntryExitKind('entry'));
  });
});
