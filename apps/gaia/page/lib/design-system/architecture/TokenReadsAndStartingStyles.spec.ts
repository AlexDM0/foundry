/**
 * Every custom property the package's stylesheets read through `var()` is one the package defines, so none leans on a host's token, and a
 * `@starting-style` rule starts only from colours, opacity or a filter, never a size or a place. The scan first proves it read the stylesheets,
 * tokens and starting styles, and each form is planted in memory.
 */
import { describe, expect, test } from 'bun:test';

import { COMPONENT_LAYERS, isShippingComponent, packageFilesMatching } from '../testing/PackageFiles.ts';

interface Declaration {
  readonly property: string;
  readonly value:    string;
}

interface StyleRule {
  readonly selector:     string;
  /** The at-rule the rule sits in, such as `@starting-style`; `null` at the top level. */
  readonly atRule:       string | null;
  readonly declarations: readonly Declaration[];
}

/** Properties a starting style may set: none of them sizes or places a box. */
const STARTING_PROPERTIES = new Set([
  'color',
  'background-color',
  'border-color',
  'box-shadow',
  'opacity',
  'filter',
  'text-decoration-color',
]);
const STARTING_STYLE_AT_RULE = '@starting-style';
const SMALLEST_STYLESHEET_COUNT = 60;
const SMALLEST_STARTING_STYLE_COUNT = 2;
const INLINE_PROPERTY_LITERAL = /['"](--[a-z][\w-]*)['"]/g;

function withoutComments(stylesheetText: string): string {
  return stylesheetText.replace(/\/\*[\s\S]*?\*\//g, '');
}

function declarationsOf(body: string): Declaration[] {
  return body.split(';').map((part) => part.trim()).filter((part) => part !== '' && part.includes(':')).map((part) => {
    const colonAt = part.indexOf(':');
    return { property: part.slice(0, colonAt).trim(), value: part.slice(colonAt + 1).trim() };
  });
}

/** Every rule of a stylesheet, those inside an at-rule included, at any depth; a rule keeps the innermost at-rule around it. */
function rulesOf(stylesheetText: string, atRule: string | null = null): StyleRule[] {
  const text = withoutComments(stylesheetText);
  const rules: StyleRule[] = [];
  let preludeStart = 0;
  let i = 0;
  while (i < text.length) {
    const openAt = text.indexOf('{', i);
    if (openAt === -1) break;
    let depth = 1;
    let closeAt = openAt + 1;
    while (closeAt < text.length && depth > 0) {
      if (text[closeAt] === '{') depth += 1;
      if (text[closeAt] === '}') depth -= 1;
      closeAt += 1;
    }
    const prelude = text.slice(preludeStart, openAt).split(';').at(-1)?.trim() ?? '';
    const body = text.slice(openAt + 1, closeAt - 1);
    if (prelude.startsWith('@')) rules.push(...rulesOf(body, prelude));
    else rules.push({ selector: prelude.replace(/\s+/g, ' '), atRule, declarations: declarationsOf(body) });
    preludeStart = closeAt;
    i = closeAt;
  }
  return rules;
}

/** Every custom property the package defines: declared in a stylesheet, or named in a component's source for its inline style. */
function definedPropertiesOf(stylesheetTexts: readonly string[], componentSourceTexts: readonly string[]): ReadonlySet<string> {
  const declared = stylesheetTexts.flatMap((stylesheetText) => rulesOf(stylesheetText)).flatMap((rule) => rule.declarations)
    .map((declaration) => declaration.property).filter((property) => property.startsWith('--'));
  const setInline = componentSourceTexts.flatMap((sourceText) => [...sourceText.matchAll(INLINE_PROPERTY_LITERAL)].map(([, property = '']) => property));
  return new Set([...declared, ...setInline]);
}

function tokenReadSentencesOf(path: string, stylesheetText: string, definedProperties: ReadonlySet<string>): string[] {
  return rulesOf(stylesheetText).flatMap((rule) => rule.declarations.flatMap((declaration) => [...declaration.value.matchAll(/var\(\s*(--[\w-]+)/g)]
    .map(([, property = '']) => property)
    .filter((property) => !definedProperties.has(property))
    .map((property) => `${path}: ${rule.selector} { ${declaration.property} } reads ${property}, which the package does not define`)));
}

function startingStyleSentencesOf(path: string, stylesheetText: string): string[] {
  return rulesOf(stylesheetText).filter((rule) => rule.atRule === STARTING_STYLE_AT_RULE).flatMap((rule) => rule.declarations
    .filter((declaration) => !STARTING_PROPERTIES.has(declaration.property))
    .map((declaration) => `${path}: ${rule.selector} starts from ${declaration.property}, which may size or place a box`));
}

const STYLESHEETS = [...COMPONENT_LAYERS.map((layer) => `${layer}/*.css`), 'styles/*.css'].flatMap((pattern) => packageFilesMatching(pattern));
const COMPONENT_SOURCES = COMPONENT_LAYERS.flatMap((layer) => packageFilesMatching(`${layer}/*.tsx`)).filter(({ path }) => isShippingComponent(path));
const DEFINED_PROPERTIES = definedPropertiesOf(STYLESHEETS.map(({ text }) => text), COMPONENT_SOURCES.map(({ text }) => text));

describe('the scan itself', () => {
  test('it reads the stylesheets of the package, the properties it defines and its starting styles', () => {
    expect(STYLESHEETS.length).toBeGreaterThanOrEqual(SMALLEST_STYLESHEET_COUNT);
    expect(STYLESHEETS.map(({ path }) => path)).toEqual(expect.arrayContaining(['styles/tokens.css', 'atoms/TextField.css', 'molecules/FailedAction.css']));
    expect(['--err-ink', '--motion-base', '--s-edge', '--segment-count'].map((property) => DEFINED_PROPERTIES.has(property))).toEqual([true, true, true, true]);
    const startingStyleRules = STYLESHEETS.flatMap(({ text }) => rulesOf(text)).filter((rule) => rule.atRule === STARTING_STYLE_AT_RULE);
    expect(startingStyleRules.length).toBeGreaterThanOrEqual(SMALLEST_STARTING_STYLE_COUNT);
    expect(rulesOf('@import "./a.css"; @starting-style { .a { opacity: 0; } } .b:hover { color: var(--ink); }').map((rule) => [rule.selector, rule.atRule]))
      .toEqual([['.a', STARTING_STYLE_AT_RULE], ['.b:hover', null]]);
  });
});

describe('the stylesheets of the package', () => {
  test('every custom property a stylesheet reads is one the package defines', () => {
    expect(STYLESHEETS.flatMap(({ path, text }) => tokenReadSentencesOf(path, text, DEFINED_PROPERTIES))).toEqual([]);
  });

  test('every starting style starts from no size or place', () => {
    expect(STYLESHEETS.flatMap(({ path, text }) => startingStyleSentencesOf(path, text))).toEqual([]);
  });
});

describe('the test still names each form, planted in memory', () => {
  test('a property no stylesheet or component defines is named, and a declared token and an inline property are not', () => {
    const plantedDefined = definedPropertiesOf([':root { --ink: #000; }'], ['const style = { \'--planted-count\': 3 };']);
    const planted = '.a { color: var(--planted-ink); } .b { color: var(--ink); grid-template-columns: repeat(var(--planted-count), 1fr); }';
    expect(tokenReadSentencesOf('planted.css', planted, plantedDefined)).toEqual([
      'planted.css: .a { color } reads --planted-ink, which the package does not define',
    ]);
  });

  test('a starting style that sizes or places a box is named, and one that starts from opacity is not', () => {
    const planted = '@starting-style { .a { opacity: 0; transform: translateY(4px); } } .b { height: 0; }';
    expect(startingStyleSentencesOf('planted.css', planted)).toEqual([
      'planted.css: .a starts from transform, which may size or place a box',
    ]);
  });
});
