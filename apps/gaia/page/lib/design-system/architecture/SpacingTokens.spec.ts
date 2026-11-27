/**
 * A space in a stylesheet of the package (a component's or one of `styles/`) is a token of the spacing scale, never a pixel literal. What
 * matters: a margin, padding or gap (and their longhands) names no `<n>px`, so every space reads the one scale the spacing props read; an
 * offset that keeps a floating box apart from its anchor, `calc(100% + <n>px)`, is a space too. Two forms stay literal on purpose: a
 * hairline pull, `margin-<side>: -1px` in a rule that also draws a border on that side, is a border width; and a plain offset
 * (`top: 38px`) places a part by its geometry. Any other `-1px` is a space. Sizes, borders and radii are no spaces. The scan first proves
 * it read the stylesheets and their spaces, and each form is planted in memory.
 */
import { describe, expect, test } from 'bun:test';

import { COMPONENT_LAYERS, packageFilesMatching } from '../testing/PackageFiles.ts';

const SPACING_PROPERTY = /^(?:(?:margin|padding|scroll-margin|scroll-padding)(?:-[a-z-]+)?|gap|row-gap|column-gap)$/;
const OFFSET_PROPERTY = /^(?:top|right|bottom|left|inset(?:-[a-z-]+)?)$/;
const PIXEL_LITERAL = /(?<![\w.-])-?\d*\.?\d+px\b/g;
const OFFSET_FROM_ANCHOR = /calc\(\s*100%\s*[+-]\s*\d*\.?\d+px\s*\)/g;
const HAIRLINE_PULL = '-1px';
const PULLED_SIDE = /^margin-(top|right|bottom|left)$/;
const NO_BORDER = /^(?:0|none)$/;
const SMALLEST_STYLESHEET_COUNT = 40;
const SMALLEST_SPACING_DECLARATION_COUNT = 100;

interface Declaration {
  readonly property: string;
  readonly value:    string;
}

/** The declarations of each innermost rule, so a declaration can be read beside the others of its own rule. */
function rulesOf(stylesheet: string): Declaration[][] {
  const withoutComments = stylesheet.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/\{([^{}]*)\}/g)].map(([, body = '']) => [...`;${body}`.matchAll(/;\s*([a-z-]+)\s*:\s*([^;]*)/g)]
    .map(([, property = '', value = '']) => ({ property, value: value.trim() })));
}

function declarationsOf(stylesheet: string): Declaration[] {
  return rulesOf(stylesheet).flat();
}

/** `margin-<side>: -1px` where the same rule draws a border on that side: the element's border overlaps its neighbour's. */
function isHairlinePull({ property, value }: Declaration, rule: readonly Declaration[]): boolean {
  const side = PULLED_SIDE.exec(property)?.[1];
  if (side === undefined || value !== HAIRLINE_PULL) return false;
  return rule.some((declaration) => (declaration.property === 'border' || declaration.property === `border-${side}`) && !NO_BORDER.test(declaration.value));
}

function spacingDeclarationsOf(stylesheet: string): Declaration[] {
  return declarationsOf(stylesheet).filter((declaration) => SPACING_PROPERTY.test(declaration.property));
}

function pixelSpaceSentencesOf(path: string, stylesheet: string): string[] {
  const sentences: string[] = [];
  for (const rule of rulesOf(stylesheet)) {
    for (const declaration of rule) {
      const { property, value } = declaration;
      const pixelSpaces = SPACING_PROPERTY.test(property)
        ? (isHairlinePull(declaration, rule) ? [] : [...value.matchAll(PIXEL_LITERAL)].map(([literal]) => literal))
        : OFFSET_PROPERTY.test(property) ? [...value.matchAll(OFFSET_FROM_ANCHOR)].map(([literal]) => literal) : [];
      for (const literal of pixelSpaces) sentences.push(`${path}: ${property}: ${value} holds ${literal}, not a --space-… token`);
    }
  }
  return sentences;
}

const stylesheets = [...COMPONENT_LAYERS.map((layer) => `${layer}/*.css`), 'styles/*.css'].flatMap((pattern) => packageFilesMatching(pattern));

describe('the spaces of the package stylesheets', () => {
  test('the scan reads the component stylesheets, the stylesheets of styles/, and their spaces', () => {
    const paths = stylesheets.map((file) => file.path);
    expect(paths.length).toBeGreaterThanOrEqual(SMALLEST_STYLESHEET_COUNT);
    expect(paths).toEqual(expect.arrayContaining(['atoms/Button.css', 'organisms/Tabs.css', 'styles/base.css', 'styles/tokens.css', 'styles/design-system.css']));
    const spacingDeclarationCount = stylesheets.reduce((count, file) => count + spacingDeclarationsOf(file.text).length, 0);
    expect(spacingDeclarationCount).toBeGreaterThanOrEqual(SMALLEST_SPACING_DECLARATION_COUNT);
  });

  test('the scan reads a declaration beside the others of its rule, inside an at-rule too', () => {
    expect(rulesOf('@media (min-width: 10px) { .a { margin-top: -1px; border-top: 1px solid var(--line); } }\n.b { gap: 0 }'))
      .toEqual([[{ property: 'margin-top', value: '-1px' }, { property: 'border-top', value: '1px solid var(--line)' }], [{ property: 'gap', value: '0' }]]);
  });

  test('no margin, padding, gap or offset from an anchor holds a pixel literal', () => {
    expect(stylesheets.flatMap((file) => pixelSpaceSentencesOf(file.path, file.text))).toEqual([]);
  });

  test('a pixel gap, padding, longhand margin, negative margin and offset from an anchor are each refused', () => {
    const planted = [
      '.a { gap: 2px var(--space-4); }',
      '.b { padding: var(--space-8) 13px; }',
      '.c { margin-left: 6px; }',
      '.d { margin-top: -12px; }',
      '.e { top: calc(100% + 6px); }',
      '.f:hover { row-gap: 1.5px }',
      '.g { margin-top: -1px; height: 2px; }',
      '.h { margin: -1px; border: 1px solid var(--line); }',
      '.i { margin-bottom: -1px; border-top: 1px solid var(--line); border-bottom: 0; }',
    ].join('\n');
    expect(pixelSpaceSentencesOf('planted.css', planted)).toEqual([
      'planted.css: gap: 2px var(--space-4) holds 2px, not a --space-… token',
      'planted.css: padding: var(--space-8) 13px holds 13px, not a --space-… token',
      'planted.css: margin-left: 6px holds 6px, not a --space-… token',
      'planted.css: margin-top: -12px holds -12px, not a --space-… token',
      'planted.css: top: calc(100% + 6px) holds calc(100% + 6px), not a --space-… token',
      'planted.css: row-gap: 1.5px holds 1.5px, not a --space-… token',
      'planted.css: margin-top: -1px holds -1px, not a --space-… token',
      'planted.css: margin: -1px holds -1px, not a --space-… token',
      'planted.css: margin-bottom: -1px holds -1px, not a --space-… token',
    ]);
  });

  test('a token, a negated token, a hairline pull on a bordered side, a commented space, a size and a placing offset pass', () => {
    const planted = [
      '.a { gap: var(--space-2); padding: 0 var(--sp-3); margin-left: calc(-1 * var(--space-12)); }',
      '.b { margin-bottom: -1px; height: 36px; border: 1px solid var(--line); top: 38px; left: calc(100% + var(--space-8)); }',
      '.c { margin-left: -1px; border-left: 2px solid transparent; }',
      '/* padding: 13px 14px; */',
    ].join('\n');
    expect(pixelSpaceSentencesOf('planted.css', planted)).toEqual([]);
  });
});
