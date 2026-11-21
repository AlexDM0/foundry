/**
 * Gaia's style contract, read from the stylesheets and the components themselves. What matters: every text pair of COMPONENT_LIBRARY
 * section 4, in the design-system package's token names, holds 4.5:1 in both themes as a WCAG 2 text pair, a translucent token composited
 * over the ground beneath it first, and the primary button's orange is the one exception, held at 3:1 (PLAN V9); every colour token of
 * Gaia's own `tokens.css` has a light and a dark value, and every token of it is read somewhere; `gaia.css` holds no colour value and
 * reads only tokens that the package's or Gaia's `tokens.css` defines; a hover or press rule changes no size or place; every class a
 * shipping component emits is styled, and every styled class emitted; and one rule hides a label read only by a screen reader. Motion, in
 * `gaia.css` and the splash's own style: every transition and animation times itself with a package motion token and eases with
 * `--ease-out`, animates no size or place, and starts from no size or place; an animation is a live signal that runs only once motion is
 * ready and stops under reduced motion, never an entry fade, which is a `@starting-style` transition; Gaia defines no keyframe and names
 * only the package's; and every motion token Gaia reads is zeroed by the package before motion is ready and under reduced motion, or is an
 * exception only a gated animation reads. The board's views under `page/board/` are styled apart, by the stylesheets `BOARD_STYLESHEETS`
 * lists under `page/styles/board/`, and held by the Bridge's own guards (`page/testing/BoardStyleGuards.ts`): no hover or press that
 * moves, a winning reduced-motion rule for each animation outside the no-preference query, a dark value for each literal colour token but
 * one the same in both themes, set once; beside them classes emitted and styled both ways, balanced braces, only defined tokens and no
 * colour value, the board's text pairs at 4.5:1, no `gaia-` board class and no `board-` Gaia class, and every keyframe named `board-` and
 * kept in a board stylesheet. Each guard is first proved on a planted case, in memory.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join }                         from 'node:path';

import { describe, expect, test } from 'bun:test';
import typescript                 from 'typescript';

import {
  isAnimatedOutsideTheMotionQueries,
  movementSentencesOf,
  sameInBothThemesSentencesOf,
  stylesheetRulesOf,
  themedColourTokensOf,
  themeSentencesOf,
  tokenBlocksOf,
  unstoppedAnimationSentencesOf,
  unusedAllowanceSentencesOf,
  unusedGuaranteeSentencesOf,
  type AllowedMovement,
  type StylesheetRule
} from './testing/BoardStyleGuards.ts';

const PAGE_FOLDER = import.meta.dir;
const BOARD_FOLDER_NAME = 'board';
const TOKENS_PATH = join(PAGE_FOLDER, 'styles', 'tokens.css');
const STYLESHEET_PATH = join(PAGE_FOLDER, 'styles', 'gaia.css');
const SPLASH_PATH = join(PAGE_FOLDER, '..', 'resources', 'page', 'loading.html');
const SMALLEST_TEXT_CONTRAST_RATIO = 4.5;
const SMALLEST_PRIMARY_BUTTON_CONTRAST_RATIO = 3;
const SMALLEST_CLASS_COUNT = 20;

/** A text token on its ground; a translucent ground lies over the next one down, and the last is opaque. */
interface TextPair {
  readonly text:          string;
  readonly grounds:       readonly string[];
  readonly smallestRatio: number;
}

function textPair(text: string, ...grounds: string[]): TextPair {
  return { text, grounds, smallestRatio: SMALLEST_TEXT_CONTRAST_RATIO };
}

/**
 * COMPONENT_LIBRARY section 4 in the package's names: `--bg` for its ground, `--lane-bg` for its lane, `--ink-muted` for its ink 72%,
 * `--ink-4` for its ink 68%, `--link` and `--link-tint` for its orange text and tint, the info and success badges for its teal and pass
 * pairs, `--err-*` for its fail pairs. The last text pair is the primary button `gaia.css` still draws itself, ground text on ink.
 */
const TEXT_PAIRS: readonly TextPair[] = [
  ...['--ink', '--ink-muted', '--ink-4'].flatMap((text) => [
    textPair(text, '--bg'),
    textPair(text, '--surface'),
    textPair(text, '--lane-bg'),
    textPair(text, '--wash', '--surface'),
    textPair(text, '--wash', '--bg'),
  ]),
  textPair('--link', '--bg'),
  textPair('--link', '--surface'),
  textPair('--link', '--lane-bg'),
  textPair('--link', '--wash', '--surface'),
  textPair('--link', '--link-tint'),
  textPair('--ink', '--link-tint'),
  textPair('--ink-muted', '--link-tint'),
  textPair('--badge-info-ink', '--badge-info-tint'),
  textPair('--badge-info-ink', '--surface'),
  textPair('--badge-success-ink', '--badge-success-tint'),
  textPair('--badge-success-ink', '--surface'),
  textPair('--err-ink', '--err-tint', '--surface'),
  textPair('--err-ink', '--err-tint', '--bg'),
  textPair('--err-ink', '--surface'),
  textPair('--err-ink', '--bg'),
  textPair('--primary-disabled-ink', '--primary-disabled-fill', '--surface'),
  textPair('--bg', '--ink'),
  { text: '--accent-ink-on', grounds: ['--button'], smallestRatio: SMALLEST_PRIMARY_BUTTON_CONTRAST_RATIO },
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

/** Properties a transition, a starting style or a keyframe may animate: none of them sizes or places a box. */
const MOTION_PROPERTIES = new Set([
  'color',
  'background-color',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'box-shadow',
  'opacity',
  'filter',
  'text-decoration-color',
]);

const EASE_TOKEN = 'var(--ease-out)';
const READY_GATE = ':root[data-motion="ready"]';
const MOTION_GATE_SELECTOR = ':root:not([data-motion="ready"])';
const REDUCED_MOTION_PATTERN = /prefers-reduced-motion:\s*reduce/;
const RAW_TIME_PATTERN = /^-?[\d.]+m?s$/;
const RAW_EASE_PATTERN = /^(?:ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|steps\(.*\)|cubic-bezier\(.*\)|linear\(.*\))$/;
const ANIMATION_KEYWORDS = new Set(['infinite', 'both', 'forwards', 'backwards', 'normal', 'reverse', 'alternate', 'alternate-reverse', 'running', 'paused']);

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

/** A colour as sRGB channels from 0 to 1, gamma-encoded as a browser composites them, with its alpha. */
interface Colour {
  readonly red:   number;
  readonly green: number;
  readonly blue:  number;
  readonly alpha: number;
}

type ColourReading = { readonly verdict: 'readable'; readonly colour: Colour } | { readonly verdict: 'unreadable'; readonly reason: string };

type LuminanceReading = { readonly verdict: 'readable'; readonly luminance: number } | { readonly verdict: 'unreadable'; readonly reason: string };

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

function alphaOf(text: string | undefined): number {
  if (text === undefined) return 1;
  return text.endsWith('%') ? Number.parseFloat(text) / 100 : Number.parseFloat(text);
}

function oklchComponentOf(text: string): number {
  return text.endsWith('%') ? Number.parseFloat(text) / 100 : Number.parseFloat(text);
}

function clippedChannel(channel: number): number {
  return Math.min(1, Math.max(0, channel));
}

function encodedChannelOf(linearChannel: number): number {
  return linearChannel <= 0.0031308 ? 12.92 * linearChannel : 1.055 * linearChannel ** (1 / 2.4) - 0.055;
}

function linearChannelOf(encodedChannel: number): number {
  return encodedChannel <= 0.04045 ? encodedChannel / 12.92 : ((encodedChannel + 0.055) / 1.055) ** 2.4;
}

/** An `oklch()` colour through linear sRGB, clipped to the gamut. */
function oklchColourOf(match: RegExpExecArray): Colour {
  const [, lightnessText = '', chromaText = '', hueText = '', alphaText] = match;
  const lightness = oklchComponentOf(lightnessText);
  const chroma = Number.parseFloat(chromaText);
  const hueRadians = (Number.parseFloat(hueText) * Math.PI) / 180;
  const greenRedAxis = chroma * Math.cos(hueRadians);
  const blueYellowAxis = chroma * Math.sin(hueRadians);
  const longCone = (lightness + 0.3963377774 * greenRedAxis + 0.2158037573 * blueYellowAxis) ** 3;
  const mediumCone = (lightness - 0.1055613458 * greenRedAxis - 0.0638541728 * blueYellowAxis) ** 3;
  const shortCone = (lightness - 0.0894841775 * greenRedAxis - 1.291485548 * blueYellowAxis) ** 3;
  const encoded = (linearChannel: number) => encodedChannelOf(clippedChannel(linearChannel));
  return {
    red:   encoded(4.0767416621 * longCone - 3.3077115913 * mediumCone + 0.2309699292 * shortCone),
    green: encoded(-1.2684380046 * longCone + 2.6097574011 * mediumCone - 0.3413193965 * shortCone),
    blue:  encoded(-0.0041960863 * longCone - 0.7034186147 * mediumCone + 1.707614701 * shortCone),
    alpha: alphaOf(alphaText),
  };
}

/** A hex, `rgb()`, `rgba()` or `oklch()` colour; any other form is unreadable rather than guessed. */
function colourOf(colourText: string): ColourReading {
  const hexadecimalMatch = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(colourText);
  if (hexadecimalMatch?.[1] !== undefined) {
    const digits = hexadecimalMatch[1].length <= 4 ? [...hexadecimalMatch[1]].map((digit) => digit + digit).join('') : hexadecimalMatch[1];
    const [red = 0, green = 0, blue = 0, alpha = 255] = (digits.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16));
    return {
      verdict: 'readable',
      colour:  {
        red: red / 255, green: green / 255, blue: blue / 255, alpha: alpha / 255
      }
    };
  }
  const redGreenBlueMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/.exec(colourText);
  if (redGreenBlueMatch !== null) {
    const [, redText = '', greenText = '', blueText = '', alphaText] = redGreenBlueMatch;
    const channel = (text: string) => Number.parseFloat(text) / 255;
    return {
      verdict: 'readable',
      colour:  {
        red: channel(redText), green: channel(greenText), blue: channel(blueText), alpha: alphaOf(alphaText)
      }
    };
  }
  const lightnessChromaHueMatch = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?))?\s*\)$/.exec(colourText);
  if (lightnessChromaHueMatch !== null) return { verdict: 'readable', colour: oklchColourOf(lightnessChromaHueMatch) };
  return { verdict: 'unreadable', reason: `${colourText} is not a hex, rgb() or oklch() colour` };
}

/** A colour laid over an opaque one, as the browser composites them, in the encoded channels. */
function compositedOver(top: Colour, beneath: Colour): Colour {
  const mixed = (topChannel: number, beneathChannel: number) => top.alpha * topChannel + (1 - top.alpha) * beneathChannel;
  return {
    red: mixed(top.red, beneath.red), green: mixed(top.green, beneath.green), blue: mixed(top.blue, beneath.blue), alpha: 1
  };
}

function luminanceOfOpaque(colour: Colour): number {
  return 0.2126 * linearChannelOf(colour.red) + 0.7152 * linearChannelOf(colour.green) + 0.0722 * linearChannelOf(colour.blue);
}

/** WCAG 2's relative luminance of one colour, which must be opaque. */
function luminanceOf(colourText: string): LuminanceReading {
  const reading = colourOf(colourText);
  if (reading.verdict === 'unreadable') return reading;
  if (reading.colour.alpha < 1) return { verdict: 'unreadable', reason: `${colourText} is not opaque` };
  return { verdict: 'readable', luminance: luminanceOfOpaque(reading.colour) };
}

function contrastRatioOf(firstLuminance: number, secondLuminance: number): number {
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

/** The text over its grounds, each laid over the one beneath it from the opaque bottom up, or the reason they cannot be read. */
function textAndGroundOf(tokens: ReadonlyMap<string, string>, pair: TextPair): { readonly text: Colour; readonly ground: Colour } | { readonly reason: string } {
  const readings = [pair.text, ...pair.grounds].map((tokenName) => {
    const value = resolvedValueOf(tokens, tokenName);
    return value === null ? { verdict: 'unreadable', reason: `${tokenName} is not defined` } as const : colourOf(value);
  });
  const unreadable = readings.find((reading) => reading.verdict === 'unreadable');
  if (unreadable !== undefined) return { reason: unreadable.reason };
  const [text, ...grounds] = readings.flatMap((reading) => (reading.verdict === 'readable' ? [reading.colour] : []));
  const bottom = grounds.at(-1);
  if (text === undefined || bottom === undefined || bottom.alpha < 1) return { reason: `${pair.grounds.at(-1) ?? 'its ground'} is not opaque, and nothing lies beneath it` };
  const ground = grounds.slice(0, -1).reduceRight((beneath, layer) => compositedOver(layer, beneath), bottom);
  return { text: compositedOver(text, ground), ground };
}

function contrastSentencesOf(tokensText: string, pairs: readonly TextPair[]): string[] {
  const rules = rulesOf(tokensText);
  return (['light', 'dark'] as const).flatMap((theme) => {
    const tokens = tokensOf(rules, theme);
    return pairs.flatMap((pair) => {
      const site = `${theme}: ${pair.text} on ${pair.grounds.join(' over ')}`;
      const reading = textAndGroundOf(tokens, pair);
      if ('reason' in reading) return [`${site} cannot be read: ${reading.reason}`];
      const ratio = contrastRatioOf(luminanceOfOpaque(reading.text), luminanceOfOpaque(reading.ground));
      return ratio >= pair.smallestRatio ? [] : [`${site} is ${ratio.toFixed(2)}:1, under ${pair.smallestRatio}:1`];
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

function tokenNamesOf(tokensText: string): ReadonlySet<string> {
  return new Set(rulesOf(tokensText).flatMap((rule) => rule.declarations).map((declaration) => declaration.property).filter((property) => property.startsWith('--')));
}

/** The package's tokens its README leaves a host to set on the root: a press scale of 1, since a press on Gaia's page changes no size. */
const HOST_SET_PACKAGE_TOKENS: ReadonlySet<string> = new Set(['--press-scale']);

/** Gaia's tokens hold only what the package lacks: a name of the package's, redefined, would change the package's components too. */
function redefinitionSentencesOf(packageTokensText: string, gaiaTokensText: string): string[] {
  const packageTokens = tokenNamesOf(packageTokensText);
  return [...tokenNamesOf(gaiaTokensText)]
    .filter((tokenName) => packageTokens.has(tokenName) && !HOST_SET_PACKAGE_TOKENS.has(tokenName))
    .map((tokenName) => `${tokenName} is the package's token, redefined`);
}

/**
 * A token of Gaia's own that nothing reads is dead weight that drifts from the design: every one is read through `var()` somewhere, but
 * one the package reads.
 */
function unreadTokenSentencesOf(gaiaTokensText: string, readerTexts: readonly string[]): string[] {
  const readTokens = new Set(readerTexts.flatMap((text) => [...text.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, tokenName = '']) => tokenName)));
  return [...tokenNamesOf(gaiaTokensText)]
    .filter((tokenName) => !readTokens.has(tokenName) && !HOST_SET_PACKAGE_TOKENS.has(tokenName))
    .map((tokenName) => `${tokenName} is defined but nothing reads it`);
}

function colourValueSentencesOf(stylesheetText: string, definedTokens: ReadonlySet<string>): string[] {
  return rulesOf(stylesheetText).flatMap((rule) => rule.declarations.flatMap((declaration) => {
    const site = `${rule.selector} { ${declaration.property} }`;
    const sentences: string[] = [];
    if (holdsAColour(declaration.value)) sentences.push(`${site} holds a colour value: ${declaration.value}`);
    const wordsOutsideTokenNames = declaration.value.replace(/var\(\s*--[\w-]+/g, '').toLowerCase().match(/[a-z]+/g) ?? [];
    const namedColours = wordsOutsideTokenNames.filter((word) => NAMED_COLOURS.has(word));
    if (namedColours.length > 0) sentences.push(`${site} names a colour: ${namedColours.join(', ')}`);
    const unknownTokens = [...declaration.value.matchAll(/var\((--[\w-]+)/g)].map(([, tokenName = '']) => tokenName).filter((tokenName) => !definedTokens.has(tokenName));
    sentences.push(...unknownTokens.map((tokenName) => `${site} reads ${tokenName}, which no tokens.css defines`));
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

/** A value split at the separators that sit outside every parenthesis: a transition list at its commas, an item at its spaces. */
function topLevelPartsOf(value: string, separator: ',' | ' '): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of value) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    const separates = depth === 0 && (separator === ',' ? character === ',' : /\s/.test(character));
    if (separates) {
      parts.push(current.trim());
      current = '';
    } else current += character;
  }
  parts.push(current.trim());
  return parts.filter((part) => part !== '');
}

/** What the package gives motion: its time tokens, the transitions it composes of them, and what each of its keyframes animates. */
interface PackageMotion {
  readonly timeTokens:         ReadonlySet<string>;
  readonly transitionTokens:   ReadonlySet<string>;
  readonly keyframeProperties: ReadonlyMap<string, ReadonlySet<string>>;
}

function tokenReadOf(word: string): string | null {
  return /^var\((--[\w-]+)\)$/.exec(word)?.[1] ?? null;
}

function packageMotionOf(packageTokensText: string, packageKeyframesText: string): PackageMotion {
  const tokens = tokensOf(rulesOf(packageTokensText), 'light');
  const timeTokens = new Set([...tokens].filter(([, value]) => RAW_TIME_PATTERN.test(value)).map(([tokenName]) => tokenName));
  const transitionTokens = new Set([...tokens]
    .filter(([, value]) => [...value.matchAll(/var\((--[\w-]+)\)/g)].some(([, tokenName = '']) => timeTokens.has(tokenName)))
    .map(([tokenName]) => tokenName));
  const keyframeProperties = new Map<string, ReadonlySet<string>>();
  for (const [, name = '', body = ''] of withoutComments(packageKeyframesText).matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g)) {
    keyframeProperties.set(name, new Set(rulesOf(body).flatMap((rule) => rule.declarations.map((declaration) => declaration.property))));
  }
  return { timeTokens, transitionTokens, keyframeProperties };
}

function keyframeNamesOf(stylesheetText: string): string[] {
  return [...withoutComments(stylesheetText).matchAll(/@keyframes\s+([\w-]+)/g)].map(([, name = '']) => name);
}

type MotionKind = 'transition' | 'animation';

/** The part of a transition or an animation a declaration sets: the whole shorthand, or one longhand's part of it. */
type MotionPart = 'whole' | 'property' | 'name' | 'time' | 'ease' | 'other';

function motionPartOf(longhandSuffix: string): MotionPart {
  switch (longhandSuffix) {
    case '':
      return 'whole';
    case '-property':
      return 'property';
    case '-name':
      return 'name';
    case '-duration':
    case '-delay':
      return 'time';
    case '-timing-function':
      return 'ease';
    default:
      return 'other';
  }
}

/** One item of a transition or an animation, sorted into what it animates, the tokens that time it, and what it may not hold. */
function motionItemSentencesOf(site: string, item: string, kind: MotionKind, part: MotionPart, packageMotion: PackageMotion): string[] {
  const words = topLevelPartsOf(item, ' ');
  if (kind === 'transition' && part === 'whole' && words.length === 1 && packageMotion.transitionTokens.has(tokenReadOf(words[0] ?? '') ?? '')) return [];
  const namesAKeyframe = kind === 'animation' && (part === 'whole' || part === 'name');
  const keyframeName = namesAKeyframe ? words.find((word) => /^[a-z][\w-]*$/i.test(word) && !ANIMATION_KEYWORDS.has(word) && !RAW_EASE_PATTERN.test(word)) : undefined;
  const sentences: string[] = [];
  let timed = false;
  for (const word of words) {
    const tokenName = tokenReadOf(word);
    if (tokenName !== null && packageMotion.timeTokens.has(tokenName)) timed = true;
    else if (word === EASE_TOKEN) continue;
    else if (RAW_TIME_PATTERN.test(word)) sentences.push(`${site} names a raw time: ${word}`);
    else if (RAW_EASE_PATTERN.test(word)) sentences.push(`${site} eases by ${word}, not ${EASE_TOKEN}`);
    else if (tokenName !== null) sentences.push(`${site} reads ${tokenName}, which is no motion token of the package`);
    else if (kind === 'transition' && (part === 'whole' || part === 'property') && !MOTION_PROPERTIES.has(word)) {
      sentences.push(`${site} animates ${word}, which may size or place a box`);
    }
  }
  if (!timed && (part === 'whole' || part === 'time')) sentences.push(`${site} is timed by no motion token`);
  if (keyframeName !== undefined) {
    const animated = packageMotion.keyframeProperties.get(keyframeName);
    if (animated === undefined) sentences.push(`${site} runs ${keyframeName}, which the package's keyframes.css does not define`);
    else sentences.push(...[...animated].filter((property) => !MOTION_PROPERTIES.has(property)).map((property) => `${site} runs ${keyframeName}, which animates ${property}`));
  }
  return sentences;
}

function selectorsOf(selectorList: string): string[] {
  return topLevelPartsOf(selectorList, ',');
}

function reducedMotionAtRule(atRule: string | null): boolean {
  return atRule !== null && REDUCED_MOTION_PATTERN.test(atRule);
}

/**
 * Every transition, animation and starting style of a stylesheet: timed and eased by the package's tokens, animating no size or place; an
 * animation, a live signal only, runs once motion is ready and stops under reduced motion.
 */
function motionSentencesOf(stylesheetText: string, packageMotion: PackageMotion): string[] {
  const rules = rulesOf(stylesheetText);
  const reducedMotionStops = new Set(rules
    .filter((rule) => reducedMotionAtRule(rule.atRule))
    .filter((rule) => rule.declarations.some((declaration) => /^animation(?:-name)?$/.test(declaration.property) && declaration.value === 'none'))
    .flatMap((rule) => selectorsOf(rule.selector)));
  return rules.flatMap((rule) => {
    if (rule.atRule === '@starting-style') {
      return rule.declarations
        .filter((declaration) => !MOTION_PROPERTIES.has(declaration.property))
        .map((declaration) => `${rule.selector} starts from ${declaration.property}, which may size or place a box`);
    }
    return rule.declarations.flatMap((declaration) => {
      const match = /^(transition|animation)((?:-[\w-]+)?)$/.exec(declaration.property);
      const kind = match?.[1];
      if ((kind !== 'transition' && kind !== 'animation') || declaration.value === 'none') return [];
      const part = motionPartOf(match?.[2] ?? '');
      const site = `${rule.selector} { ${declaration.property} }`;
      const sentences = topLevelPartsOf(declaration.value, ',').flatMap((item) => motionItemSentencesOf(site, item, kind, part, packageMotion));
      if (kind === 'animation' && !reducedMotionAtRule(rule.atRule)) {
        for (const selector of selectorsOf(rule.selector)) {
          if (!selector.startsWith(`${READY_GATE} `)) sentences.push(`${selector} runs an animation before motion is ready`);
          if (!reducedMotionStops.has(selector)) sentences.push(`${selector} runs an animation that reduced motion does not stop`);
        }
        if (part === 'whole' && !declaration.value.split(/\s+/).includes('infinite')) {
          sentences.push(`${site} runs once: a part that appears fades in by a @starting-style transition, never a keyframe`);
        }
      }
      return sentences;
    });
  });
}

/** The package motion tokens a transition or an animation reads. */
function motionTokenReadsOf(stylesheetTexts: readonly string[], packageMotion: PackageMotion): ReadonlySet<string> {
  const reads = new Set<string>();
  for (const declaration of stylesheetTexts.flatMap((stylesheetText) => rulesOf(stylesheetText)).flatMap((rule) => rule.declarations)) {
    if (!/^(?:transition|animation)/.test(declaration.property)) continue;
    for (const [, tokenName = ''] of declaration.value.matchAll(/var\((--[\w-]+)\)/g)) {
      if (packageMotion.timeTokens.has(tokenName) || packageMotion.transitionTokens.has(tokenName)) reads.add(tokenName);
    }
  }
  return reads;
}

/** A time token is gated when the package zeroes it before motion is ready and under reduced motion; a composed token, when its times are. */
function motionGateSentencesOf(packageTokensText: string, packageMotion: PackageMotion, reads: ReadonlySet<string>): string[] {
  const rules = rulesOf(packageTokensText);
  const zeroedIn = (selected: readonly StyleRule[]) => new Set(selected
    .flatMap((rule) => rule.declarations)
    .filter((declaration) => RAW_TIME_PATTERN.test(declaration.value) && Number.parseFloat(declaration.value) === 0)
    .map((declaration) => declaration.property));
  const zeroedBeforeReady = zeroedIn(rules.filter((rule) => rule.atRule === null && rule.selector === MOTION_GATE_SELECTOR));
  const zeroedUnderReducedMotion = zeroedIn(rules.filter((rule) => reducedMotionAtRule(rule.atRule) && rule.selector === ':root'));
  const tokens = tokensOf(rules, 'light');
  const timesOf = (tokenName: string): string[] => (packageMotion.timeTokens.has(tokenName)
    ? [tokenName]
    : [...(tokens.get(tokenName) ?? '').matchAll(/var\((--[\w-]+)\)/g)].map(([, reference = '']) => reference).filter((reference) => packageMotion.timeTokens.has(reference)));
  return [...reads].flatMap((tokenName) => [...new Set(timesOf(tokenName))].flatMap((time) => [
    ...(zeroedBeforeReady.has(time) ? [] : [`${tokenName} reads ${time}, which the package does not zero before motion is ready`]),
    ...(zeroedUnderReducedMotion.has(time) ? [] : [`${tokenName} reads ${time}, which the package does not zero under reduced motion`]),
  ]));
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
  return path.endsWith('.tsx') && !path.endsWith('.spec.tsx') && !path.endsWith('.dom.tsx') && !path.split('/').includes('testing');
}

function isBoardComponent(path: string): boolean {
  return path.startsWith(`${BOARD_FOLDER_NAME}/`);
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

function classContractSentencesOf(emitted: EmittedClasses, styled: ReadonlySet<string>, stylesheetName = 'gaia.css'): string[] {
  return [
    ...emitted.unreadable.map((site) => `${site} sets a className the scan cannot read: use a literal`),
    ...[...emitted.classNames].filter((className) => !styled.has(className)).sort().map((className) => `.${className} is emitted but ${stylesheetName} does not style it`),
    ...[...styled].filter((className) => !emitted.classNames.has(className)).sort().map((className) => `.${className} is styled in ${stylesheetName} but no component emits it`),
  ];
}

/** The board's stylesheets as listed and as found in their folder must be the same, so no stylesheet escapes the board's guards. */
function boardStylesheetListSentencesOf(listed: readonly string[], present: readonly string[]): string[] {
  return [
    ...present.filter((name) => !listed.includes(name)).map((name) => `styles/board/${name} is not in BOARD_STYLESHEETS`),
    ...listed.filter((name) => !present.includes(name)).map((name) => `${name} is in BOARD_STYLESHEETS but not in styles/board/`),
  ];
}

/** Braces outside comments and strings: none closes before it opens, and none is left open. */
function braceBalanceSentencesOf(stylesheetName: string, stylesheetText: string): string[] {
  const text = withoutComments(stylesheetText).replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  let depth = 0;
  for (const character of text) {
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth < 0) return [`${stylesheetName} closes a brace it never opened`];
  }
  return depth === 0 ? [] : [`${stylesheetName} leaves ${depth} brace${depth === 1 ? '' : 's'} open`];
}

/** The board's classes and Gaia's never share a prefix: a board class is no `gaia-`, a Gaia class no `board-`. */
function classPrefixSentencesOf(boardClasses: ReadonlySet<string>, gaiaClasses: ReadonlySet<string>): string[] {
  return [
    ...[...boardClasses].filter((className) => className.startsWith('gaia-')).sort().map((className) => `.${className} is a board class named gaia-`),
    ...[...gaiaClasses].filter((className) => className.startsWith('board-')).sort().map((className) => `.${className} is a Gaia class named board-`),
  ];
}

/** A keyframe of the board's is named `board-` and defined only in a board stylesheet. */
function boardKeyframeSentencesOf(boardStylesheetTexts: readonly string[], gaiaStylesheetTexts: readonly string[]): string[] {
  return [
    ...boardStylesheetTexts.flatMap(keyframeNamesOf).filter((name) => !name.startsWith('board-')).map((name) => `@keyframes ${name} is a board keyframe not named board-`),
    ...gaiaStylesheetTexts.flatMap(keyframeNamesOf).filter((name) => name.startsWith('board-')).map((name) => `@keyframes ${name} is defined outside the board stylesheets`),
  ];
}

/** The package's tokens sit beside its entry stylesheet, which exports no path to them of its own. */
const PACKAGE_TOKENS_PATH = join(dirname(Bun.resolveSync('design-system/design-system.css', PAGE_FOLDER)), 'tokens.css');
const PACKAGE_TOKENS_TEXT = readFileSync(PACKAGE_TOKENS_PATH, 'utf8');
const TOKENS_TEXT = readFileSync(TOKENS_PATH, 'utf8');
/** Both token files as the page links them: the package's first, so a token of Gaia's own wins. */
const LINKED_TOKENS_TEXT = `${PACKAGE_TOKENS_TEXT}\n${TOKENS_TEXT}`;
const STYLESHEET_TEXT = readFileSync(STYLESHEET_PATH, 'utf8');
const DEFINED_TOKENS = tokenNamesOf(LINKED_TOKENS_TEXT);
const SHIPPING_SOURCES = shippingComponentSources();
const SOURCES = SHIPPING_SOURCES.filter(({ path }) => !isBoardComponent(path));
const EMITTED = emittedClassesOf(SOURCES);
const STYLED = styledClassesOf(STYLESHEET_TEXT);
const PACKAGE_KEYFRAMES_TEXT = readFileSync(join(dirname(PACKAGE_TOKENS_PATH), 'keyframes.css'), 'utf8');
const PACKAGE_MOTION = packageMotionOf(PACKAGE_TOKENS_TEXT, PACKAGE_KEYFRAMES_TEXT);
const SPLASH_STYLE_TEXT = /<style>([\s\S]*?)<\/style>/.exec(readFileSync(SPLASH_PATH, 'utf8'))?.[1] ?? '';
/** Gaia's stylesheets as motion reads them: the page's and the splash's own style. */
const MOTION_STYLESHEETS = [STYLESHEET_TEXT, SPLASH_STYLE_TEXT] as const;

const BOARD_STYLES_FOLDER = join(PAGE_FOLDER, 'styles', BOARD_FOLDER_NAME);
const BOARD_TOKENS_FILE_NAME = 'tokens.css';
/** Every stylesheet of the board, by its name under `page/styles/board/`; the package that moves one in names it here. */
const BOARD_STYLESHEETS: readonly string[] = [
  'agents.css',
  'assistant.css',
  'chips.css',
  'controls.css',
  'conversation.css',
  'detail-panel.css',
  'flint.css',
  'intake.css',
  'kanban.css',
  'merge-queue.css',
  'pipeline.css',
  'progress.css',
  'questions.css',
  'sandboxed-html.css',
  'shell.css',
  'tickets.css',
  'tokens.css',
];
const BOARD_STYLESHEETS_PRESENT = existsSync(BOARD_STYLES_FOLDER) ? readdirSync(BOARD_STYLES_FOLDER).filter((name) => name.endsWith('.css')).sort() : [];
const BOARD_STYLESHEET_TEXTS: ReadonlyMap<string, string> = new Map(BOARD_STYLESHEETS
  .filter((name) => BOARD_STYLESHEETS_PRESENT.includes(name))
  .map((name) => [name, readFileSync(join(BOARD_STYLES_FOLDER, name), 'utf8')]));
const BOARD_TOKENS_TEXT = BOARD_STYLESHEET_TEXTS.get(BOARD_TOKENS_FILE_NAME) ?? '';
const BOARD_RULE_STYLESHEET_TEXTS = [...BOARD_STYLESHEET_TEXTS].filter(([name]) => name !== BOARD_TOKENS_FILE_NAME).map(([, text]) => text);
const BOARD_DEFINED_TOKENS = tokenNamesOf(`${LINKED_TOKENS_TEXT}\n${BOARD_TOKENS_TEXT}`);
const BOARD_SOURCES = SHIPPING_SOURCES.filter(({ path }) => isBoardComponent(path));
const BOARD_EMITTED = emittedClassesOf(BOARD_SOURCES);
const BOARD_STYLED: ReadonlySet<string> = new Set(BOARD_RULE_STYLESHEET_TEXTS.flatMap((text) => [...styledClassesOf(text)]));
const BOARD_STYLESHEET_NAME = 'a board stylesheet';
const BOARD_STYLESHEET_FOLDER_PATH = 'page/styles/board';
/** The board's rules as the Bridge's guards read them, each named by its path under `apps/gaia/`. */
const BOARD_RULES: readonly StylesheetRule[] = [...BOARD_STYLESHEET_TEXTS].flatMap(([name, text]) => stylesheetRulesOf(`${BOARD_STYLESHEET_FOLDER_PATH}/${name}`, text));
/** The package's rules, read beside the board's so a reduce rule of the package's may stop a board animation, as it may the Bridge's. */
const PACKAGE_FOLDER = dirname(Bun.resolveSync('design-system/package.json', PAGE_FOLDER));
const PACKAGE_RULES: readonly StylesheetRule[] = [...new Bun.Glob('**/*.css').scanSync({ cwd: PACKAGE_FOLDER })]
  .filter((path) => !path.split('/').includes('node_modules'))
  .sort()
  .flatMap((path) => stylesheetRulesOf(`design-system/${path}`, readFileSync(join(PACKAGE_FOLDER, path), 'utf8')));
const BOARD_TOKEN_BLOCKS = tokenBlocksOf(BOARD_TOKENS_TEXT);
/** A hover or press movement of the board's that moves nothing else, with its reason; exact both ways, as the Bridge's `MOVEMENTS_ALLOWED`. */
const BOARD_MOVEMENTS_ALLOWED: readonly AllowedMovement[] = [];
/** An ancestor a board reduce selector may name though the animated one does not, as the Bridge's `ANCESTORS_THE_MARKUP_GUARANTEES`. */
const BOARD_ANCESTORS_THE_MARKUP_GUARANTEES: readonly string[] = [];
/** The board's colours the same in both themes, set once in the light block, as the Bridge's `SAME_IN_BOTH_THEMES_TOKENS`. */
const BOARD_SAME_IN_BOTH_THEMES_TOKENS: readonly string[] = [
  // Flint's colours, its own in both themes (`packages/flint/constants/Palette.ts`).
  '--flint-body',
  '--flint-eye',
  '--flint-hand',
  '--flint-glow',
  '--flint-ember-light',
  '--flint-ember-dark',
  '--flint-alarm',
  '--flint-water',
  '--flint-water-light',
  '--flint-done',
  '--flint-paper',
  '--flint-paper-edge',
  '--flint-paper-text',
  '--flint-graphite',
  '--flint-paper-stacked',
  '--flint-paper-fold',
  '--flint-lens',
  '--flint-keyboard',
  '--flint-hardware',
  '--flint-bolt',
  '--flint-thinking',
  '--flint-bulb-glass-light',
  '--flint-bulb-glass-middle',
  '--flint-bulb-glass-deep',
  '--flint-bulb-outline',
  '--flint-bulb-rays',
  '--flint-bulb-fitting-dark',
  '--flint-bulb-fitting-shine',
  '--flint-bulb-fitting-middle',
  '--flint-bulb-fitting-shadow',
  '--flint-bulb-contact',
  '--flint-husk',
  '--flint-ribbon',
  // What lets the surface under it show, as the Bridge's styles wrote it.
  '--see-through',
];
/** The board's text pairs, each at 4.5:1 in both themes; the package that moves a board view in names its pairs here. */
const BOARD_TEXT_PAIRS: readonly TextPair[] = [
  // The refusal beside a command button, on the page and on a card.
  textPair('--err-ink', '--bg'),
  textPair('--err-ink', '--surface'),
  // A chip, an epic chip, a chat bubble and a card's text, its meta and its stamps, on a card, a wash and a link tint.
  textPair('--ink', '--surface'),
  textPair('--ink', '--wash', '--surface'),
  textPair('--ink-muted', '--surface'),
  textPair('--ink-muted', '--wash', '--surface'),
  textPair('--ink-4', '--surface'),
  textPair('--ink-4', '--wash', '--surface'),
  textPair('--link', '--surface'),
  textPair('--link', '--link-tint', '--surface'),
  textPair('--ink', '--link-tint', '--surface'),
  // A chip of an epic, its slot's ink on its slot's tint.
  ...[1, 2, 3, 4, 5, 6].map((slot) => textPair(`--epic-${slot}-ink`, `--epic-${slot}-tint`, '--surface')),
  // A warning card, and a failed tool call's result.
  textPair('--warn-ink', '--warn-tint', '--surface'),
  textPair('--err-ink', '--err-tint', '--surface'),
];

function boardThemeSentencesOf(tokenBlocks: ReturnType<typeof tokenBlocksOf>, sameInBothThemesTokens: readonly string[]): string[] {
  const themedTokens = themedColourTokensOf(tokenBlocks).filter((token) => !sameInBothThemesTokens.includes(token));
  return [...themeSentencesOf(tokenBlocks, themedTokens), ...sameInBothThemesSentencesOf(tokenBlocks, sameInBothThemesTokens)];
}

describe('the readers, on known and planted values', () => {
  test('white on black is 21:1, and the same colour on itself is 1:1', () => {
    const [white = Number.NaN, black = Number.NaN] = ['oklch(1 0 0)', '#000'].map((colour) => {
      const reading = luminanceOf(colour);
      return reading.verdict === 'readable' ? reading.luminance : Number.NaN;
    });
    expect(contrastRatioOf(white, black)).toBeCloseTo(21, 2);
    expect(contrastRatioOf(black, black)).toBe(1);
  });

  test('a hex, an rgb() and an oklch() white read alike, a percentage reads as its fraction, and a foreign or translucent colour is unreadable alone', () => {
    const whites = ['#fff', '#ffffffff', 'rgb(255, 255, 255)', 'rgba(255, 255, 255, 1)', 'oklch(1 0 0)'].map(luminanceOf);
    for (const white of whites) expect(white.verdict === 'readable' ? white.luminance : Number.NaN).toBeCloseTo(1, 4);
    expect(luminanceOf('oklch(50% 0 0)')).toEqual(luminanceOf('oklch(0.5 0 0)'));
    expect(colourOf('rgba(0, 0, 0, 50%)')).toEqual(colourOf('rgba(0, 0, 0, 0.5)'));
    expect(luminanceOf('oklch(0 0 0 / 0.45)')).toEqual({ verdict: 'unreadable', reason: 'oklch(0 0 0 / 0.45) is not opaque' });
    expect(luminanceOf('color-mix(in oklch, red, blue)').verdict).toBe('unreadable');
  });

  test('a translucent text or ground is laid over the ground beneath it before the ratio is taken', () => {
    const halfBlackOnWhite = compositedOver({
      red: 0, green: 0, blue: 0, alpha: 0.5
    }, {
      red: 1, green: 1, blue: 1, alpha: 1
    });
    expect(halfBlackOnWhite).toEqual({
      red: 0.5, green: 0.5, blue: 0.5, alpha: 1
    });
    const planted = ':root { --bg: #ffffff; --wash: rgba(0, 0, 0, 0.5); --ink: rgba(0, 0, 0, 0.5); }';
    expect(contrastSentencesOf(planted, [textPair('--ink', '--wash', '--bg')])).toEqual([
      'light: --ink on --wash over --bg is 2.62:1, under 4.5:1',
      'dark: --ink on --wash over --bg is 2.62:1, under 4.5:1',
    ]);
    expect(contrastSentencesOf(planted, [textPair('--ink', '--wash')])[0]).toBe('light: --ink on --wash cannot be read: --wash is not opaque, and nothing lies beneath it');
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

  test('a pair under its ratio, a missing token and a foreign colour are each named, and the primary button is held at 3:1 only', () => {
    const planted = ':root { --bg: oklch(1 0 0); --ink: oklch(0.8 0 0); --ink-muted: hsl(0 0% 30%); --button: #f55a00; --accent-ink-on: #ffffff; }';
    const sentences = contrastSentencesOf(planted, TEXT_PAIRS);
    expect(sentences).toContain('light: --ink on --bg is 1.87:1, under 4.5:1');
    expect(sentences).toContain('light: --ink-muted on --bg cannot be read: hsl(0 0% 30%) is not a hex, rgb() or oklch() colour');
    expect(sentences).toContain('dark: --link on --surface cannot be read: --link is not defined');
    expect(sentences.filter((sentence) => sentence.includes('--accent-ink-on'))).toEqual([]);
    expect(contrastSentencesOf(':root { --button: #ff9a5c; --accent-ink-on: #ffffff; }', TEXT_PAIRS.filter((pair) => pair.text === '--accent-ink-on'))).toEqual([
      'light: --accent-ink-on on --button is 2.09:1, under 3:1',
      'dark: --accent-ink-on on --button is 2.09:1, under 3:1',
    ]);
  });

  test('a token of Gaia\'s that the package already defines is named, but the press scale the package leaves to its host', () => {
    expect(redefinitionSentencesOf(':root { --bg: #fff; --press-scale: 0.98; }', ':root { --sp-half: 2px; --bg: #eee; --press-scale: 1; }')).toEqual([
      '--bg is the package\'s token, redefined',
    ]);
  });

  test('a colour token missing from a theme is named', () => {
    const planted = ':root { --bg: oklch(1 0 0); --sp-1: 4px; --line: oklch(0.9 0 0); } :root[data-theme="dark"] { --bg: oklch(0.2 0 0); --glow: oklch(0.5 0 0); }';
    expect(themeGapSentencesOf(planted)).toEqual(['--line has no dark value', '--glow has a dark value but no light colour']);
  });

  test('a token of Gaia\'s own that no reader reads is named, and one read in a stylesheet, a component or another token is not', () => {
    const planted = ':root { --read-in-css: 1px; --read-in-a-component: 2px; --read-by-a-token: 3px; --reads-a-token: var(--read-by-a-token); --unread: 4px; }';
    const readers = ['.a { gap: var(--read-in-css); }', '<div style={{ width: \'var(--read-in-a-component)\' }} />', '.b { gap: var(--reads-a-token); }', planted];
    expect(unreadTokenSentencesOf(planted, readers)).toEqual(['--unread is defined but nothing reads it']);
  });

  test('a colour function, a hex value, a named colour, one in a token\'s fallback and an unknown token are each named, and currentColor is not a colour', () => {
    const planted = [
      '.a { color: oklch(0.5 0 0); } .b { background: #fff; } .c { border: 1px solid red; }',
      '.d { color: var(--nowhere); } .e { stroke: currentColor; fill: var(--ink); } .f { color: var(--ink, white); }',
    ].join(' ');
    expect(colourValueSentencesOf(planted, new Set(['--ink']))).toEqual([
      '.a { color } holds a colour value: oklch(0.5 0 0)',
      '.b { background } holds a colour value: #fff',
      '.c { border } names a colour: red',
      '.d { color } reads --nowhere, which no tokens.css defines',
      '.f { color } names a colour: white',
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

  test('a transition timed by a raw time, eased by a raw curve or timed by no motion token is named, and the package\'s tokens pass', () => {
    const planted = [
      '.a { transition: var(--feedback-transition), opacity var(--motion-base) var(--ease-out); }',
      '.b { transition: opacity 140ms ease-in-out; }',
      '.c { transition: color var(--space-2) var(--ease-out); }',
      '.d { transition-duration: 2s; } .e { transition: none; }',
    ].join(' ');
    expect(motionSentencesOf(planted, PACKAGE_MOTION)).toEqual([
      '.b { transition } names a raw time: 140ms',
      '.b { transition } eases by ease-in-out, not var(--ease-out)',
      '.b { transition } is timed by no motion token',
      '.c { transition } reads --space-2, which is no motion token of the package',
      '.c { transition } is timed by no motion token',
      '.d { transition-duration } names a raw time: 2s',
      '.d { transition-duration } is timed by no motion token',
    ]);
  });

  test('a transition, a starting style or a keyframe that sizes or places a box is named, and opacity and colours are not', () => {
    const planted = [
      '.a { transition: all var(--motion-fast) var(--ease-out), transform var(--motion-fast) var(--ease-out), box-shadow var(--motion-fast) var(--ease-out); }',
      '@starting-style { .b { opacity: 0; transform: translateY(4px); } }',
      ':root[data-motion="ready"] .c { animation: design-system-pop var(--motion-pop) var(--ease-out) infinite; }',
      '@media (prefers-reduced-motion: reduce) { :root[data-motion="ready"] .c { animation: none; } }',
    ].join(' ');
    expect(motionSentencesOf(planted, PACKAGE_MOTION)).toEqual([
      '.a { transition } animates all, which may size or place a box',
      '.a { transition } animates transform, which may size or place a box',
      '.b starts from transform, which may size or place a box',
      ':root[data-motion="ready"] .c { animation } runs design-system-pop, which animates transform',
    ]);
  });

  test('an animation before motion is ready, one reduced motion does not stop, one that runs once and an unknown keyframe are each named', () => {
    const planted = [
      '.a { animation: design-system-pulse var(--pulse-status) var(--ease-out) infinite; }',
      ':root[data-motion="ready"] .b { animation: design-system-fade var(--motion-base) var(--ease-out); }',
      ':root[data-motion="ready"] .c { animation: design-system-pulse var(--pulse-status) var(--ease-out) infinite; }',
      ':root[data-motion="ready"] .d { animation: design-system-glow var(--glow-period) ease-in-out infinite; }',
      ':root[data-motion="ready"] .e { animation: design-system-fadein var(--motion-base) var(--ease-out) infinite; }',
      '@media (prefers-reduced-motion: reduce) { :root[data-motion="ready"] .b, :root[data-motion="ready"] .c, :root[data-motion="ready"] .d { animation: none; } }',
    ].join(' ');
    expect(motionSentencesOf(planted, PACKAGE_MOTION)).toEqual([
      '.a runs an animation before motion is ready',
      '.a runs an animation that reduced motion does not stop',
      ':root[data-motion="ready"] .b { animation } runs once: a part that appears fades in by a @starting-style transition, never a keyframe',
      ':root[data-motion="ready"] .d { animation } eases by ease-in-out, not var(--ease-out)',
      ':root[data-motion="ready"] .e { animation } runs design-system-fadein, which the package\'s keyframes.css does not define',
      ':root[data-motion="ready"] .e runs an animation that reduced motion does not stop',
    ]);
  });

  test('a keyframe of Gaia\'s own is named', () => {
    expect(keyframeNamesOf('/* @keyframes gaia-commented {} */ @keyframes gaia-wash { from { opacity: 0; } }')).toEqual(['gaia-wash']);
  });

  test('a motion token the package leaves running before motion is ready or under reduced motion is named', () => {
    const plantedPackage = [
      ':root { --motion-fast: 120ms; --motion-slow: 220ms; --pulse-status: 1.6s; --toast-duration: 5s; --ease-out: cubic-bezier(0.22, 1, 0.36, 1);',
      '--feedback-transition: color var(--motion-fast) var(--ease-out), border-color var(--toast-duration) var(--ease-out); }',
      ':root:not([data-motion="ready"]) { --motion-fast: 0ms; --motion-slow: 0ms; }',
      '@media (prefers-reduced-motion: reduce) { :root { --motion-fast: 0ms; } }',
    ].join(' ');
    const plantedMotion = packageMotionOf(plantedPackage, '');
    expect([[...plantedMotion.timeTokens], [...plantedMotion.transitionTokens]]).toEqual([
      ['--motion-fast', '--motion-slow', '--pulse-status', '--toast-duration'],
      ['--feedback-transition'],
    ]);
    const gaiaStylesheet = [
      '.a { transition: var(--feedback-transition); } .b { transition: opacity var(--motion-slow) var(--ease-out); }',
      '.c { animation: design-system-pulse var(--pulse-status) ease-in-out infinite; }',
    ].join(' ');
    expect(motionGateSentencesOf(plantedPackage, plantedMotion, motionTokenReadsOf([gaiaStylesheet], plantedMotion))).toEqual([
      '--feedback-transition reads --toast-duration, which the package does not zero before motion is ready',
      '--feedback-transition reads --toast-duration, which the package does not zero under reduced motion',
      '--motion-slow reads --motion-slow, which the package does not zero under reduced motion',
      '--pulse-status reads --pulse-status, which the package does not zero before motion is ready',
      '--pulse-status reads --pulse-status, which the package does not zero under reduced motion',
    ]);
  });
});

describe('the board\'s guards, on planted stylesheets and components', () => {
  test('a stylesheet in styles/board/ the list leaves out, and a listed one that is not there, are each named', () => {
    expect(boardStylesheetListSentencesOf(['kanban.css', 'waves.css'], ['kanban.css', 'tokens.css'])).toEqual([
      'styles/board/tokens.css is not in BOARD_STYLESHEETS',
      'waves.css is in BOARD_STYLESHEETS but not in styles/board/',
    ]);
  });

  test('a board class emitted but unstyled and one styled but not emitted are each named against the board stylesheets', () => {
    const emitted = emittedClassesOf([{ path: 'board/kanban/Planted.tsx', text: 'export const view = <p className="board-card board-kept" />;' }]);
    expect(classContractSentencesOf(emitted, styledClassesOf('.board-kept { gap: 0; } .board-dead { gap: 0; }'), BOARD_STYLESHEET_NAME)).toEqual([
      '.board-card is emitted but a board stylesheet does not style it',
      '.board-dead is styled in a board stylesheet but no component emits it',
    ]);
  });

  test('a board hover or press rule that moves a box is named, and one that sets a filter, an outline or visibility passes, as on the Bridge', () => {
    const plantedRules = stylesheetRulesOf('planted.css', [
      '.board-card:hover { transform: translateY(-1px); }',
      '.board-card:active { filter: brightness(0.94); color: var(--ink); }',
      '.board-link:hover { text-underline-offset: 3px; outline: 1px solid var(--line); outline-offset: 2px; visibility: visible; }',
      '.board-card:active { transform: none; }',
    ].join('\n'));
    expect(movementSentencesOf(plantedRules, [])).toEqual(['planted.css: .board-card:hover sets transform, which a :hover or :active rule may not change']);
    expect(movementSentencesOf(plantedRules, [{ selector: '.board-card:hover', property: 'transform' }])).toEqual([]);
    expect(unusedAllowanceSentencesOf(plantedRules, [{ selector: '.board-tip:hover', property: 'transform' }]))
      .toEqual(['.board-tip:hover { transform } is allowed but no rule sets it']);
  });

  test('an animation no winning reduce rule stops is named; a no-preference one, a stopped one and a presence attribute that reaches pass', () => {
    const plantedRules = stylesheetRulesOf('planted.css', [
      '.board-spin { animation-name: board-spin; }',
      '.board-row[data-status="step"] .board-row-mark { animation: board-pulse 1s infinite; }',
      '@media (prefers-reduced-motion: no-preference) { .board-dot { animation: board-pulse 1s infinite; } }',
      '.board-chat-turn[data-presence="arriving"] { animation: board-rise 1s both; }',
      '@media (prefers-reduced-motion: reduce) {',
      '  .board-row-mark { animation: none; }',
      '  .board-chat-turn[data-presence] { animation: none; }',
      '}',
    ].join('\n'));
    expect(unstoppedAnimationSentencesOf(plantedRules)).toEqual([
      'planted.css: .board-spin sets an animation that no winning prefers-reduced-motion: reduce rule stops',
      'planted.css: .board-row[data-status="step"] .board-row-mark sets an animation that no winning prefers-reduced-motion: reduce rule stops',
    ]);
    expect(plantedRules.filter(isAnimatedOutsideTheMotionQueries)).toHaveLength(3);
    expect(unusedGuaranteeSentencesOf(plantedRules, ['.board-lanes'])).toEqual(['.board-lanes is a guaranteed ancestor but no reduce rule names it']);
  });

  test('a brace closed before it opens and one left open are each named, and braces in a comment or a string are not counted', () => {
    expect(braceBalanceSentencesOf('planted.css', '.a { gap: 0; } }')).toEqual(['planted.css closes a brace it never opened']);
    expect(braceBalanceSentencesOf('planted.css', '@media (width > 1px) { .a { gap: 0; }')).toEqual(['planted.css leaves 1 brace open']);
    expect(braceBalanceSentencesOf('planted.css', '/* { */ .a::before { content: "}"; }')).toEqual([]);
  });

  test('a board token read that no tokens.css defines and a colour value are each named', () => {
    expect(colourValueSentencesOf('.board-card { color: var(--board-nowhere); background: #fff; border-color: var(--board-edge); }', new Set(['--board-edge']))).toEqual([
      '.board-card { color } reads --board-nowhere, which no tokens.css defines',
      '.board-card { background } holds a colour value: #fff',
    ]);
  });

  test('a literal board colour without a dark value is named, and one the same in both themes is set once, in the light block', () => {
    const plantedBlocks = tokenBlocksOf([
      ':root { --board-lane: oklch(0.9 0 0); --board-edge: #ddd; --board-alias: var(--ink); --board-gap: 4px; --board-eye: #fff; --board-signal: #f80; }',
      ':root[data-theme="dark"] { --board-edge: #333; --board-signal: #f80; }',
    ].join('\n'));
    expect(boardThemeSentencesOf(plantedBlocks, ['--board-eye', '--board-signal'])).toEqual([
      '--board-lane is a literal in :root and has no value in :root[data-theme="dark"]',
      '--board-signal is the same in both themes and has a value in :root[data-theme="dark"]',
    ]);
  });

  test('a board text pair under 4.5:1 is named, against the board\'s and the linked tokens', () => {
    const plantedTokens = ':root { --board-faint: #eeeeee; --board-ground: #ffffff; } :root[data-theme="dark"] { --board-faint: #eeeeee; --board-ground: #000000; }';
    expect(contrastSentencesOf(plantedTokens, [textPair('--board-faint', '--board-ground')])).toEqual(['light: --board-faint on --board-ground is 1.16:1, under 4.5:1']);
  });

  test('a board class named gaia- and a Gaia class named board- are each named', () => {
    expect(classPrefixSentencesOf(new Set(['board-card', 'gaia-card']), new Set(['gaia-rail', 'board-rail']))).toEqual([
      '.gaia-card is a board class named gaia-',
      '.board-rail is a Gaia class named board-',
    ]);
  });

  test('a board keyframe not named board- and a board- keyframe outside the board stylesheets are each named', () => {
    expect(boardKeyframeSentencesOf(['@keyframes board-pulse { to { opacity: 0; } } @keyframes pulse { to { opacity: 0; } }'], ['@keyframes board-wash { to { opacity: 0; } }']))
      .toEqual(['@keyframes pulse is a board keyframe not named board-', '@keyframes board-wash is defined outside the board stylesheets']);
  });
});

describe('the scan itself', () => {
  test('it reads the shipping components and both stylesheets, and finds a floor of each', () => {
    expect(SOURCES.map(({ path }) => path)).toContain('design-system/Refusal.tsx');
    expect(SOURCES.some(({ path }) => path.endsWith('.spec.tsx') || path.endsWith('.dom.tsx') || path.startsWith('testing/'))).toBe(false);
    expect(SOURCES.some(({ path }) => isBoardComponent(path))).toBe(false);
    expect(BOARD_SOURCES.every(({ path }) => isBoardComponent(path))).toBe(true);
    expect(EMITTED.classNames.size).toBeGreaterThanOrEqual(SMALLEST_CLASS_COUNT);
    expect(STYLED.size).toBeGreaterThanOrEqual(SMALLEST_CLASS_COUNT);
    expect(DEFINED_TOKENS.has('--bg')).toBe(true);
  });

  test('it reads the package\'s motion tokens and keyframes, and the splash\'s own style', () => {
    expect(PACKAGE_MOTION.timeTokens).toContain('--motion-base');
    expect(PACKAGE_MOTION.timeTokens).toContain('--pulse-status');
    expect(PACKAGE_MOTION.transitionTokens).toContain('--feedback-transition');
    expect(PACKAGE_MOTION.keyframeProperties.get('design-system-pulse')).toEqual(new Set(['opacity']));
    expect(PACKAGE_MOTION.keyframeProperties.get('design-system-pop')).toEqual(new Set(['opacity', 'transform']));
    expect(SPLASH_STYLE_TEXT).toContain('.splash-step');
  });
});

describe('the tokens', () => {
  test('every text pair of COMPONENT_LIBRARY section 4 holds 4.5:1 in the light and the dark theme, the primary button 3:1', () => {
    expect(contrastSentencesOf(LINKED_TOKENS_TEXT, TEXT_PAIRS)).toEqual([]);
  });

  test('the primary button is the one pair under 4.5:1, as PLAN V9 accepts', () => {
    const pairsAtTheTextRatio = TEXT_PAIRS.map((pair) => ({ ...pair, smallestRatio: SMALLEST_TEXT_CONTRAST_RATIO }));
    expect(contrastSentencesOf(LINKED_TOKENS_TEXT, pairsAtTheTextRatio).map((sentence) => sentence.replace(/ is .*/, ''))).toEqual([
      'light: --accent-ink-on on --button',
      'dark: --accent-ink-on on --button',
    ]);
  });

  test('Gaia\'s own tokens.css redefines no token of the package\'s, so no version 1 name stands as an alias', () => {
    expect(redefinitionSentencesOf(PACKAGE_TOKENS_TEXT, TOKENS_TEXT)).toEqual([]);
  });

  test('every colour token of Gaia\'s own tokens.css has a light value and a dark value', () => {
    expect(themeGapSentencesOf(TOKENS_TEXT)).toEqual([]);
  });

  test('every token of Gaia\'s own tokens.css is read by gaia.css, the splash, a shipping component or another token', () => {
    expect(unreadTokenSentencesOf(TOKENS_TEXT, [STYLESHEET_TEXT, SPLASH_STYLE_TEXT, TOKENS_TEXT, ...SOURCES.map(({ text }) => text)])).toEqual([]);
  });
});

describe('gaia.css', () => {
  test('it holds no colour value and reads only tokens that the package\'s or Gaia\'s tokens.css defines', () => {
    expect(colourValueSentencesOf(STYLESHEET_TEXT, DEFINED_TOKENS)).toEqual([]);
  });

  test('no hover or press rule changes a size or a place', () => {
    expect(feedbackSentencesOf(STYLESHEET_TEXT)).toEqual([]);
  });

  test('every class a shipping component emits is styled, and every styled class is emitted', () => {
    expect(classContractSentencesOf(EMITTED, STYLED)).toEqual([]);
  });

  test('one rule hides every label read only by a screen reader, so its declarations are written once', () => {
    const hidesItsBox = (declaration: { readonly property: string; readonly value: string }) => declaration.property === 'clip-path' && declaration.value === 'inset(50%)';
    const hidingRules = rulesOf(STYLESHEET_TEXT).filter((rule) => rule.declarations.some(hidesItsBox));
    expect(hidingRules).toHaveLength(1);
  });
});

describe('motion in gaia.css and the splash', () => {
  test('every transition and animation is timed by a package motion token, eases by --ease-out, and animates no size or place', () => {
    for (const stylesheetText of MOTION_STYLESHEETS) expect(motionSentencesOf(stylesheetText, PACKAGE_MOTION)).toEqual([]);
  });

  test('Gaia defines no keyframe of its own: it names the package\'s', () => {
    for (const stylesheetText of MOTION_STYLESHEETS) expect(keyframeNamesOf(stylesheetText)).toEqual([]);
  });

  test('every motion token Gaia reads is zeroed before motion is ready and under reduced motion', () => {
    const reads = motionTokenReadsOf(MOTION_STYLESHEETS, PACKAGE_MOTION);
    expect(motionGateSentencesOf(PACKAGE_TOKENS_TEXT, PACKAGE_MOTION, reads)).toEqual([]);
  });
});

describe('the board\'s stylesheets', () => {
  test('BOARD_STYLESHEETS names exactly the stylesheets in page/styles/board/', () => {
    expect(boardStylesheetListSentencesOf(BOARD_STYLESHEETS, BOARD_STYLESHEETS_PRESENT)).toEqual([]);
  });

  test('every class a board component emits is styled in a board stylesheet, and every styled class is emitted', () => {
    expect(classContractSentencesOf(BOARD_EMITTED, BOARD_STYLED, BOARD_STYLESHEET_NAME)).toEqual([]);
  });

  test('no :hover or :active rule moves or resizes anything, and every allowed movement is still used', () => {
    expect(movementSentencesOf(BOARD_RULES, BOARD_MOVEMENTS_ALLOWED)).toEqual([]);
    expect(unusedAllowanceSentencesOf(BOARD_RULES, BOARD_MOVEMENTS_ALLOWED)).toEqual([]);
  });

  test('every board animation stops under prefers-reduced-motion: reduce, and every guaranteed ancestor is still used', () => {
    const boardStylesheetPaths = new Set(BOARD_RULES.map(({ stylesheet }) => stylesheet));
    const unstopped = unstoppedAnimationSentencesOf([...PACKAGE_RULES, ...BOARD_RULES], BOARD_ANCESTORS_THE_MARKUP_GUARANTEES)
      .filter((sentence) => boardStylesheetPaths.has(sentence.slice(0, sentence.indexOf(':'))));
    expect(PACKAGE_RULES.length).toBeGreaterThanOrEqual(SMALLEST_CLASS_COUNT);
    expect(unstopped).toEqual([]);
    expect(unusedGuaranteeSentencesOf(BOARD_RULES, BOARD_ANCESTORS_THE_MARKUP_GUARANTEES)).toEqual([]);
  });

  test('every brace balances', () => {
    for (const [name, text] of BOARD_STYLESHEET_TEXTS) expect(braceBalanceSentencesOf(name, text)).toEqual([]);
  });

  test('every token read is defined in the package\'s, Gaia\'s or the board\'s tokens.css, and no colour value stands outside a token', () => {
    for (const stylesheetText of BOARD_RULE_STYLESHEET_TEXTS) expect(colourValueSentencesOf(stylesheetText, BOARD_DEFINED_TOKENS)).toEqual([]);
  });

  test('every literal board colour has a light and a dark value, but one the same in both themes, set once in the light block', () => {
    expect(boardThemeSentencesOf(BOARD_TOKEN_BLOCKS, BOARD_SAME_IN_BOTH_THEMES_TOKENS)).toEqual([]);
  });

  test('every board text pair reaches 4.5:1 in both themes', () => {
    expect(contrastSentencesOf(`${LINKED_TOKENS_TEXT}\n${BOARD_TOKENS_TEXT}`, BOARD_TEXT_PAIRS)).toEqual([]);
  });

  test('no board class is gaia- and no Gaia class is board-', () => {
    const boardClasses = new Set([...BOARD_EMITTED.classNames, ...BOARD_STYLED]);
    const gaiaClasses = new Set([...EMITTED.classNames, ...STYLED]);
    expect(classPrefixSentencesOf(boardClasses, gaiaClasses)).toEqual([]);
  });

  test('every keyframe of the board is named board- and defined only in a board stylesheet', () => {
    expect(boardKeyframeSentencesOf([...BOARD_STYLESHEET_TEXTS.values()], MOTION_STYLESHEETS)).toEqual([]);
  });
});
