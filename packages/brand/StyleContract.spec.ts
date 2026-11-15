/**
 * The brand's style contract, read from its stylesheets and its marks as React renders them. What matters: each mark's stylesheet styles
 * exactly the classes that mark draws, at every size, and every class is the mark's own; every token a stylesheet reads is a token of
 * `styles/tokens.css`, which gives each one a light and a dark value; and `styles/brand.css` imports the tokens, then each mark's stylesheet
 * once. Each guard is first proved on a planted case.
 */
import { describe, expect, test }            from 'bun:test';
import { type ComponentType, createElement } from 'react';
import { renderToStaticMarkup }              from 'react-dom/server';

import { ForgeMark }                                 from './marks/ForgeMark.tsx';
import { GaiaMark, SMALL_DRAWING_BELOW_SIZE_PIXELS } from './marks/GaiaMark.tsx';
import { PackageFiles }                              from './testing/PackageFiles.ts';

interface MarkUnderContract {
  readonly name:      string;
  readonly classStem: string;
  readonly component: ComponentType<{ readonly sizePixels?: number }>;
}

const MARKS: readonly MarkUnderContract[] = [
  { name: 'GaiaMark', classStem: 'brand-gaia-mark', component: GaiaMark },
  { name: 'ForgeMark', classStem: 'brand-forge-mark', component: ForgeMark },
];

/** Each drawing a mark has: the small one just below the threshold, the large one from it on. */
const DRAWN_SIZES_PIXELS = [SMALL_DRAWING_BELOW_SIZE_PIXELS - 1, SMALL_DRAWING_BELOW_SIZE_PIXELS];

const CLASS_ATTRIBUTE = /class="([^"]+)"/g;
const CLASS_SELECTOR = /\.([\w-]+)/g;
const TOKEN_READ = /var\((--[\w-]+)\)/g;
const TOKEN_DEFINITION = /(--[\w-]+)\s*:/g;
const STYLESHEET_IMPORT = /@import\s+"([^"]+)";/g;

function drawnClassesOf(mark: MarkUnderContract): Set<string> {
  const markup = DRAWN_SIZES_PIXELS.map((sizePixels) => renderToStaticMarkup(createElement(mark.component, { sizePixels }))).join('');
  return new Set([...markup.matchAll(CLASS_ATTRIBUTE)].flatMap((match) => (match[1] ?? '').split(' ')));
}

function styledClassesOf(stylesheetText: string): Set<string> {
  return new Set([...stylesheetText.matchAll(CLASS_SELECTOR)].map((match) => match[1] ?? ''));
}

function classSentencesOf(classStem: string, drawn: ReadonlySet<string>, styled: ReadonlySet<string>): string[] {
  return [
    ...[...drawn].filter((className) => !styled.has(className)).map((className) => `${className} is drawn but not styled`),
    ...[...styled].filter((className) => !drawn.has(className)).map((className) => `${className} is styled but not drawn`),
    ...[...drawn].filter((className) => className !== classStem && !className.startsWith(`${classStem}-`)).map((className) => `${className} is not the mark's own`),
  ];
}

function tokensDefinedIn(stylesheetText: string): Set<string> {
  return new Set([...stylesheetText.matchAll(TOKEN_DEFINITION)].map((match) => match[1] ?? ''));
}

const DARK_THEME_SELECTOR = ':root[data-theme="dark"] {';

function themeBlocksOf(tokensText: string): { readonly light: string; readonly dark: string } {
  const darkThemeStart = tokensText.indexOf(DARK_THEME_SELECTOR);
  return { light: tokensText.slice(0, darkThemeStart), dark: tokensText.slice(darkThemeStart) };
}

describe('the brand\'s style contract', () => {
  test('a planted unstyled class, an unused rule and a foreign class are caught', () => {
    const drawn = new Set(['brand-planted-mark', 'brand-planted-mark-ring', 'gaia-ring']);
    expect(classSentencesOf('brand-planted-mark', drawn, new Set(['brand-planted-mark', 'brand-planted-mark-core']))).toEqual([
      'brand-planted-mark-ring is drawn but not styled',
      'gaia-ring is drawn but not styled',
      'brand-planted-mark-core is styled but not drawn',
      'gaia-ring is not the mark\'s own',
    ]);
  });

  test('each mark\'s stylesheet styles exactly the classes it draws, each of them its own', () => {
    for (const mark of MARKS) {
      const drawn = drawnClassesOf(mark);
      expect(drawn.size).toBeGreaterThan(1);
      expect(classSentencesOf(mark.classStem, drawn, styledClassesOf(PackageFiles.text(`marks/${mark.name}.css`)))).toEqual([]);
    }
  });

  test('every token a stylesheet reads is defined in both themes, and each theme defines the same tokens', () => {
    const { light, dark } = themeBlocksOf(PackageFiles.text('styles/tokens.css'));
    expect([...tokensDefinedIn(dark)]).toEqual([...tokensDefinedIn(light)]);
    const defined = tokensDefinedIn(light);
    const read = MARKS.flatMap((mark) => [...PackageFiles.text(`marks/${mark.name}.css`).matchAll(TOKEN_READ)].map((match) => match[1] ?? ''));
    expect(read.length).toBeGreaterThan(0);
    expect(read.filter((tokenName) => !defined.has(tokenName))).toEqual([]);
    expect([...defined].filter((tokenName) => !read.includes(tokenName))).toEqual([]);
  });

  test('the entry stylesheet imports the tokens, then each mark\'s stylesheet once', () => {
    const imported = [...PackageFiles.text('styles/brand.css').matchAll(STYLESHEET_IMPORT)].map((match) => match[1]);
    expect(imported).toEqual(['./tokens.css', ...MARKS.map((mark) => `../marks/${mark.name}.css`)]);
  });
});
