/**
 * The tokens of `styles/tokens.css`: every theme colour has a light and a dark value, each alias is one `var()` line no theme repeats, a colour
 * equal in both themes is set once and listed here, a state tone row's literal colour is set again in its dark row, the type scale and corners
 * hold the handoff's sizes, and every time token but the toast's reading time is zeroed under reduced motion and before the first paint.
 */
import { describe, expect, test } from 'bun:test';

import { packageFilesMatching } from '../testing/PackageFiles.ts';

const TOKENS_STYLESHEET_PATH = 'styles/tokens.css';
const LIGHT_SELECTOR = ':root';
const DARK_SELECTOR = ':root[data-theme="dark"]';
const REDUCED_MOTION_CONDITION = '@media (prefers-reduced-motion: reduce)';
const BEFORE_FIRST_PAINT_SELECTOR = ':root:not([data-motion="ready"])';
const SMALLEST_DARK_DECLARATION_COUNT = 40;
const SMALLEST_MOTION_TOKEN_COUNT = 15;
const SMALLEST_TONE_ROW_COUNT = 10;

/** The colours and corners of the larger views. */
const LARGER_VIEW_TOKENS = [
  '--surface-page',
  '--surface-panel',
  '--surface-raised',
  '--surface-info',
  '--line-hairline',
  '--line-control',
  '--line-arrow',
  '--line-conditional',
  '--ink-1',
  '--ink-2',
  '--ink-3',
  '--ink-4',
  '--accent-hover',
  '--accent-ring',
  '--accent-outline',
  '--primary-disabled-fill',
  '--primary-disabled-ink',
  '--done-fill',
  '--done-ink',
  '--done-edge',
  '--live-dot',
  '--decision-fill',
  '--decision-ink',
  '--decision-edge',
  '--decision-accent',
  '--decision-option-fill',
  '--decision-input-fill',
  '--decision-option-ink',
  '--change-changed-fill',
  '--change-changed-ink',
  '--change-changed-edge',
  '--change-changed-dot',
  '--change-new-fill',
  '--change-new-ink',
  '--change-new-edge',
  '--change-removed-fill',
  '--change-removed-ink',
  '--change-removed-edge',
  '--change-removed-row-edge',
  '--info-fill',
  '--info-ink',
  '--log-surface',
  '--tooltip-surface',
  '--toast-fill',
  '--toast-track',
  '--toast-check',
  '--overlay',
  '--shadow-modal',
  '--shadow-menu',
  '--shadow-toast',
  '--shadow-tooltip',
  '--r-group',
  '--r-dialog',
] as const;

/** A value that is a time and nothing else: a duration or a period a motion reads. */
const TIME_VALUE_PATTERN = /^[\d.]+m?s$/;
const LITERAL_COLOUR_PATTERN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(|#[0-9a-f]{3,8}\b/i;
const TONE_ROW_SELECTOR_PATTERN = /^\[data-state-tone="[\w-]+"\]$/;
const READING_TIME_TOKEN = '--toast-duration';

/** The graphite-and-orange colours with a literal value in each theme. */
const THEMED_COLOUR_TOKENS = [
  '--bg',
  '--lane-bg',
  '--surface',
  '--ink',
  '--ink-muted',
  '--ink-disabled',
  '--line',
  '--line-strong',
  '--wash',
  '--button',
  '--link',
  '--link-tint',
  '--accent-edge',
  '--tone-info',
  '--tone-success',
  '--neutral-fill',
  '--pass-tint',
  '--pass-ink',
  '--err-fill',
  '--err-tint',
  '--err-edge',
  '--err-ink',
  '--skeleton-sheen',
  '--shadow-card-lift',
  '--badge-info-tint',
  '--badge-info-ink',
  '--badge-info-edge',
  '--badge-success-tint',
  '--badge-success-ink',
  '--badge-success-edge',
] as const;

/** The colours the same in both themes, set once in the light block; exact both ways, so a new literal with no dark value is a decision. */
const SAME_IN_BOTH_THEMES_TOKENS = [
  '--signal',
  '--accent-ink-on',
  '--switch-knob',
  '--flint-eye',
  '--shadow-control',
  '--flare-light',
] as const;

/** The tokens that name a colour another token holds: one `var()` line in the alias block, never a literal in a theme block. */
const ALIASED_TOKENS = [
  '--surface-2',
  '--surface-selected',
  '--surface-info',
  '--log-surface',
  '--tooltip-surface',
  '--ink-2',
  '--line-arrow',
  '--line-conditional',
  '--status-live',
  '--accent-hover',
  '--warn-tint',
  '--warn-edge',
  '--warn-ink',
  '--primary-disabled-fill',
  '--primary-disabled-ink',
  '--toast-fill',
  '--toast-track',
  '--toast-check',
  '--decision-fill',
  '--decision-ink',
  '--decision-edge',
  '--decision-accent',
  '--decision-option-fill',
  '--decision-input-fill',
  '--decision-option-ink',
  '--change-changed-fill',
  '--change-changed-ink',
  '--change-changed-dot',
  '--change-new-fill',
  '--change-new-ink',
  '--change-removed-fill',
  '--change-removed-ink',
  '--change-removed-row-edge',
  '--badge-accent-tint',
  '--badge-accent-ink',
  '--badge-accent-edge',
  '--badge-ink-tint',
  '--badge-ink-ink',
  '--badge-ink-edge',
  '--badge-muted-tint',
  '--badge-muted-ink',
  '--badge-muted-edge',
] as const;

/** The type scale and the corners of the handoff, each a size no theme changes. */
const TYPE_AND_CORNER_SIZES: Readonly<Record<string, string>> = {
  '--fs-display':             '34px',
  '--fs-phase':               '28px',
  '--fs-page':                '22px',
  '--fs-section':             '21px',
  '--fs-title':               '15px',
  '--fs-lead':                '13.5px',
  '--fs-body':                '13px',
  '--fs-tab':                 '12.5px',
  '--fs-small':               '12px',
  '--fs-pill':                '11.5px',
  '--fs-micro':               '11px',
  '--line-height-display':    '40px',
  '--line-height-phase':      '34px',
  '--line-height-page':       '28px',
  '--line-height-section':    '26px',
  '--line-height-lead':       '20px',
  '--line-height-body':       '19px',
  '--line-height-micro':      '16px',
  '--letter-spacing-display': '-0.02em',
  '--letter-spacing-micro':   '0.07em',
  '--r-1':                    '4px',
  '--r-2':                    '6px',
  '--r-3':                    '8px',
  '--r-group':                '8px',
  '--r-dialog':               '8px',
  '--r-pill':                 '999px',
};

/** Values a theme does not change: a size, a radius, a time or no colour at all. */
const THEMELESS_VALUE_PATTERN = /^(?:-?[\d.]+(?:px|ms|s|em)?|transparent)$/;

interface TokenBlock {
  readonly condition: string;
  readonly selector:  string;
  readonly values:    ReadonlyMap<string, string>;
}

/** The custom-property blocks of the stylesheet, top level and one `@media` deep, with their conditions. */
function tokenBlocksOf(stylesheetText: string): TokenBlock[] {
  const text = stylesheetText.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks: TokenBlock[] = [];
  const collect = (start: number, end: number, condition: string): void => {
    let preludeStart = start;
    let position = start;
    while (position < end) {
      if (text[position] === '{') {
        const prelude = text.slice(preludeStart, position).trim();
        let depth = 1;
        let closing = position + 1;
        while (depth > 0 && closing < end) {
          if (text[closing] === '{') depth += 1;
          if (text[closing] === '}') depth -= 1;
          closing += 1;
        }
        if (prelude.startsWith('@media')) collect(position + 1, closing - 1, prelude);
        else {
          const values = new Map<string, string>();
          for (const declaration of text.slice(position + 1, closing - 1).split(';')) {
            const separator = declaration.indexOf(':');
            const property = declaration.slice(0, separator).trim();
            if (property.startsWith('--')) values.set(property, declaration.slice(separator + 1).trim());
          }
          blocks.push({ condition, selector: prelude, values });
        }
        position = closing;
        preludeStart = closing;
      } else position += 1;
    }
  };
  collect(0, text.length, '');
  return blocks;
}

function valueIn(blocks: readonly TokenBlock[], condition: string, selector: string, token: string): string | undefined {
  return blocks.filter((block) => block.condition === condition && block.selector === selector).findLast((block) => block.values.has(token))?.values.get(token);
}

function themeSentencesOf(blocks: readonly TokenBlock[], tokens: readonly string[]): string[] {
  return tokens.flatMap((token) => {
    const lightValue = valueIn(blocks, '', LIGHT_SELECTOR, token);
    if (lightValue === undefined) return [`${token} has no value in ${LIGHT_SELECTOR}`];
    const followsTheTheme = lightValue.includes('var(') || THEMELESS_VALUE_PATTERN.test(lightValue);
    if (followsTheTheme || valueIn(blocks, '', DARK_SELECTOR, token) !== undefined) return [];
    return [`${token} is a literal in ${LIGHT_SELECTOR} and has no value in ${DARK_SELECTOR}`];
  });
}

function zeroSentencesOf(blocks: readonly TokenBlock[], tokens: readonly string[]): string[] {
  return tokens.flatMap((token) => [
    ...valueIn(blocks, REDUCED_MOTION_CONDITION, LIGHT_SELECTOR, token) === '0ms' ? [] : [`${token} is not 0ms under reduced motion`],
    ...valueIn(blocks, '', BEFORE_FIRST_PAINT_SELECTOR, token) === '0ms' ? [] : [`${token} is not 0ms before the first paint`],
  ]);
}

function aliasSentencesOf(blocks: readonly TokenBlock[], tokens: readonly string[]): string[] {
  return tokens.flatMap((token) => [
    ...valueIn(blocks, '', LIGHT_SELECTOR, token)?.startsWith('var(') === true ? [] : [`${token} is not an alias in ${LIGHT_SELECTOR}`],
    ...valueIn(blocks, '', DARK_SELECTOR, token) === undefined ? [] : [`${token} is an alias and also has a value in ${DARK_SELECTOR}`],
  ]);
}

/** The tokens of the light theme whose value is a time, but the one that is a reading time. */
function motionTokensOf(blocks: readonly TokenBlock[]): string[] {
  const lightTokens = new Map(blocks.filter((block) => block.condition === '' && block.selector === LIGHT_SELECTOR).flatMap((block) => [...block.values]));
  return [...lightTokens].filter(([token, value]) => TIME_VALUE_PATTERN.test(value) && token !== READING_TIME_TOKEN).map(([token]) => token);
}

function isLiteralColour(value: string): boolean {
  return LITERAL_COLOUR_PATTERN.test(value) && !value.includes('var(');
}

/** A literal colour of the light theme with no dark value is a colour the same in both themes, and is listed as one. */
function unlistedLiteralSentencesOf(blocks: readonly TokenBlock[], sameInBothThemesTokens: readonly string[]): string[] {
  const lightTokens = new Map(blocks.filter((block) => block.condition === '' && block.selector === LIGHT_SELECTOR).flatMap((block) => [...block.values]));
  return [...lightTokens]
    .filter(([token, value]) => isLiteralColour(value) && valueIn(blocks, '', DARK_SELECTOR, token) === undefined && !sameInBothThemesTokens.includes(token))
    .map(([token]) => `${token} is a literal colour in ${LIGHT_SELECTOR} with no value in ${DARK_SELECTOR}, and is not listed as the same in both themes`);
}

function toneRowsOf(blocks: readonly TokenBlock[]): TokenBlock[] {
  return blocks.filter((block) => block.condition === '' && TONE_ROW_SELECTOR_PATTERN.test(block.selector));
}

/** A state tone's property set to a literal colour in its light row is set again in its dark row; a `var()` already follows the theme. */
function toneRowSentencesOf(blocks: readonly TokenBlock[]): string[] {
  return toneRowsOf(blocks).flatMap((row) => [...row.values]
    .filter(([property, value]) => isLiteralColour(value) && valueIn(blocks, '', `${DARK_SELECTOR} ${row.selector}`, property) === undefined)
    .map(([property]) => `${row.selector} sets ${property} to a literal and ${DARK_SELECTOR} ${row.selector} does not set it`));
}

function sameInBothThemesSentencesOf(blocks: readonly TokenBlock[], tokens: readonly string[]): string[] {
  return tokens.flatMap((token) => [
    ...valueIn(blocks, '', LIGHT_SELECTOR, token) === undefined ? [`${token} has no value in ${LIGHT_SELECTOR}`] : [],
    ...valueIn(blocks, '', DARK_SELECTOR, token) === undefined ? [] : [`${token} is the same in both themes and has a value in ${DARK_SELECTOR}`],
  ]);
}

const realBlocks = packageFilesMatching(TOKENS_STYLESHEET_PATH).flatMap(({ text }) => tokenBlocksOf(text));

describe('the tokens of the package', () => {
  test('the scan found the light, dark, reduced-motion and first-paint blocks, the motion tokens and the state tone rows', () => {
    const darkDeclarationCount = realBlocks.filter((block) => block.selector === DARK_SELECTOR).reduce((count, block) => count + block.values.size, 0);
    expect(darkDeclarationCount).toBeGreaterThan(SMALLEST_DARK_DECLARATION_COUNT);
    expect(valueIn(realBlocks, '', LIGHT_SELECTOR, '--bg')).toBeDefined();
    expect(valueIn(realBlocks, REDUCED_MOTION_CONDITION, LIGHT_SELECTOR, '--motion-fast')).toBe('0ms');
    expect(valueIn(realBlocks, '', BEFORE_FIRST_PAINT_SELECTOR, '--motion-fast')).toBe('0ms');
    expect(motionTokensOf(realBlocks)).toContain('--motion-fast');
    expect(motionTokensOf(realBlocks)).toContain('--pulse-status');
    expect(motionTokensOf(realBlocks).length).toBeGreaterThanOrEqual(SMALLEST_MOTION_TOKEN_COUNT);
    expect(toneRowsOf(realBlocks).length).toBeGreaterThanOrEqual(SMALLEST_TONE_ROW_COUNT);
  });

  test('every larger-view token has a value in the light and the dark theme', () => {
    expect(themeSentencesOf(realBlocks, LARGER_VIEW_TOKENS)).toEqual([]);
  });

  test('reduced motion and the first paint zero every token that is a time', () => {
    expect(zeroSentencesOf(realBlocks, motionTokensOf(realBlocks))).toEqual([]);
  });

  test('reduced motion keeps the toast\'s reading time', () => {
    expect(valueIn(realBlocks, '', LIGHT_SELECTOR, READING_TIME_TOKEN)).toBe('5s');
    expect(valueIn(realBlocks, REDUCED_MOTION_CONDITION, LIGHT_SELECTOR, READING_TIME_TOKEN)).toBeUndefined();
  });

  test('every themed colour token has a value in the light and the dark theme', () => {
    expect(themeSentencesOf(realBlocks, THEMED_COLOUR_TOKENS)).toEqual([]);
  });

  test('every alias is one var() line that no dark block repeats', () => {
    expect(aliasSentencesOf(realBlocks, ALIASED_TOKENS)).toEqual([]);
  });

  test('a colour the same in both themes is set once, in the light block', () => {
    expect(sameInBothThemesSentencesOf(realBlocks, SAME_IN_BOTH_THEMES_TOKENS)).toEqual([]);
  });

  test('every literal colour of the light theme has a dark value or is listed as the same in both themes', () => {
    expect(unlistedLiteralSentencesOf(realBlocks, SAME_IN_BOTH_THEMES_TOKENS)).toEqual([]);
  });

  test('every literal colour of a state tone row is set again in its dark row', () => {
    expect(toneRowSentencesOf(realBlocks)).toEqual([]);
  });

  test('the type scale and the corners hold the handoff\'s sizes', () => {
    const sizes = Object.fromEntries(Object.keys(TYPE_AND_CORNER_SIZES).map((token) => [token, valueIn(realBlocks, '', LIGHT_SELECTOR, token)]));
    expect(sizes).toEqual(TYPE_AND_CORNER_SIZES);
    expect(themeSentencesOf(realBlocks, Object.keys(TYPE_AND_CORNER_SIZES))).toEqual([]);
  });
});

describe('the test, planted in memory', () => {
  test('a literal light value with no dark value fails, naming the token', () => {
    const planted = tokenBlocksOf(':root { --planted-fill: oklch(0.9 0 0); --planted-alias: var(--bg); --planted-size: 12px; }');
    expect(themeSentencesOf(planted, ['--planted-fill', '--planted-alias', '--planted-size'])).toEqual([
      `--planted-fill is a literal in ${LIGHT_SELECTOR} and has no value in ${DARK_SELECTOR}`,
    ]);
  });

  test('a token missing from the light theme fails', () => {
    expect(themeSentencesOf(tokenBlocksOf(`${DARK_SELECTOR} { --planted-fill: oklch(0.2 0 0); }`), ['--planted-fill'])).toEqual([
      `--planted-fill has no value in ${LIGHT_SELECTOR}`,
    ]);
  });

  test('an alias written as a literal, or repeated in the dark block, fails', () => {
    const planted = tokenBlocksOf(
      `:root { --planted-alias: var(--bg); --planted-literal: #ffffff; --planted-repeated: var(--bg); } ${DARK_SELECTOR} { --planted-repeated: #000000; }`,
    );
    expect(aliasSentencesOf(planted, ['--planted-alias', '--planted-literal', '--planted-repeated'])).toEqual([
      `--planted-literal is not an alias in ${LIGHT_SELECTOR}`,
      `--planted-repeated is an alias and also has a value in ${DARK_SELECTOR}`,
    ]);
  });

  test('a colour the same in both themes that the dark block repeats, or the light block lacks, fails', () => {
    const planted = tokenBlocksOf(`:root { --planted-once: #ffffff; --planted-twice: #ffffff; } ${DARK_SELECTOR} { --planted-twice: #ffffff; --planted-dark: #000000; }`);
    expect(sameInBothThemesSentencesOf(planted, ['--planted-once', '--planted-twice', '--planted-dark'])).toEqual([
      `--planted-twice is the same in both themes and has a value in ${DARK_SELECTOR}`,
      `--planted-dark has no value in ${LIGHT_SELECTOR}`,
      `--planted-dark is the same in both themes and has a value in ${DARK_SELECTOR}`,
    ]);
  });

  test('a motion token reduced motion does not zero fails, and a zeroed one passes', () => {
    const planted = tokenBlocksOf(
      `${REDUCED_MOTION_CONDITION} { :root { --planted-zeroed: 0ms; } } ${BEFORE_FIRST_PAINT_SELECTOR} { --planted-zeroed: 0ms; --planted-kept: 0ms; }`,
    );
    expect(zeroSentencesOf(planted, ['--planted-zeroed', '--planted-kept'])).toEqual(['--planted-kept is not 0ms under reduced motion']);
  });

  test('a token that is a time is a motion token, the reading time and a size are not, and one left running fails', () => {
    const planted = tokenBlocksOf(`:root { --planted-motion: 240ms; --planted-period: 1.6s; ${READING_TIME_TOKEN}: 5s; --planted-size: 12px; }`);
    expect(motionTokensOf(planted)).toEqual(['--planted-motion', '--planted-period']);
    expect(zeroSentencesOf(planted, motionTokensOf(planted))).toEqual([
      '--planted-motion is not 0ms under reduced motion',
      '--planted-motion is not 0ms before the first paint',
      '--planted-period is not 0ms under reduced motion',
      '--planted-period is not 0ms before the first paint',
    ]);
  });

  test('a literal colour with no dark value that is not listed fails, and a listed, a themed, an aliased and a sized one pass', () => {
    const planted = tokenBlocksOf(
      ':root { --planted-new: oklch(0.9 0 0); --planted-listed: #ffffff; --planted-themed: #ffffff; --planted-alias: var(--bg); --planted-size: 12px; }'
      + ` ${DARK_SELECTOR} { --planted-themed: #000000; }`,
    );
    expect(unlistedLiteralSentencesOf(planted, ['--planted-listed'])).toEqual([
      `--planted-new is a literal colour in ${LIGHT_SELECTOR} with no value in ${DARK_SELECTOR}, and is not listed as the same in both themes`,
    ]);
  });

  test('a state tone row whose literal colour has no dark row fails, and a var() and a literal the dark row sets pass', () => {
    const planted = tokenBlocksOf(
      '[data-state-tone="planted"] { --s-fill: var(--signal); --s-tint: #e0f2f5; --s-ink: #0e6672; }'
      + ` ${DARK_SELECTOR} [data-state-tone="planted"] { --s-tint: #123a40; }`,
    );
    expect(toneRowSentencesOf(planted)).toEqual([
      `[data-state-tone="planted"] sets --s-ink to a literal and ${DARK_SELECTOR} [data-state-tone="planted"] does not set it`,
    ]);
  });
});
