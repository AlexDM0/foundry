/**
 * The packages' stylesheets and fonts as the visual harness inlines them. What matters: no import is left for a file page to miss, the
 * package's tokens come first as its entry orders them, the contributions package's components after the design-system package's, and
 * every face the font loader registers becomes one rule whose file is inline.
 */
import { describe, expect, test } from 'bun:test';

import { DesignSystemStylesheet } from './DesignSystemStylesheet.ts';

describe('the inlined stylesheet', () => {
  test('holds every imported stylesheet in place of its import, the tokens before the components', () => {
    const stylesheetText = DesignSystemStylesheet.text();
    expect(stylesheetText).not.toContain('@import');
    expect(stylesheetText.indexOf('--bg:')).toBeGreaterThan(0);
    expect(stylesheetText.indexOf('--bg:')).toBeLessThan(stylesheetText.indexOf('.design-system-button'));
  });

  test('holds the contributions package\'s components after the design-system package\'s', () => {
    const stylesheetText = DesignSystemStylesheet.text();
    expect(stylesheetText.indexOf('.design-system-button')).toBeLessThan(stylesheetText.indexOf('.design-system-failed-action'));
    expect(stylesheetText).toContain('.design-system-data-table');
  });
});

describe('the font rules', () => {
  test('give Inter and Newsreader one rule per unicode range, each file inline as woff2', () => {
    const fontFaceRules = DesignSystemStylesheet.fontFaceRules();
    expect([...fontFaceRules.matchAll(/font-family: "(\w+)";/g)].map(([, family]) => family)).toEqual(['Inter', 'Inter', 'Newsreader', 'Newsreader']);
    expect([...fontFaceRules.matchAll(/src: url\("data:font\/woff2;base64,[A-Za-z0-9+/]+=*"\) format\("woff2"\);/g)]).toHaveLength(4);
    expect(DesignSystemStylesheet.fontFaceRules()).toBe(fontFaceRules);
  });
});
