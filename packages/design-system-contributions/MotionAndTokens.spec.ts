/**
 * What the package's stylesheets read and how they move. What matters: every value a stylesheet reads through `var()` is a token of the
 * design-system package, and no stylesheet holds a colour of its own; a hover or a press changes no size or place; every transition is timed
 * by a motion token of the design-system package, eases by `--ease-out` and animates no size or place, and a starting style starts from no
 * size or place; every time token read is one the design-system package zeroes before motion is ready and under reduced motion, so a first
 * render and reduced motion show no movement; and the package defines no keyframe and runs no animation, since a part that appears fades in
 * by a `@starting-style` transition. The scan first proves it read the stylesheets and the design-system package's tokens, and each form is
 * planted in memory.
 */
import { describe, expect, test } from 'bun:test';

import { designSystemStylesheetText }             from './testing/DesignSystemPackage.ts';
import { COMPONENT_LAYERS, packageFilesMatching } from './testing/PackageFiles.ts';

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
  'filter',
  'outline-color',
  'text-decoration',
  'text-decoration-color',
  'cursor',
]);

/** Properties a transition or a starting style may animate: none of them sizes or places a box. */
const MOTION_PROPERTIES = new Set([
  'color',
  'background-color',
  'border-color',
  'box-shadow',
  'opacity',
  'filter',
  'text-decoration-color',
]);

const EASE_TOKEN = 'var(--ease-out)';
const MOTION_GATE_SELECTOR = ':root:not([data-motion="ready"])';
const REDUCED_MOTION_PATTERN = /prefers-reduced-motion:\s*reduce/;
const RAW_TIME_PATTERN = /^-?[\d.]+m?s$/;
const RAW_EASE_PATTERN = /^(?:ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|steps\(.*\)|cubic-bezier\(.*\)|linear\(.*\))$/;
const COLOUR_PATTERN = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/i;
/** The named colours a stylesheet might reach for; `currentColor` names no colour of its own and stays allowed. */
const NAMED_COLOUR_PATTERN = /\b(?:black|white|red|green|blue|orange|grey|gray|transparent)\b/i;
const SMALLEST_STYLESHEET_COUNT = 8;
const SMALLEST_TRANSITION_COUNT = 3;

function withoutComments(stylesheetText: string): string {
  return stylesheetText.replace(/\/\*[\s\S]*?\*\//g, '');
}

function declarationsOf(body: string): Declaration[] {
  return body.split(';').map((part) => part.trim()).filter((part) => part !== '' && part.includes(':')).map((part) => {
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
    else rules.push({ selector: prelude.replace(/\s+/g, ' '), atRule, declarations: declarationsOf(body) });
    preludeStart = closeAt;
    i = closeAt;
  }
  return rules;
}

/** A value split at the separators outside every parenthesis: a transition list at its commas, an item at its spaces. */
function topLevelPartsOf(value: string, separator: ',' | ' '): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of value) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (depth === 0 && (separator === ',' ? character === ',' : /\s/.test(character))) {
      parts.push(current.trim());
      current = '';
    } else current += character;
  }
  parts.push(current.trim());
  return parts.filter((part) => part !== '');
}

/** The design-system package's tokens as this package reads them: every name it defines, its time tokens and the transitions made of them. */
interface ThemeTokens {
  readonly names:                    ReadonlySet<string>;
  readonly timeTokens:               ReadonlySet<string>;
  readonly transitionTokens:         ReadonlyMap<string, readonly string[]>;
  readonly zeroedBeforeReady:        ReadonlySet<string>;
  readonly zeroedUnderReducedMotion: ReadonlySet<string>;
}

function themeTokensOf(tokensText: string): ThemeTokens {
  const rules = rulesOf(tokensText);
  const declarations = rules.flatMap((rule) => rule.declarations).filter((declaration) => declaration.property.startsWith('--'));
  const topLevel = rules.filter((rule) => rule.atRule === null && rule.selector === ':root').flatMap((rule) => rule.declarations);
  const timeTokens = new Set(topLevel.filter((declaration) => RAW_TIME_PATTERN.test(declaration.value)).map((declaration) => declaration.property));
  const transitionTokens = new Map(topLevel.flatMap((declaration) => {
    const times = [...new Set([...declaration.value.matchAll(/var\((--[\w-]+)\)/g)].map(([, tokenName = '']) => tokenName))].filter((tokenName) => timeTokens.has(tokenName));
    return times.length === 0 ? [] : [[declaration.property, times] as const];
  }));
  const zeroedIn = (selected: readonly StyleRule[]) => new Set(selected.flatMap((rule) => rule.declarations)
    .filter((declaration) => RAW_TIME_PATTERN.test(declaration.value) && Number.parseFloat(declaration.value) === 0)
    .map((declaration) => declaration.property));
  return {
    names:                    new Set(declarations.map((declaration) => declaration.property)),
    timeTokens,
    transitionTokens,
    zeroedBeforeReady:        zeroedIn(rules.filter((rule) => rule.atRule === null && rule.selector === MOTION_GATE_SELECTOR)),
    zeroedUnderReducedMotion: zeroedIn(rules.filter((rule) => rule.atRule !== null && REDUCED_MOTION_PATTERN.test(rule.atRule) && rule.selector === ':root')),
  };
}

function tokenReadSentencesOf(path: string, stylesheetText: string, theme: ThemeTokens): string[] {
  return rulesOf(stylesheetText).flatMap((rule) => rule.declarations.flatMap((declaration) => {
    const site = `${path}: ${rule.selector} { ${declaration.property} }`;
    const valueOutsideTokens = declaration.value.replace(/var\(\s*--[\w-]+\s*\)/g, '');
    return [
      ...(COLOUR_PATTERN.test(declaration.value) || NAMED_COLOUR_PATTERN.test(valueOutsideTokens) ? [`${site} holds a colour of its own: ${declaration.value}`] : []),
      ...[...declaration.value.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, tokenName = '']) => tokenName)
        .filter((tokenName) => !theme.names.has(tokenName))
        .map((tokenName) => `${site} reads ${tokenName}, which the design-system package's tokens do not define`),
    ];
  }));
}

function feedbackSentencesOf(path: string, stylesheetText: string): string[] {
  return rulesOf(stylesheetText).filter((rule) => /:(?:hover|active)\b/.test(rule.selector)).flatMap((rule) => rule.declarations
    .filter((declaration) => !FEEDBACK_PROPERTIES.has(declaration.property))
    .map((declaration) => `${path}: ${rule.selector} sets ${declaration.property}, which may size or place a box`));
}

/** One transition item: timed by a motion token, eased by the ease token, animating no size or place. */
function transitionItemSentencesOf(site: string, item: string, theme: ThemeTokens): string[] {
  const words = topLevelPartsOf(item, ' ');
  const tokenOf = (word: string) => /^var\((--[\w-]+)\)$/.exec(word)?.[1] ?? null;
  if (words.length === 1 && theme.transitionTokens.has(tokenOf(words[0] ?? '') ?? '')) return [];
  const sentences: string[] = [];
  let timed = false;
  for (const word of words) {
    const tokenName = tokenOf(word);
    if (tokenName !== null && theme.timeTokens.has(tokenName)) timed = true;
    else if (word === EASE_TOKEN) continue;
    else if (RAW_TIME_PATTERN.test(word)) sentences.push(`${site} names a raw time: ${word}`);
    else if (RAW_EASE_PATTERN.test(word)) sentences.push(`${site} eases by ${word}, not ${EASE_TOKEN}`);
    else if (tokenName !== null) sentences.push(`${site} reads ${tokenName}, which is no motion token`);
    else if (!MOTION_PROPERTIES.has(word)) sentences.push(`${site} animates ${word}, which may size or place a box`);
  }
  if (!timed) sentences.push(`${site} is timed by no motion token`);
  return sentences;
}

function motionSentencesOf(path: string, stylesheetText: string, theme: ThemeTokens): string[] {
  const keyframes = [...withoutComments(stylesheetText).matchAll(/@keyframes\s+([\w-]+)/g)].map(([, name = '']) => `${path} defines the keyframes ${name}`);
  const ruleSentences = rulesOf(stylesheetText).flatMap((rule) => {
    if (rule.atRule === '@starting-style') {
      return rule.declarations.filter((declaration) => !MOTION_PROPERTIES.has(declaration.property))
        .map((declaration) => `${path}: ${rule.selector} starts from ${declaration.property}, which may size or place a box`);
    }
    return rule.declarations.flatMap((declaration) => {
      const site = `${path}: ${rule.selector} { ${declaration.property} }`;
      if (declaration.value === 'none') return [];
      if (/^animation/.test(declaration.property)) return [`${site} runs an animation; a part that appears fades in by a @starting-style transition`];
      if (declaration.property !== 'transition') return /^transition-/.test(declaration.property) ? [`${site} sets a longhand; write the whole transition`] : [];
      return topLevelPartsOf(declaration.value, ',').flatMap((item) => transitionItemSentencesOf(site, item, theme));
    });
  });
  return [...keyframes, ...ruleSentences];
}

/** Every time token a transition reads, itself or through a transition token, is zeroed before motion is ready and under reduced motion. */
function motionGateSentencesOf(stylesheetTexts: readonly string[], theme: ThemeTokens): string[] {
  const timesRead = new Set(stylesheetTexts.flatMap((stylesheetText) => rulesOf(stylesheetText)).flatMap((rule) => rule.declarations)
    .filter((declaration) => declaration.property === 'transition')
    .flatMap((declaration) => [...declaration.value.matchAll(/var\((--[\w-]+)\)/g)].map(([, tokenName = '']) => tokenName))
    .flatMap((tokenName) => (theme.timeTokens.has(tokenName) ? [tokenName] : [...theme.transitionTokens.get(tokenName) ?? []])));
  return [...timesRead].sort().flatMap((time) => [
    ...(theme.zeroedBeforeReady.has(time) ? [] : [`${time} is not zeroed before motion is ready`]),
    ...(theme.zeroedUnderReducedMotion.has(time) ? [] : [`${time} is not zeroed under reduced motion`]),
  ]);
}

const STYLESHEETS = [...COMPONENT_LAYERS.map((layer) => `${layer}/*.css`), 'styles/*.css'].flatMap((pattern) => packageFilesMatching(pattern));
const THEME = themeTokensOf(designSystemStylesheetText('tokens.css'));

describe('the scan itself', () => {
  test('it reads the stylesheets of the package, their transitions, and the design-system package\'s tokens and motion gates', () => {
    expect(STYLESHEETS.length).toBeGreaterThanOrEqual(SMALLEST_STYLESHEET_COUNT);
    expect(STYLESHEETS.map(({ path }) => path)).toEqual(expect.arrayContaining(['atoms/TextField.css', 'molecules/FailedAction.css']));
    const transitions = STYLESHEETS.flatMap(({ text }) => rulesOf(text)).flatMap((rule) => rule.declarations).filter((declaration) => declaration.property === 'transition');
    expect(transitions.length).toBeGreaterThanOrEqual(SMALLEST_TRANSITION_COUNT);
    expect([THEME.names.has('--err-ink'), THEME.timeTokens.has('--motion-base'), THEME.transitionTokens.get('--feedback-transition')]).toEqual([true, true, ['--motion-fast']]);
    expect([THEME.zeroedBeforeReady.has('--motion-base'), THEME.zeroedUnderReducedMotion.has('--motion-base')]).toEqual([true, true]);
    expect(rulesOf('@starting-style { .a { opacity: 0; } } .b:hover { color: var(--ink); }').map((rule) => [rule.selector, rule.atRule]))
      .toEqual([['.a', '@starting-style'], ['.b:hover', null]]);
  });
});

describe('the stylesheets of the package', () => {
  test('every value read is a token of the design-system package, and no stylesheet holds a colour of its own', () => {
    expect(STYLESHEETS.flatMap(({ path, text }) => tokenReadSentencesOf(path, text, THEME))).toEqual([]);
  });

  test('no hover or press changes a size or a place', () => {
    expect(STYLESHEETS.flatMap(({ path, text }) => feedbackSentencesOf(path, text))).toEqual([]);
  });

  test('every transition is timed by a motion token, eases by --ease-out and animates no size or place, and nothing runs an animation', () => {
    expect(STYLESHEETS.flatMap(({ path, text }) => motionSentencesOf(path, text, THEME))).toEqual([]);
  });

  test('every time a transition reads is zeroed before motion is ready and under reduced motion', () => {
    expect(motionGateSentencesOf(STYLESHEETS.map(({ text }) => text), THEME)).toEqual([]);
  });
});

describe('the guard still names each form, planted in memory', () => {
  test('a colour literal, a colour function, a named colour and an unknown token are named, and currentColor and a token are not', () => {
    const planted = '.a { color: #fff; } .b { background: oklch(0.5 0 0); } .c { border: 1px solid red; } .d { color: var(--planted-ink); }'
      + ' .e { stroke: currentColor; fill: var(--ink); }';
    expect(tokenReadSentencesOf('planted.css', planted, THEME)).toEqual([
      'planted.css: .a { color } holds a colour of its own: #fff',
      'planted.css: .b { background } holds a colour of its own: oklch(0.5 0 0)',
      'planted.css: .c { border } holds a colour of its own: 1px solid red',
      'planted.css: .d { color } reads --planted-ink, which the design-system package\'s tokens do not define',
    ]);
  });

  test('a hover or press that sizes or places a box is named, and one that changes only colours is not', () => {
    expect(feedbackSentencesOf('planted.css', '.a:hover { background: var(--wash); } .b:active { transform: scale(0.98); } .c:hover { padding: 0; }')).toEqual([
      'planted.css: .b:active sets transform, which may size or place a box',
      'planted.css: .c:hover sets padding, which may size or place a box',
    ]);
  });

  test('a raw time, a raw ease, a size, a longhand, a starting size, an animation and a keyframe are named, and the tokens pass', () => {
    const planted = [
      '.a { transition: var(--feedback-transition); } .b { transition: opacity var(--motion-base) var(--ease-out), color var(--motion-fast) var(--ease-out); }',
      '.c { transition: opacity 140ms ease-in-out; } .d { transition: height var(--motion-base) var(--ease-out); } .e { transition-duration: 1s; }',
      '@starting-style { .f { opacity: 0; transform: translateY(4px); } }',
      '.g { animation: design-system-planted var(--motion-base) var(--ease-out); } @keyframes design-system-planted { from { opacity: 0; } }',
    ].join(' ');
    expect(motionSentencesOf('planted.css', planted, THEME)).toEqual([
      'planted.css defines the keyframes design-system-planted',
      'planted.css: .c { transition } names a raw time: 140ms',
      'planted.css: .c { transition } eases by ease-in-out, not var(--ease-out)',
      'planted.css: .c { transition } is timed by no motion token',
      'planted.css: .d { transition } animates height, which may size or place a box',
      'planted.css: .e { transition-duration } sets a longhand; write the whole transition',
      'planted.css: .f starts from transform, which may size or place a box',
      'planted.css: .g { animation } runs an animation; a part that appears fades in by a @starting-style transition',
    ]);
  });

  test('a time the design-system package leaves running before motion is ready or under reduced motion is named', () => {
    const plantedTheme = themeTokensOf([
      ':root { --motion-fast: 120ms; --motion-slow: 220ms; --toast-duration: 5s; --feedback-transition: color var(--motion-fast) var(--ease-out); }',
      ':root:not([data-motion="ready"]) { --motion-fast: 0ms; --motion-slow: 0ms; }',
      '@media (prefers-reduced-motion: reduce) { :root { --motion-fast: 0ms; } }',
    ].join(' '));
    const planted = '.a { transition: var(--feedback-transition); } .b { transition: opacity var(--motion-slow) var(--ease-out), color var(--toast-duration) var(--ease-out); }';
    expect(motionGateSentencesOf([planted], plantedTheme)).toEqual([
      '--motion-slow is not zeroed under reduced motion',
      '--toast-duration is not zeroed before motion is ready',
      '--toast-duration is not zeroed under reduced motion',
    ]);
  });
});
