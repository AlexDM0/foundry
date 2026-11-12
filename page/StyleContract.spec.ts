/**
 * Gaia's style contract, read from the stylesheets and the components themselves. What matters: every text pair of COMPONENT_LIBRARY
 * section 4 holds 4.5:1 in both themes, computed from `tokens.css` as WCAG 2 text pairs; every colour token has a light and a dark value;
 * `gaia.css` holds no colour value and reads only tokens that exist; a hover or press rule changes no size or place; and every class a
 * shipping component emits is styled, and every styled class emitted. Each guard is first proved on a planted case, in memory.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';
import typescript                 from 'typescript';

const PAGE_FOLDER = import.meta.dir;
const TOKENS_PATH = join(PAGE_FOLDER, 'styles', 'tokens.css');
const STYLESHEET_PATH = join(PAGE_FOLDER, 'styles', 'gaia.css');
const SMALLEST_CONTRAST_RATIO = 4.5;
const SMALLEST_CLASS_COUNT = 20;

/** COMPONENT_LIBRARY section 4: each text token on each ground it is set on. */
const TEXT_PAIRS: readonly (readonly [text: string, ground: string])[] = [
  ['--ink', '--bg'],
  ['--ink', '--surface'],
  ['--ink', '--surface-2'],
  ['--ink', '--surface-selected'],
  ['--ink-muted', '--bg'],
  ['--ink-muted', '--surface'],
  ['--ink-muted', '--surface-2'],
  ['--ink-muted', '--surface-selected'],
  ['--link', '--bg'],
  ['--link', '--surface'],
  ['--warn-ink', '--warn-tint'],
  ['--err-ink', '--err-tint'],
  ['--attn-ink', '--attn-tint'],
  ['--attn-ink', '--surface'],
  ['--bg', '--ink'],
];

/** Properties a hover or a press may change: none of them sizes or places a box. */
const FEEDBACK_PROPERTIES = new Set([
  'color',
  'background',
  'background-color',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'box-shadow',
  'opacity',
  'outline-color',
  'text-decoration',
  'text-decoration-line',
  'text-decoration-color',
  'cursor',
]);

const COLOUR_FUNCTION_PATTERN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/i;
const HEX_COLOUR_PATTERN = /#[0-9a-f]{3,8}\b/i;

/** The CSS named colours, `transparent` among them; `currentColor` names no colour of its own and stays allowed. */
const NAMED_COLOURS = new Set(`
  aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse
  chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta
  darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet
  deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green
  greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral
  lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
  lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple
  mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite
  navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink
  plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
  slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow
  yellowgreen transparent
`.trim().split(/\s+/));

interface StyleRule {
  readonly selector:     string;
  /** The at-rule the rule sits in, such as `@media (prefers-reduced-motion: reduce)`; `null` at the top level. */
  readonly atRule:       string | null;
  readonly declarations: readonly Declaration[];
}

interface Declaration {
  readonly property: string;
  readonly value:    string;
}

type Theme = 'light' | 'dark';

type ColourReading = { readonly verdict: 'readable'; readonly luminance: number } | { readonly verdict: 'unreadable'; readonly reason: string };

function withoutComments(stylesheetText: string): string {
  return stylesheetText.replace(/\/\*[\s\S]*?\*\//g, '');
}

function declarationsOf(body: string): Declaration[] {
  return body.split(';').map((part) => part.trim()).filter((part) => part !== '').map((part) => {
    const colonAt = part.indexOf(':');
    return { property: part.slice(0, colonAt).trim(), value: part.slice(colonAt + 1).trim() };
  });
}

/** Every rule of a stylesheet, those inside an at-rule included; nesting deeper than one at-rule is not read. */
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
    const prelude = text.slice(preludeStart, openAt).trim();
    const body = text.slice(openAt + 1, closeAt - 1);
    if (prelude.startsWith('@')) rules.push(...rulesOf(body, prelude));
    else rules.push({ selector: prelude, atRule, declarations: declarationsOf(body) });
    preludeStart = closeAt;
    i = closeAt;
  }
  return rules;
}

/** The custom properties a theme defines at the top level: the light theme is `:root`; the dark theme is `:root` under its own block. */
function tokensOf(rules: readonly StyleRule[], theme: Theme): ReadonlyMap<string, string> {
  const tokens = new Map<string, string>();
  const themeSelectors = theme === 'light' ? [':root'] : [':root', ':root[data-theme="dark"]'];
  for (const themeSelector of themeSelectors) {
    rules
      .filter((rule) => rule.atRule === null && rule.selector === themeSelector)
      .flatMap((rule) => rule.declarations)
      .filter((declaration) => declaration.property.startsWith('--'))
      .forEach((declaration) => tokens.set(declaration.property, declaration.value));
  }
  return tokens;
}

function resolvedValueOf(tokens: ReadonlyMap<string, string>, tokenName: string, visited: ReadonlySet<string> = new Set()): string | null {
  const value = tokens.get(tokenName);
  if (value === undefined || visited.has(tokenName)) return null;
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  if (reference?.[1] !== undefined) return resolvedValueOf(tokens, reference[1], new Set([...visited, tokenName]));
  return value;
}

function oklchComponentOf(text: string): number {
  return text.endsWith('%') ? Number.parseFloat(text) / 100 : Number.parseFloat(text);
}

/** WCAG 2's relative luminance of an opaque `oklch()` colour, through linear sRGB clipped to the gamut. */
function luminanceOf(colourText: string): ColourReading {
  const match = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?))?\s*\)$/.exec(colourText);
  if (match === null) return { verdict: 'unreadable', reason: `${colourText} is not an oklch() colour` };
  const [, lightnessText = '', chromaText = '', hueText = '', alphaText] = match;
  if (alphaText !== undefined && oklchComponentOf(alphaText) < 1) return { verdict: 'unreadable', reason: `${colourText} is not opaque` };
  const lightness = oklchComponentOf(lightnessText);
  const chroma = Number.parseFloat(chromaText);
  const hueRadians = (Number.parseFloat(hueText) * Math.PI) / 180;
  const greenRedAxis = chroma * Math.cos(hueRadians);
  const blueYellowAxis = chroma * Math.sin(hueRadians);
  const longCone = (lightness + 0.3963377774 * greenRedAxis + 0.2158037573 * blueYellowAxis) ** 3;
  const mediumCone = (lightness - 0.1055613458 * greenRedAxis - 0.0638541728 * blueYellowAxis) ** 3;
  const shortCone = (lightness - 0.0894841775 * greenRedAxis - 1.291485548 * blueYellowAxis) ** 3;
  const clipped = (channel: number) => Math.min(1, Math.max(0, channel));
  const red = clipped(4.0767416621 * longCone - 3.3077115913 * mediumCone + 0.2309699292 * shortCone);
  const green = clipped(-1.2684380046 * longCone + 2.6097574011 * mediumCone - 0.3413193965 * shortCone);
  const blue = clipped(-0.0041960863 * longCone - 0.7034186147 * mediumCone + 1.707614701 * shortCone);
  return { verdict: 'readable', luminance: 0.2126 * red + 0.7152 * green + 0.0722 * blue };
}

function contrastRatioOf(firstLuminance: number, secondLuminance: number): number {
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function contrastSentencesOf(tokensText: string): string[] {
  const rules = rulesOf(tokensText);
  return (['light', 'dark'] as const).flatMap((theme) => {
    const tokens = tokensOf(rules, theme);
    return TEXT_PAIRS.flatMap(([textToken, groundToken]) => {
      const readings = [textToken, groundToken].map((tokenName) => {
        const value = resolvedValueOf(tokens, tokenName);
        return value === null ? { verdict: 'unreadable', reason: `${tokenName} is not defined` } as const : luminanceOf(value);
      });
      const [textReading, groundReading] = readings;
      if (textReading?.verdict !== 'readable' || groundReading?.verdict !== 'readable') {
        return readings.flatMap((reading) => (reading.verdict === 'unreadable' ? [`${theme}: ${textToken} on ${groundToken} cannot be read: ${reading.reason}`] : []));
      }
      const ratio = contrastRatioOf(textReading.luminance, groundReading.luminance);
      return ratio >= SMALLEST_CONTRAST_RATIO ? [] : [`${theme}: ${textToken} on ${groundToken} is ${ratio.toFixed(2)}:1, under ${SMALLEST_CONTRAST_RATIO}:1`];
    });
  });
}

function holdsAColour(value: string): boolean {
  return COLOUR_FUNCTION_PATTERN.test(value) || HEX_COLOUR_PATTERN.test(value);
}

/** Colour tokens are those whose value holds a colour; each theme must give every one of them its own value. */
function themeGapSentencesOf(tokensText: string): string[] {
  const rules = rulesOf(tokensText);
  const lightColourTokens = [...tokensOf(rules, 'light')].filter(([, value]) => holdsAColour(value)).map(([tokenName]) => tokenName);
  const darkOverrides = new Set(rules
    .filter((rule) => rule.atRule === null && rule.selector === ':root[data-theme="dark"]')
    .flatMap((rule) => rule.declarations)
    .filter((declaration) => declaration.property.startsWith('--'))
    .map((declaration) => declaration.property));
  return [
    ...lightColourTokens.filter((tokenName) => !darkOverrides.has(tokenName)).map((tokenName) => `${tokenName} has no dark value`),
    ...[...darkOverrides].filter((tokenName) => !lightColourTokens.includes(tokenName)).map((tokenName) => `${tokenName} has a dark value but no light colour`),
  ];
}

function colourValueSentencesOf(stylesheetText: string, definedTokens: ReadonlySet<string>): string[] {
  return rulesOf(stylesheetText).flatMap((rule) => rule.declarations.flatMap((declaration) => {
    const site = `${rule.selector} { ${declaration.property} }`;
    const sentences: string[] = [];
    if (holdsAColour(declaration.value)) sentences.push(`${site} holds a colour value: ${declaration.value}`);
    const wordsOutsideTokens = declaration.value.replace(/var\([^)]*\)/g, '').toLowerCase().match(/[a-z]+/g) ?? [];
    const namedColours = wordsOutsideTokens.filter((word) => NAMED_COLOURS.has(word));
    if (namedColours.length > 0) sentences.push(`${site} names a colour: ${namedColours.join(', ')}`);
    const unknownTokens = [...declaration.value.matchAll(/var\((--[\w-]+)/g)].map(([, tokenName = '']) => tokenName).filter((tokenName) => !definedTokens.has(tokenName));
    sentences.push(...unknownTokens.map((tokenName) => `${site} reads ${tokenName}, which tokens.css does not define`));
    return sentences;
  }));
}

function feedbackSentencesOf(stylesheetText: string): string[] {
  return rulesOf(stylesheetText)
    .filter((rule) => /:(?:hover|active)\b/.test(rule.selector))
    .flatMap((rule) => rule.declarations
      .filter((declaration) => !FEEDBACK_PROPERTIES.has(declaration.property))
      .map((declaration) => `${rule.selector} sets ${declaration.property}, which may size or place a box`));
}

interface ComponentSource {
  readonly path: string;
  readonly text: string;
}

interface EmittedClasses {
  readonly classNames: ReadonlySet<string>;
  /** `<path>:<line>` of each `className` whose value is not a literal the scan can read. */
  readonly unreadable: readonly string[];
}

function isShippingComponent(path: string): boolean {
  return path.endsWith('.tsx') && !path.endsWith('.spec.tsx') && !path.split('/').includes('testing');
}

function shippingComponentSources(): ComponentSource[] {
  return [...new Bun.Glob('**/*.tsx').scanSync({ cwd: PAGE_FOLDER })]
    .filter(isShippingComponent)
    .sort()
    .map((path) => ({ path, text: readFileSync(join(PAGE_FOLDER, path), 'utf8') }));
}

function literalTextsOf(expression: typescript.Expression): string[] | null {
  if (typescript.isStringLiteral(expression) || typescript.isNoSubstitutionTemplateLiteral(expression)) return [expression.text];
  if (typescript.isParenthesizedExpression(expression)) return literalTextsOf(expression.expression);
  if (typescript.isConditionalExpression(expression)) {
    const whenTrue = literalTextsOf(expression.whenTrue);
    const whenFalse = literalTextsOf(expression.whenFalse);
    return whenTrue === null || whenFalse === null ? null : [...whenTrue, ...whenFalse];
  }
  return null;
}

function emittedClassesOf(sources: readonly ComponentSource[]): EmittedClasses {
  const classNames = new Set<string>();
  const unreadable: string[] = [];
  for (const { path, text } of sources) {
    const sourceFile = typescript.createSourceFile(path, text, typescript.ScriptTarget.Latest, true, typescript.ScriptKind.TSX);
    const visit = (node: typescript.Node): void => {
      if (typescript.isJsxAttribute(node) && node.name.getText(sourceFile) === 'className') {
        const { initializer } = node;
        let texts: string[] | null = null;
        if (initializer !== undefined && typescript.isStringLiteral(initializer)) texts = [initializer.text];
        else if (initializer !== undefined && typescript.isJsxExpression(initializer) && initializer.expression !== undefined) texts = literalTextsOf(initializer.expression);
        if (texts === null) unreadable.push(`${path}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`);
        else texts.flatMap((classText) => classText.split(/\s+/)).filter((className) => className !== '').forEach((className) => classNames.add(className));
      }
      typescript.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return { classNames, unreadable };
}

function styledClassesOf(stylesheetText: string): ReadonlySet<string> {
  return new Set(rulesOf(stylesheetText).flatMap((rule) => [...rule.selector.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map(([, className = '']) => className)));
}

function classContractSentencesOf(emitted: EmittedClasses, styled: ReadonlySet<string>): string[] {
  return [
    ...emitted.unreadable.map((site) => `${site} sets a className the scan cannot read: use a literal`),
    ...[...emitted.classNames].filter((className) => !styled.has(className)).sort().map((className) => `.${className} is emitted but gaia.css does not style it`),
    ...[...styled].filter((className) => !emitted.classNames.has(className)).sort().map((className) => `.${className} is styled in gaia.css but no component emits it`),
  ];
}

const TOKENS_TEXT = readFileSync(TOKENS_PATH, 'utf8');
const STYLESHEET_TEXT = readFileSync(STYLESHEET_PATH, 'utf8');
const DEFINED_TOKENS = new Set(rulesOf(TOKENS_TEXT)
  .flatMap((rule) => rule.declarations)
  .map((declaration) => declaration.property)
  .filter((property) => property.startsWith('--')));
const SOURCES = shippingComponentSources();
const EMITTED = emittedClassesOf(SOURCES);
const STYLED = styledClassesOf(STYLESHEET_TEXT);

describe('the readers, on known and planted values', () => {
  test('white on black is 21:1, and the same colour on itself is 1:1', () => {
    const [white = Number.NaN, black = Number.NaN] = ['oklch(1 0 0)', 'oklch(0 0 0)'].map((colour) => {
      const reading = luminanceOf(colour);
      return reading.verdict === 'readable' ? reading.luminance : Number.NaN;
    });
    expect(contrastRatioOf(white, black)).toBeCloseTo(21, 2);
    expect(contrastRatioOf(black, black)).toBe(1);
  });

  test('a percentage lightness reads as its fraction, and a translucent or foreign colour is unreadable rather than guessed', () => {
    expect(luminanceOf('oklch(50% 0 0)')).toEqual(luminanceOf('oklch(0.5 0 0)'));
    expect(luminanceOf('oklch(0 0 0 / 0.45)').verdict).toBe('unreadable');
    expect(luminanceOf('#ffffff').verdict).toBe('unreadable');
  });

  test('a rule inside an at-rule is read with its at-rule, and a dark value overrides only the dark theme', () => {
    const planted = [
      ':root { --bg: oklch(1 0 0); --ink: var(--deep); --deep: oklch(0 0 0); }',
      ':root[data-theme="dark"] { --bg: oklch(0.2 0 0); }',
      '@media (x) { :root { --bg: oklch(0.5 0 0); } }',
    ].join(' ');
    const rules = rulesOf(planted);
    expect(rules.map((rule) => [rule.selector, rule.atRule])).toEqual([[':root', null], [':root[data-theme="dark"]', null], [':root', '@media (x)']]);
    expect([tokensOf(rules, 'light').get('--bg'), tokensOf(rules, 'dark').get('--bg')]).toEqual(['oklch(1 0 0)', 'oklch(0.2 0 0)']);
    expect(resolvedValueOf(tokensOf(rules, 'light'), '--ink')).toBe('oklch(0 0 0)');
  });

  test('a pair under 4.5:1, a missing token and a translucent token are each named', () => {
    const planted = ':root { --bg: oklch(1 0 0); --ink: oklch(0.8 0 0); --ink-muted: oklch(0.3 0 0 / 0.5); }';
    const sentences = contrastSentencesOf(planted);
    expect(sentences).toContain('light: --ink on --bg is 1.87:1, under 4.5:1');
    expect(sentences).toContain('light: --ink-muted on --bg cannot be read: oklch(0.3 0 0 / 0.5) is not opaque');
    expect(sentences).toContain('dark: --link on --surface cannot be read: --link is not defined');
  });

  test('a colour token missing from a theme is named', () => {
    const planted = ':root { --bg: oklch(1 0 0); --sp-1: 4px; --line: oklch(0.9 0 0); } :root[data-theme="dark"] { --bg: oklch(0.2 0 0); --glow: oklch(0.5 0 0); }';
    expect(themeGapSentencesOf(planted)).toEqual(['--line has no dark value', '--glow has a dark value but no light colour']);
  });

  test('a colour function, a hex value, a named colour and an unknown token are each named, and currentColor is not a colour', () => {
    const planted = [
      '.a { color: oklch(0.5 0 0); } .b { background: #fff; } .c { border: 1px solid red; }',
      '.d { color: var(--nowhere); } .e { stroke: currentColor; fill: var(--ink); }',
    ].join(' ');
    expect(colourValueSentencesOf(planted, new Set(['--ink']))).toEqual([
      '.a { color } holds a colour value: oklch(0.5 0 0)',
      '.b { background } holds a colour value: #fff',
      '.c { border } names a colour: red',
      '.d { color } reads --nowhere, which tokens.css does not define',
    ]);
  });

  test('a hover or press rule that sizes or places a box is named, and one that changes only colours is not', () => {
    const planted = [
      '.a:hover { background: var(--surface-2); color: var(--ink); } .b:active { transform: translateY(1px); } .c:hover:not(:disabled) { padding: 0 2px; }',
      '.d:hover { border-style: solid; }',
    ].join(' ');
    expect(feedbackSentencesOf(planted)).toEqual([
      '.b:active sets transform, which may size or place a box',
      '.c:hover:not(:disabled) sets padding, which may size or place a box',
      '.d:hover sets border-style, which may size or place a box',
    ]);
  });

  test('an unstyled class, a dead rule and an unreadable className are each named', () => {
    const planted = (text: string): EmittedClasses => emittedClassesOf([{ path: 'shell/Planted.tsx', text }]);
    expect(classContractSentencesOf(planted('export const view = <p className="gaia-planted gaia-kept" />;'), new Set(['gaia-kept', 'gaia-dead']))).toEqual([
      '.gaia-planted is emitted but gaia.css does not style it',
      '.gaia-dead is styled in gaia.css but no component emits it',
    ]);
    expect(planted('export const view = (name: string) => <p className={name} />;').unreadable).toEqual(['shell/Planted.tsx:1']);
    expect([...planted('export const view = (on: boolean) => <p className={on ? \'gaia-on\' : `gaia-off`} />;').classNames]).toEqual(['gaia-on', 'gaia-off']);
  });
});

describe('the scan itself', () => {
  test('it reads the shipping components and both stylesheets, and finds a floor of each', () => {
    expect(SOURCES.map(({ path }) => path)).toContain('design-system/Button.tsx');
    expect(SOURCES.some(({ path }) => path.endsWith('.spec.tsx') || path.startsWith('testing/'))).toBe(false);
    expect(EMITTED.classNames.size).toBeGreaterThanOrEqual(SMALLEST_CLASS_COUNT);
    expect(STYLED.size).toBeGreaterThanOrEqual(SMALLEST_CLASS_COUNT);
    expect(DEFINED_TOKENS.has('--bg')).toBe(true);
  });
});

describe('tokens.css', () => {
  test('every text pair of COMPONENT_LIBRARY section 4 holds 4.5:1 in the light and the dark theme', () => {
    expect(contrastSentencesOf(TOKENS_TEXT)).toEqual([]);
  });

  test('every colour token has a light value and a dark value', () => {
    expect(themeGapSentencesOf(TOKENS_TEXT)).toEqual([]);
  });
});

describe('gaia.css', () => {
  test('it holds no colour value and reads only tokens that tokens.css defines', () => {
    expect(colourValueSentencesOf(STYLESHEET_TEXT, DEFINED_TOKENS)).toEqual([]);
  });

  test('no hover or press rule changes a size or a place', () => {
    expect(feedbackSentencesOf(STYLESHEET_TEXT)).toEqual([]);
  });

  test('every class a shipping component emits is styled, and every styled class is emitted', () => {
    expect(classContractSentencesOf(EMITTED, STYLED)).toEqual([]);
  });
});
