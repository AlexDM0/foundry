/**
 * The real-system spec of the browser window watch, run only by `bun run record browser-window-watch` on a Mac with Chrome or Edge. It
 * opens the browser as the launcher does, on a scratch profile and on the splash served from this repository, and records each situation
 * of the window: the profile before the browser names its port, the splash listed and navigated to a step, which the splash then shows,
 * the window closed while the browser runs, and the browser ended. The browser's own version stamps the recording.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';
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
  realBrowserWindowWatch,
  type DebuggingPortAnswer,
  type PageTarget,
  type PageTargetsAnswer,
} from './BrowserWindowWatch.ts';
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

const watch = realBrowserWindowWatch();
let browser: FoundBrowser;
let profileFolder = '';
let splashServer: Bun.Server<undefined>;
let browserChild: OwnedChild | null = null;
let debuggingPort = 0;
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

/** Reads a value of the splash's document over the target's own socket: the recording's check that the splash shows its step. */
function evaluatedInPage(pageTarget: PageTarget, expression: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(pageTarget.debuggerAddress);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { readonly id?: number; readonly result?: { readonly result?: { readonly value?: unknown } } };
      if (message.id !== 1) return;
      socket.close();
      resolve(message.result?.result?.value);
    });
    socket.addEventListener('error', () => reject(new Error('The page target\'s socket failed.')));
  });
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
  }
  await splashServer.stop(true);
  removeScratchPath(profileFolder);
});

describe('the window of a browser started as the launcher starts it', () => {
  test('is named by no port before the browser writes one into the profile', async () => {
    const answer = await watch.debuggingPortIn(profileFolder);
    expect(answer).toEqual({ verdict: 'not-written' });
    record('browser-starting', 'debugging port', answer);
  });

  test('is listed as one page target on the port the browser writes, and moves to a step of the splash, which the splash shows', async () => {
    const splashAddress = `http://127.0.0.1:${splashServer.port}${SPLASH_PATH}?address=127.0.0.1:${EXAMPLE_GAIA_PORT}&theme=dark`;
    const browserStart  = realProcessRun(environmentCopy).startOwned({
      program:          browser.program,
      programArguments: [...LaunchAddressUtil.browserArgumentsOf(splashAddress, profileFolder), ...SCRATCH_HOME_BROWSER_ARGUMENTS],
      workingDirectory: profileFolder,
    });
    if (browserStart.verdict !== 'started') throw new Error(`The browser start answered ${JSON.stringify(browserStart)}`);
    browserChild = browserStart.child;

    const portAnswer = await untilAnswered(() => watch.debuggingPortIn(profileFolder), (answer: DebuggingPortAnswer) => answer.verdict === 'written');
    if (portAnswer.verdict !== 'written') throw new Error('The browser wrote no debugging port into its profile.');
    ({ debuggingPort } = portAnswer);
    record('window-open', 'debugging port', portAnswer);

    const targetsAnswer = await untilAnswered(
      () => watch.pageTargetsAt(debuggingPort),
      (answer: PageTargetsAnswer) => answer.verdict === 'listed' && answer.pageTargets.some((pageTarget) => pageTarget.url === splashAddress),
    );
    if (targetsAnswer.verdict !== 'listed') throw new Error('The browser listed no window.');
    expect(targetsAnswer.pageTargets.map((pageTarget) => pageTarget.url)).toEqual([splashAddress]);
    [splashTarget] = targetsAnswer.pageTargets as [PageTarget];
    record('window-open', 'page targets', targetsAnswer);

    const navigation = await watch.navigate(splashTarget, LaunchAddressUtil.splashStepAddressOf(splashAddress, 'looking', { forgesRegistered: 5, forgesAnswered: 3 }));
    expect(navigation).toEqual({ verdict: 'navigated' });
    record('window-open', 'navigate', navigation);
    expect(await untilAnswered(
      () => evaluatedInPage(splashTarget, 'document.getElementById("forges-fact").textContent'),
      (shown) => shown === '3 of 5 answered',
    )).toBe('3 of 5 answered');
    expect(await evaluatedInPage(splashTarget, '[...document.querySelectorAll(".splash-step")].map((step) => step.dataset.step).join()')).toBe('done,now,next');
    expect(await evaluatedInPage(splashTarget, 'document.getElementById("server-fact").textContent')).toBe(`127.0.0.1:${EXAMPLE_GAIA_PORT}`);
    expect(await evaluatedInPage(splashTarget, 'document.getElementById("server-label").textContent')).toBe('Gaia\'s server is up');
    expect(await evaluatedInPage(splashTarget, 'document.documentElement.dataset.theme')).toBe('dark');
  });

  test('lists no page target once the window is closed, while the browser still runs', async () => {
    await fetch(`http://127.0.0.1:${debuggingPort}/json/close/${splashTarget.targetId}`);
    const targetsAnswer = await untilAnswered(() => watch.pageTargetsAt(debuggingPort), (answer) => answer.verdict === 'listed' && answer.pageTargets.length === 0);
    expect(targetsAnswer).toEqual({ verdict: 'listed', pageTargets: [] });
    record('window-closed', 'page targets', targetsAnswer);
    const portAnswer = await watch.debuggingPortIn(profileFolder);
    expect(portAnswer).toEqual({ verdict: 'written', debuggingPort });
    record('window-closed', 'debugging port', portAnswer);
    const navigation = await watch.navigate(splashTarget, `http://127.0.0.1:${EXAMPLE_GAIA_PORT}/`);
    expect(navigation.verdict).not.toBe('navigated');
    record('window-closed', 'navigate', navigation);
  });

  test('answers nothing on its port once the browser has ended', async () => {
    browserChild?.stop();
    await browserChild?.exited;
    browserChild = null;
    const targetsAnswer = await watch.pageTargetsAt(debuggingPort);
    expect(targetsAnswer).toEqual({ verdict: 'unreachable' });
    record('browser-ended', 'page targets', targetsAnswer);
    const navigation = await watch.navigate(splashTarget, `http://127.0.0.1:${EXAMPLE_GAIA_PORT}/`);
    expect(navigation).toEqual({ verdict: 'unreachable' });
    record('browser-ended', 'navigate', navigation);
    record('browser-ended', 'debugging port', await watch.debuggingPortIn(profileFolder));
  });
});
