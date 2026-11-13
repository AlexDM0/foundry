/**
 * The splash the launcher opens (artboard C3), read as the file it is: it paints with the page's tokens only and reads no token that
 * `tokens.css` lacks, it says what SCREENS C3 says and tells User to run nothing, and it knows every step and fragment key the launcher
 * moves it with. The browser window watch's recording shows it in a real browser at a step.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';
import { describe, expect, test }   from 'bun:test';

import { repositoryRoot }    from '../../testing/BoundaryRecordings.ts';
import { LaunchAddressUtil } from './utils/LaunchAddressUtil.ts';

const SPLASH_PATH = join(repositoryRoot(), 'resources', 'page', 'loading.html');
const COLOUR_VALUE = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/i;
const TOKEN_READ = /var\((--[\w-]+)\)/g;
const TOKEN_DEFINITION = /(--[\w-]+)\s*:/g;
const STYLESHEET_LINK = /<link rel="stylesheet" href="([^"]+)">/;

function splashText(): string {
  return readFileSync(SPLASH_PATH, 'utf8');
}

function styleOf(html: string): string {
  return /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
}

function scriptOf(html: string): string {
  return /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
}

describe('the splash', () => {
  test('links the page\'s tokens by a path that reaches them from the splash\'s folder', () => {
    const linked = STYLESHEET_LINK.exec(splashText())?.[1] ?? '';
    expect(linked).toBe('../../page/styles/tokens.css');
    expect(existsSync(join(dirname(SPLASH_PATH), linked))).toBe(true);
  });

  test('holds no colour value and reads only tokens that tokens.css defines', () => {
    const style = styleOf(splashText());
    const tokensText = readFileSync(join(repositoryRoot(), 'page', 'styles', 'tokens.css'), 'utf8');
    const definedTokens = new Set([...tokensText.matchAll(TOKEN_DEFINITION)].map((match) => match[1]));
    const readTokens = [...style.matchAll(TOKEN_READ)].map((match) => match[1]);
    expect(style).not.toMatch(COLOUR_VALUE);
    expect(readTokens.length).toBeGreaterThan(0);
    expect(readTokens.filter((token) => !definedTokens.has(token))).toEqual([]);
  });

  test('names the three steps and the closing line of SCREENS C3, and tells User to run nothing', () => {
    const html = splashText();
    for (const sentence of ['Gaia\'s server is up', 'Looking for forges', 'Opening Attention', 'Closing this window stops Gaia. The forges keep running.']) {
      expect(html).toContain(sentence);
    }
    expect(html.replace(/<script>[\s\S]*?<\/script>/, '')).not.toMatch(/\b(?:run|terminal|command)\b/i);
  });

  test('knows every step the launcher moves it to, and every key of the fragment it moves it with', () => {
    const script = scriptOf(splashText());
    expect(script).toContain('const SPLASH_STEPS = [\'starting\', \'looking\', \'opening\'];');
    const splashAddress = LaunchAddressUtil.splashAddressOf('/Users/example/gaia/resources/page/loading.html', 4790, 'dark');
    const stepAddress   = new URL(LaunchAddressUtil.splashStepAddressOf(splashAddress, 'looking', { forgesRegistered: 5, forgesAnswered: 3 }));
    for (const key of new URLSearchParams(stepAddress.hash.slice(1)).keys()) expect(script).toContain(`fragment.get('${key}')`);
    for (const key of new URLSearchParams(stepAddress.search).keys()) expect(script).toContain(`.get('${key}')`);
  });
});
