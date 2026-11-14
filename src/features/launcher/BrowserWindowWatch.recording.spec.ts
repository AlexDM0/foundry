/**
 * The real-system spec of the browser window watch, run only by `bun run record browser-window-watch` on a Mac with Chrome or Edge. It
 * opens the browser as the launcher does, on a scratch profile with its debugging pipe and on the splash served from this repository, and
 * records each situation of the window: the splash listed and navigated to a step, which the splash then shows; a navigation the browser
 * refuses while the window stays; the window closed while the browser runs; and the browser ended. The browser opens no debugging port.
 * The browser's own version stamps the recording.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join }                      from 'node:path';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { realProcessRun, type OwnedChild }                   from '../../lib/process-run/ProcessRun.ts';
import { environmentCopy, homeDirectory }                    from '../../services/Environment.ts';
import { recordAnswer, recordSystemVersion, repositoryRoot } from '../../testing/BoundaryRecordings.ts';
import { createScratchDirectory, removeScratchPath }         from '../../testing/ScratchRoot.ts';
import { foundBrowserIn, type FoundBrowser }                 from './BrowserFinder.ts';
import {
  browserWindowWatchOver,
  type BrowserWindowWatch,
  type PageTarget,
  type PageTargetsAnswer,
} from './BrowserWindowWatch.ts';
import { rawDebuggingProtocolOver, type RawDebuggingProtocol } from './testing/RawDebuggingProtocol.ts';
import {
  BROWSER_WINDOW_WATCH_RECORDING_NAME,
  browserWindowCallShapeOf,
  type BrowserWindowCall,
  type BrowserWindowSituation,
} from './testing/RecordedBrowserWindowWatch.ts';
import { LaunchAddressUtil } from './utils/LaunchAddressUtil.ts';

const POLL_MILLISECONDS = 100;
const POLL_TRIES = 150;
const VERSION_TIMEOUT_MILLISECONDS = 10_000;
const EXAMPLE_GAIA_PORT = 4790;
const SPLASH_PATH = '/resources/page/loading.html';
/**
 * Under the run's scratch home the browser finds no keychain of the account and waits on it, and its windows answer no navigation; the
 * browser's own switch for a test keeps its secrets in memory instead. Gaia's launch runs under the account's home and needs no switch.
 */
const SCRATCH_HOME_BROWSER_ARGUMENTS = ['--use-mock-keychain'];
const TOKENS_PATH = '/page/styles/tokens.css';
/** The file a browser writes into its profile when it opens a debugging port. */
const DEBUGGING_PORT_FILE_NAME = 'DevToolsActivePort';
const ADDRESS_THE_BROWSER_REFUSES = 'not an address';

let browser: FoundBrowser;
let profileFolder = '';
let splashServer: Bun.Server<undefined>;
let browserChild: OwnedChild | null = null;
let watch: BrowserWindowWatch;
let rawProtocol: RawDebuggingProtocol;
let splashTarget: PageTarget;

function record(situation: BrowserWindowSituation, call: BrowserWindowCall, answer: unknown): void {
  recordAnswer(BROWSER_WINDOW_WATCH_RECORDING_NAME, browserWindowCallShapeOf(situation, call), answer);
}

/** Polls the real browser until the answer holds or the tries run out; the browser takes its own time to start and to close a window. */
async function untilAnswered<Answer>(ask: () => Promise<Answer>, holds: (answer: Answer) => boolean): Promise<Answer> {
  let answer = await ask();
  for (let i = 0; i < POLL_TRIES && !holds(answer); i++) {
    await Bun.sleep(POLL_MILLISECONDS);
    answer = await ask();
  }
  return answer;
}

beforeAll(async () => {
  const foundBrowser = foundBrowserIn(homeDirectory());
  if (foundBrowser === null) throw new Error('Recording browser-window-watch needs Google Chrome or Microsoft Edge in /Applications.');
  browser       = foundBrowser;
  profileFolder = createScratchDirectory('browser-profile');
  splashServer  = Bun.serve({
    hostname: '127.0.0.1',
    port:     0,
    fetch:    (request) => {
      const { pathname } = new URL(request.url);
      if (pathname === SPLASH_PATH) return new Response(readFileSync(join(repositoryRoot(), SPLASH_PATH), 'utf8'), { headers: { 'content-type': 'text/html' } });
      if (pathname === TOKENS_PATH) return new Response(readFileSync(join(repositoryRoot(), TOKENS_PATH), 'utf8'), { headers: { 'content-type': 'text/css' } });
      return new Response(null, { status: 404 });
    },
  });
  const version = await realProcessRun(environmentCopy).run({
    program: browser.program, programArguments: ['--version'], workingDirectory: profileFolder, timeoutMilliseconds: VERSION_TIMEOUT_MILLISECONDS
  });
  if (version.verdict !== 'finished' || version.exitCode !== 0) throw new Error(`${browser.program} --version answered ${JSON.stringify(version)}`);
  recordSystemVersion(BROWSER_WINDOW_WATCH_RECORDING_NAME, version.standardOutput.trim());
});

afterAll(async () => {
  if (browserChild !== null) {
    browserChild.stop();
    await browserChild.exited;
    browserChild.channel?.close();
  }
  await splashServer.stop(true);
  removeScratchPath(profileFolder);
});

describe('the window of a browser started as the launcher starts it', () => {
  test('is listed as one page target over the pipe, and moves to a step of the splash, which the splash shows', async () => {
    const splashAddress = `http://127.0.0.1:${splashServer.port}${SPLASH_PATH}?address=127.0.0.1:${EXAMPLE_GAIA_PORT}&theme=dark`;
    const browserStart  = realProcessRun(environmentCopy).startOwned({
      program:          browser.program,
      programArguments: [...LaunchAddressUtil.browserArgumentsOf(splashAddress, profileFolder), ...SCRATCH_HOME_BROWSER_ARGUMENTS],
      workingDirectory: profileFolder,
      withChannel:      true,
    });
    if (browserStart.verdict !== 'started' || browserStart.child.channel === null) throw new Error(`The browser start answered ${JSON.stringify(browserStart)}`);
    browserChild = browserStart.child;
    watch        = browserWindowWatchOver(browserStart.child.channel);
    rawProtocol  = rawDebuggingProtocolOver(browserStart.child.channel);

    const targetsAnswer = await untilAnswered(
      () => watch.pageTargets(),
      (answer: PageTargetsAnswer) => answer.verdict === 'listed' && answer.pageTargets.some((pageTarget) => pageTarget.url === splashAddress),
    );
    if (targetsAnswer.verdict !== 'listed') throw new Error('The browser listed no window.');
    expect(targetsAnswer.pageTargets.map((pageTarget) => pageTarget.url)).toEqual([splashAddress]);
    [splashTarget] = targetsAnswer.pageTargets as [PageTarget];
    record('window-open', 'page targets', targetsAnswer);
    expect(readdirSync(profileFolder)).not.toContain(DEBUGGING_PORT_FILE_NAME);

    const navigation = await watch.navigate(splashTarget, LaunchAddressUtil.splashStepAddressOf(splashAddress, 'looking', { forgesRegistered: 5, forgesAnswered: 3 }));
    expect(navigation).toEqual({ verdict: 'navigated' });
    record('window-open', 'navigate', navigation);
    const evaluated = (expression: string): Promise<unknown> => rawProtocol.evaluatedIn(splashTarget.targetId, expression);
    expect(await untilAnswered(() => evaluated('document.getElementById("forges-fact").textContent'), (shown) => shown === '3 of 5 answered')).toBe('3 of 5 answered');
    expect(await evaluated('[...document.querySelectorAll(".splash-step")].map((step) => step.dataset.step).join()')).toBe('done,now,next');
    expect(await evaluated('document.getElementById("server-fact").textContent')).toBe(`127.0.0.1:${EXAMPLE_GAIA_PORT}`);
    expect(await evaluated('document.getElementById("server-label").textContent')).toBe('Gaia\'s server is up');
    expect(await evaluated('document.documentElement.dataset.theme')).toBe('dark');
  });

  test('refuses a navigation to an address it cannot open, and still lists the window', async () => {
    const navigation = await watch.navigate(splashTarget, ADDRESS_THE_BROWSER_REFUSES);
    expect(navigation.verdict).toBe('refused');
    record('navigation-refused', 'navigate', navigation);
    const targetsAnswer = await watch.pageTargets();
    expect(targetsAnswer).toEqual({ verdict: 'listed', pageTargets: [expect.objectContaining({ targetId: splashTarget.targetId })] });
    record('navigation-refused', 'page targets', targetsAnswer);
  });

  test('lists no page target once the window is closed, while the browser still runs', async () => {
    await rawProtocol.closeWindow(splashTarget.targetId);
    const targetsAnswer = await untilAnswered(() => watch.pageTargets(), (answer) => answer.verdict === 'listed' && answer.pageTargets.length === 0);
    expect(targetsAnswer).toEqual({ verdict: 'listed', pageTargets: [] });
    record('window-closed', 'page targets', targetsAnswer);
    const navigation = await watch.navigate(splashTarget, `http://127.0.0.1:${EXAMPLE_GAIA_PORT}/`);
    expect(navigation.verdict).not.toBe('navigated');
    record('window-closed', 'navigate', navigation);
  });

  test('answers nothing over the pipe once the browser has ended', async () => {
    browserChild?.stop();
    await browserChild?.exited;
    await browserChild?.channel?.closed;
    browserChild = null;
    const targetsAnswer = await watch.pageTargets();
    expect(targetsAnswer).toEqual({ verdict: 'unreachable' });
    record('browser-ended', 'page targets', targetsAnswer);
    const navigation = await watch.navigate(splashTarget, `http://127.0.0.1:${EXAMPLE_GAIA_PORT}/`);
    expect(navigation).toEqual({ verdict: 'unreachable' });
    record('browser-ended', 'navigate', navigation);
  });
});
