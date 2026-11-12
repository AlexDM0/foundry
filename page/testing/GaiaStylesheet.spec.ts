/** The stylesheet reader the component specs use. What matters: it reads the real gaia.css, and it finds a variant only by its exact selector. */
import { describe, expect, test } from 'bun:test';

import { GaiaStylesheet } from './GaiaStylesheet.ts';

describe('the variant check', () => {
  test('it reads gaia.css, where the design system section stands', () => {
    expect(GaiaStylesheet.text()).toContain('.gaia-button');
  });

  test('a variant is found by its exact class and attribute value, and not by another value or class', () => {
    const planted = '.gaia-pill[data-tone="error"] { color: var(--err-ink); }';
    expect(GaiaStylesheet.stylesVariant(planted, 'gaia-pill', 'data-tone', 'error')).toBe(true);
    expect(GaiaStylesheet.stylesVariant(planted, 'gaia-pill', 'data-tone', 'warn')).toBe(false);
    expect(GaiaStylesheet.stylesVariant(planted, 'gaia-tag', 'data-tone', 'error')).toBe(false);
  });
});
