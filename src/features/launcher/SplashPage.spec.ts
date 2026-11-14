/**
 * The splash the launcher opens (artboard C3), read as the file it is: it paints with the page's tokens only, the design-system package's
 * and Gaia's, and reads no token that both lack; it says what SCREENS C3 says and tells User to run nothing; and it knows every step and
 * fragment key the launcher moves it with. Its own script runs against a stand-in document at each step the launcher moves it to, since
 * specs have no document; the browser window watch's recording shows it in a real browser at a step.
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
const STYLESHEET_LINK = /<link rel="stylesheet" href="([^"]+)">/g;

function splashText(): string {
  return readFileSync(SPLASH_PATH, 'utf8');
}

function linkedStylesheetsOf(html: string): string[] {
  return [...html.matchAll(STYLESHEET_LINK)].map((link) => link[1] ?? '');
}

function styleOf(html: string): string {
  return /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
}

function scriptOf(html: string): string {
  return /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
}

interface SplashElement {
  readonly dataset: Record<string, string>;
  textContent:      string;
}

interface RenderedSplash {
  readonly stepStates:  string;
  readonly serverLabel: string;
  readonly serverFact:  string;
  readonly forgesFact:  string;
  readonly theme:       string | undefined;
}

const SPLASH_ELEMENT_IDS = ['server-step', 'forges-step', 'opening-step', 'server-label', 'server-fact', 'forges-fact'] as const;

function labelAttributeOf(html: string, attributeName: string): string {
  return new RegExp(`${attributeName}="([^"]+)"`).exec(html)?.[1] ?? '';
}

/** Runs the splash's script at an address, with the system's colour scheme, against a stand-in of the elements it writes. */
function renderedSplashAt(address: string, systemPrefersDark = false): RenderedSplash {
  const html = splashText();
  const elements = new Map<string, SplashElement>(SPLASH_ELEMENT_IDS.map((elementId) => [elementId, { dataset: {}, textContent: '' }]));
  const serverLabel = elements.get('server-label');
  if (serverLabel !== undefined) {
    serverLabel.dataset['labelNow']  = labelAttributeOf(html, 'data-label-now');
    serverLabel.dataset['labelDone'] = labelAttributeOf(html, 'data-label-done');
  }
  const rootDataset: Record<string, string> = {};
  const standInDocument = { documentElement: { dataset: rootDataset }, getElementById: (elementId: string) => elements.get(elementId) };
  const { search, hash } = new URL(address);
  const runSplashScript = new Function('document', 'location', 'addEventListener', 'matchMedia', scriptOf(html));
  runSplashScript(standInDocument, { search, hash }, () => undefined, () => ({ matches: systemPrefersDark }));
  const textOf = (elementId: typeof SPLASH_ELEMENT_IDS[number]): string => elements.get(elementId)?.textContent ?? '';
  const stepOf = (elementId: typeof SPLASH_ELEMENT_IDS[number]): string => elements.get(elementId)?.dataset['step'] ?? '';
  return {
    stepStates:  [stepOf('server-step'), stepOf('forges-step'), stepOf('opening-step')].join(),
    serverLabel: textOf('server-label'),
    serverFact:  textOf('server-fact'),
    forgesFact:  textOf('forges-fact'),
    theme:       rootDataset['theme'],
  };
}

describe('the splash', () => {
  test('links the package\'s tokens and then Gaia\'s, by paths that reach them from the splash\'s folder', () => {
    const linked = linkedStylesheetsOf(splashText());
    expect(linked).toEqual(['../../node_modules/design-system/styles/tokens.css', '../../page/styles/tokens.css']);
    for (const stylesheet of linked) expect(existsSync(join(dirname(SPLASH_PATH), stylesheet))).toBe(true);
  });

  test('holds no colour value and reads only tokens that the linked tokens define', () => {
    const style = styleOf(splashText());
    const tokensText = linkedStylesheetsOf(splashText()).map((stylesheet) => readFileSync(join(dirname(SPLASH_PATH), stylesheet), 'utf8')).join('\n');
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

describe('the splash at each step the launcher moves it to', () => {
  const splashAddress = LaunchAddressUtil.splashAddressOf('/Users/example/gaia/resources/page/loading.html', 4790, 'dark');

  test('shows the server starting, with no address and no counts, before the launcher moves it on', () => {
    expect(renderedSplashAt(splashAddress)).toEqual({
      stepStates:  'now,next,next',
      serverLabel: 'Starting Gaia\'s server',
      serverFact:  '',
      forgesFact:  '',
      theme:       'dark',
    });
  });

  test('shows the server up at its address while it looks for forges, with the counts Gaia reported', () => {
    const lookingAddress = LaunchAddressUtil.splashStepAddressOf(splashAddress, 'looking', { forgesRegistered: 5, forgesAnswered: 3 });
    expect(renderedSplashAt(lookingAddress)).toEqual({
      stepStates:  'done,now,next',
      serverLabel: 'Gaia\'s server is up',
      serverFact:  '127.0.0.1:4790',
      forgesFact:  '3 of 5 answered',
      theme:       'dark',
    });
  });

  test('shows no count while it looks for forges when Gaia reported none', () => {
    expect(renderedSplashAt(LaunchAddressUtil.splashStepAddressOf(splashAddress, 'looking', null)).forgesFact).toBe('');
  });

  test('shows Attention opening once both steps before it are done', () => {
    const openingSplash = renderedSplashAt(LaunchAddressUtil.splashStepAddressOf(splashAddress, 'opening', null));
    expect([openingSplash.stepStates, openingSplash.serverLabel, openingSplash.serverFact]).toEqual(['done,done,now', 'Gaia\'s server is up', '127.0.0.1:4790']);
  });

  test('paints dark for the dark choice and for auto on a dark system, and light otherwise', () => {
    const lightAddress = LaunchAddressUtil.splashAddressOf('/Users/example/gaia/resources/page/loading.html', 4790, 'light');
    const autoAddress  = LaunchAddressUtil.splashAddressOf('/Users/example/gaia/resources/page/loading.html', 4790, 'auto');
    expect([
      renderedSplashAt(lightAddress, true).theme,
      renderedSplashAt(autoAddress, true).theme,
      renderedSplashAt(autoAddress, false).theme,
    ]).toEqual([undefined, 'dark', undefined]);
  });
});
