/**
 * The spacing scale is one list. What matters: each step of `SPACING` is the `--space-<size>` custom property of `styles/tokens.css`, which
 * exists; each `--space-…` token is a step, so the stylesheets hold no space the props cannot reach; each token's value is the size its
 * name says, in pixels; and each short name `--sp-…` is an alias of a `--space-…` token, never a value of its own. The scan first proves it
 * read the tokens, and each form is planted in memory.
 */
import { describe, expect, test } from 'bun:test';

import { packageFilesMatching } from '../testing/PackageFiles.ts';
import { SPACING }              from './Spacing.ts';

const TOKENS_STYLESHEET_PATH = 'styles/tokens.css';
const SMALLEST_SPACE_TOKEN_COUNT = 10;

/** The value of each custom property whose name starts with `prefix`, in the order the stylesheet declares them. */
function customPropertiesOf(stylesheet: string, prefix: string): ReadonlyMap<string, string> {
  const declarations = [...stylesheet.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)];
  return new Map(declarations.filter(([, name = '']) => name.startsWith(prefix)).map(([, name = '', value = '']) => [name, value.trim()]));
}

function scaleSentencesOf(stylesheet: string, steps: Readonly<Record<string, string>>): string[] {
  const spaceTokens = customPropertiesOf(stylesheet, '--space-');
  const sentences: string[] = [];
  const referencedTokens = new Set<string>();
  for (const [step, value] of Object.entries(steps)) {
    const token = /^var\((--space-\d+)\)$/.exec(value)?.[1];
    if (token === undefined) sentences.push(`the step ${step} is ${value}, not a var() of a --space- token`);
    else if (!spaceTokens.has(token)) sentences.push(`the step ${step} names ${token}, which ${TOKENS_STYLESHEET_PATH} does not declare`);
    else referencedTokens.add(token);
  }
  for (const [token, value] of spaceTokens) {
    if (!referencedTokens.has(token)) sentences.push(`${token} is no step of SPACING: add the step or remove the token`);
    if (value !== `${token.slice('--space-'.length)}px`) sentences.push(`${token} is ${value}, not the size its name says`);
  }
  for (const [token, value] of customPropertiesOf(stylesheet, '--sp-')) {
    if (!/^var\(--space-\d+\)$/.test(value)) sentences.push(`${token} is ${value}, not an alias of a --space- token`);
  }
  return sentences;
}

const [tokensStylesheet] = packageFilesMatching(TOKENS_STYLESHEET_PATH);

describe('the spacing scale', () => {
  test('the scan reads the tokens', () => {
    expect(tokensStylesheet?.path).toBe(TOKENS_STYLESHEET_PATH);
    expect(customPropertiesOf(tokensStylesheet?.text ?? '', '--space-').size).toBeGreaterThanOrEqual(SMALLEST_SPACE_TOKEN_COUNT);
  });

  test('each step of SPACING is a token of the stylesheet, and each token a step', () => {
    expect(scaleSentencesOf(tokensStylesheet?.text ?? '', SPACING)).toEqual([]);
  });

  test('a step that is no token, a token that is no step, a size its name does not say, and a short name with a value of its own', () => {
    const planted = ':root { --space-4: 4px; --space-6: 5px; --space-9: 9px; --sp-1: var(--space-4); --sp-2: 8px; }';
    expect(scaleSentencesOf(planted, {
      four: 'var(--space-4)', six: 'var(--space-6)', eight: 'var(--space-8)', ten: '10px'
    })).toEqual([
      'the step eight names --space-8, which styles/tokens.css does not declare',
      'the step ten is 10px, not a var() of a --space- token',
      '--space-6 is 5px, not the size its name says',
      '--space-9 is no step of SPACING: add the step or remove the token',
      '--sp-2 is 8px, not an alias of a --space- token',
    ]);
  });
});
