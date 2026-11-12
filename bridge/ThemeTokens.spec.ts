/**
 * The pipeline views' tokens in `bridge/styles/tokens.css`: each exists in both themes (a literal value is set for light and again for
 * dark, an alias of a themed token follows both), each motion token is zeroed under reduced motion and before the first paint, and the
 * three design colours with no name of their own each read a named token. The toast's duration is the time to read it, so it stays.
 * The scan first proves it found the theme blocks, and a missing dark value and a missing zero are each planted in memory.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

const TOKENS_STYLESHEET_PATH = join(import.meta.dir, 'styles', 'tokens.css');
const LIGHT_SELECTOR = ':root';
const DARK_SELECTOR = ':root[data-theme="dark"]';
const REDUCED_MOTION_CONDITION = '@media (prefers-reduced-motion: reduce)';
const BEFORE_FIRST_PAINT_SELECTOR = ':root:not([data-motion="ready"])';
const SMALLEST_DARK_DECLARATION_COUNT = 40;

const PIPELINE_TOKENS = [
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
  '--accent-ink-on',
  '--accent-hover',
  '--accent-ring',
  '--accent-outline',
  '--ticket-chip-tint',
  '--ticket-chip-ink',
  '--human-review-fill',
  '--human-review-edge',
  '--human-review-ink',
  '--primary-disabled-fill',
  '--primary-disabled-ink',
  '--done-fill',
  '--done-ink',
  '--done-edge',
  '--live-dot',
  '--question-fill',
  '--question-ink',
  '--question-edge',
  '--question-accent',
  '--question-option-fill',
  '--question-input-fill',
  '--question-option-ink',
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
  '--flow-rollback',
  '--flow-rollback-label',
  '--info-fill',
  '--info-ink',
  '--flow-canvas',
  '--flow-grid-dot',
  '--flow-group-fill',
  '--log-surface',
  '--tooltip-surface',
  '--toast-fill',
  '--toast-track',
  '--toast-check',
  '--new-text-tint',
  '--overlay',
  '--shadow-modal',
  '--shadow-menu',
  '--shadow-toast',
  '--shadow-tooltip',
  '--r-group',
  '--r-dialog',
  '--flow-node-width',
] as const;

const MOTION_TOKENS_ZEROED = ['--motion-rise', '--motion-pop', '--motion-modal', '--rise-step', '--glow-period', '--flow-dash-period'] as const;
const READING_TIME_TOKEN = '--toast-duration';

/** The design colours that had no token, each with the token that now holds it. */
const UNTOKENISED_DESIGN_COLOURS: Readonly<Record<string, string>> = {
  '#383c46': '--skeleton-sheen',
  '#dce6f8': '--ticket-chip-ink',
  '#dfe2e8': '--ink-1',
};

/** Values a theme does not change: a size, a radius or a time. */
const THEMELESS_VALUE_PATTERN = /^-?[\d.]+(?:px|ms|s)?$/;

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

const realBlocks = tokenBlocksOf(readFileSync(TOKENS_STYLESHEET_PATH, 'utf8'));

describe('tokens.css', () => {
  test('the scan found the light, dark, reduced-motion and first-paint blocks', () => {
    const darkDeclarationCount = realBlocks.filter((block) => block.selector === DARK_SELECTOR).reduce((count, block) => count + block.values.size, 0);
    expect(darkDeclarationCount).toBeGreaterThan(SMALLEST_DARK_DECLARATION_COUNT);
    expect(valueIn(realBlocks, '', LIGHT_SELECTOR, '--bg')).toBeDefined();
    expect(valueIn(realBlocks, REDUCED_MOTION_CONDITION, LIGHT_SELECTOR, '--motion-fast')).toBe('0ms');
    expect(valueIn(realBlocks, '', BEFORE_FIRST_PAINT_SELECTOR, '--motion-fast')).toBe('0ms');
  });

  test('every pipeline token has a value in the light and the dark theme', () => {
    expect(themeSentencesOf(realBlocks, PIPELINE_TOKENS)).toEqual([]);
  });

  test('reduced motion and the first paint zero every new motion token', () => {
    expect(zeroSentencesOf(realBlocks, MOTION_TOKENS_ZEROED)).toEqual([]);
  });

  test('reduced motion keeps the toast\'s reading time', () => {
    expect(valueIn(realBlocks, '', LIGHT_SELECTOR, READING_TIME_TOKEN)).toBe('5s');
    expect(valueIn(realBlocks, REDUCED_MOTION_CONDITION, LIGHT_SELECTOR, READING_TIME_TOKEN)).toBeUndefined();
  });

  test('each design colour with no name of its own reads a named token in both themes', () => {
    expect(themeSentencesOf(realBlocks, Object.values(UNTOKENISED_DESIGN_COLOURS))).toEqual([]);
  });
});

describe('the guard, planted in memory', () => {
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

  test('a motion token reduced motion does not zero fails, and a zeroed one passes', () => {
    const planted = tokenBlocksOf(
      `${REDUCED_MOTION_CONDITION} { :root { --planted-zeroed: 0ms; } } ${BEFORE_FIRST_PAINT_SELECTOR} { --planted-zeroed: 0ms; --planted-kept: 0ms; }`,
    );
    expect(zeroSentencesOf(planted, ['--planted-zeroed', '--planted-kept'])).toEqual(['--planted-kept is not 0ms under reduced motion']);
  });
});
