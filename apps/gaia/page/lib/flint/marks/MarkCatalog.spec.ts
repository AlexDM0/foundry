/** The mark catalog. What matters: no two marks share a name, each is found by its name, and the lightbulb declares the two gradients it fills with. */
import { expect, test } from 'bun:test';

import { MARK_CATALOG, markDefinitionOf } from './MarkCatalog.ts';

test('no two marks share a name, and each is found by its name', () => {
  expect(new Set(MARK_CATALOG.map((mark) => mark.name)).size).toBe(MARK_CATALOG.length);
  for (const mark of MARK_CATALOG) expect(markDefinitionOf(mark.name)).toBe(mark);
});

test('only the lightbulb has gradients, and each gradient id starts with flint-', () => {
  const gradients = MARK_CATALOG.flatMap((mark) => (mark.gradients ?? []).map((gradient) => [mark.name, gradient.id]));
  expect(gradients).toEqual([['lightbulb', 'flint-bulb-glass'], ['lightbulb', 'flint-bulb-fitting']]);
});
