// PhantomOS v2 — Identity Rail glyph helper tests
// Author: Subash Karki

import { describe, it, expect } from 'vitest';
import { projectGlyph, branchChip } from './glyph';

describe('glyph', () => {
  it.each([
    ['phantom-os', 'PO'], ['feature-web-apps', 'FW'], ['frontend-mono-repo', 'FM'],
    ['single', 'SI'], ['', '??'], ['  ', '??'], ['a', 'AA'], ['Hello World', 'HW'],
  ])('projectGlyph(%j) -> %s', (input, expected) => {
    expect(projectGlyph(input)).toBe(expected);
  });

  it.each([
    ['CP-40850-granularity-dropdown', 'GRAN'], ['feat/auth', 'AUTH'], ['main', 'MAIN'],
    ['release/2026.04', '2026'], ['', '????'], ['feature/', 'FEAT'], ['/', '????'],
  ])('branchChip(%j) -> %s', (input, expected) => {
    expect(branchChip(input)).toBe(expected);
  });
});
