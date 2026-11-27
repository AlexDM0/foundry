/**
 * The launch as a flow over the programs and window recorded from a real Mac, with timers fired by hand: it starts what is missing, opens the page
 * with a fresh code kept out of the browser's arguments, stops only what it started once no window of Gaia's is left, and refuses in a dialog what
 * it cannot do, starting nothing.
 */
import { pathToFileURL } from 'node:url';
import {
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { AppBundleInfoReading }                                                from '../../adapters/app-bundle/AppBundleInfoFile.ts';
import type { GaiaServerClient, HealthReading }                                     from '../../adapters/gaia-server/GaiaServerClient.ts';
import type { ForgeCounts }                                                         from '../../adapters/gaia-server/HealthDocument.ts';
import { homeDirectory }                                                            from '../../services/Environment.ts';
import { GAIA_INSTALL_VERSION }                                                     from '../../shared/constants/InstallVersion.ts';
import { manualTimers, type ManualTimers }                                          from '../../testing/ManualTimers.ts';
import { detachedStartCallShapeOf, ownedStartCallShapeOf, type RecordedProcessRun } from '../../testing/RecordedRuns.ts';
import type { FoundBrowser }                                                        from './BrowserFinder.ts';
import {
  createLauncher,
  launchMessageOf,
  type LaunchVerdict,
  type LaunchWaits,
} from './Launcher.ts';
import { recordedBrowserWindowWatch, type BrowserWindowSituation, type RecordedBrowserWindowWatch } from './testing/RecordedBrowserWindowWatch.ts';
import {
  EXAMPLE_BROWSER,
  EXAMPLE_BUN_PROGRAM,
  EXAMPLE_MAIN_PATH,
  EXAMPLE_PORT,
  EXAMPLE_PROFILE_FOLDER,
  EXAMPLE_SESSION_CODE,
  EXAMPLE_SPLASH_PAGE_PATH,
  EXAMPLE_THEME,
  recordedLauncherProgramsOf,
  type LaunchSituation,
} from './testing/RecordedLauncherPrograms.ts';
import { LaunchAddressUtil } from './utils/LaunchAddressUtil.ts';

const EXAMPLE_TOKEN = 'example-token-0123456789abcdef';

/** Each wait its own delay, so a spec fires exactly the timer it means. */
const WAITS: LaunchWaits = {
  pollIntervalMilliseconds:        5,
  windowAppearTries:               3,
  serverStartTries:                4,
  forgeLookTries:                  3,
  windowWatchIntervalMilliseconds: 7,
  windowGonePolls:                 3,
  childExitWaitMilliseconds:       11,
};

const SERVER_SHAPE = ownedStartCallShapeOf(EXAMPLE_BUN_PROGRAM, [EXAMPLE_MAIN_PATH, 'serve']);
const SPLASH_ADDRESS = `${pathToFileURL(EXAMPLE_SPLASH_PAGE_PATH).href}?address=127.0.0.1%3A${EXAMPLE_PORT}&theme=${EXAMPLE_THEME}`;
const PAGE_ADDRESS = `http://127.0.0.1:${EXAMPLE_PORT}/#session=${EXAMPLE_SESSION_CODE}`;
const SPLASH_BROWSER_SHAPE = ownedStartCallShapeOf(EXAMPLE_BROWSER.program, LaunchAddressUtil.browserArgumentsOf(SPLASH_ADDRESS, EXAMPLE_PROFILE_FOLDER));
const OPENING_SPLASH_ADDRESS = LaunchAddressUtil.splashStepAddressOf(SPLASH_ADDRESS, 'opening', null);
const BESIDE_BROWSER_SHAPE = ownedStartCallShapeOf(EXAMPLE_BROWSER.program, LaunchAddressUtil.browserArgumentsOf(OPENING_SPLASH_ADDRESS, EXAMPLE_PROFILE_FOLDER));

interface LaunchInFlight {
  readonly verdict:       Promise<LaunchVerdict>;
  readonly processRun:    RecordedProcessRun;
  readonly window:        RecordedBrowserWindowWatch;
  readonly timers:        ManualTimers;
  readonly setHealth:     (healthReading: HealthReading) => void;
  readonly healthAsked:   () => number;
  readonly codesAsked:    () => readonly string[];
  readonly requestStop:   () => void;
  readonly browserLooked: () => number;
}

let token: string | null = EXAMPLE_TOKEN;

beforeEach(() => {
  token = EXAMPLE_TOKEN;
});

function gaiaAnswering(forgeCounts: ForgeCounts | null): HealthReading {
  return { verdict: 'gaia-answers', forgeCounts };
}

function launchIn(
  situation: LaunchSituation,
  firstHealth: HealthReading,
  firstWindow: BrowserWindowSituation,
  browser: FoundBrowser | null = EXAMPLE_BROWSER,
  appBundleInfo: AppBundleInfoReading | null = null,
): LaunchInFlight {
  const processRun = recordedLauncherProgramsOf(situation);
  const window     = recordedBrowserWindowWatch(firstWindow);
  const timers     = manualTimers();
  let health       = firstHealth;
  let healthAsked  = 0;
  let browserLooked = 0;
  const codesAsked: string[] = [];
  let requestStop: () => void = () => undefined;
  const gaiaServer: GaiaServerClient = {
    healthReadingFor: async (port) => {
      expect(port).toBe(EXAMPLE_PORT);
      healthAsked += 1;
      return health;
    },
    sessionCodeFor: async (port, bearerToken) => {
      expect(port).toBe(EXAMPLE_PORT);
      codesAsked.push(bearerToken);
      return { verdict: 'issued', code: EXAMPLE_SESSION_CODE };
    },
  };
  const verdict = createLauncher({
    port:                 EXAMPLE_PORT,
    appBundleInfo,
    serverProgram:        { program: EXAMPLE_BUN_PROGRAM, programArguments: [EXAMPLE_MAIN_PATH, 'serve'], workingDirectory: homeDirectory() },
    browserProfileFolder: EXAMPLE_PROFILE_FOLDER,
    splashPagePath:       EXAMPLE_SPLASH_PAGE_PATH,
    theme:                EXAMPLE_THEME,
    workingDirectory:     homeDirectory(),
    findBrowser:          () => {
      browserLooked += 1;
      return browser;
    },
    processRun,
    browserWindowWatchOver: window.watchOver,
    gaiaServer,
    readServerToken:        () => Promise.resolve(token),
    timers,
    untilStopRequested:     new Promise<void>((resolve) => {
      requestStop = resolve;
    }),
    waits: WAITS,
  }).launch();
  return {
    verdict,
    processRun,
    window,
    timers,
    setHealth: (healthReading) => {
      health = healthReading;
    },
    healthAsked:   () => healthAsked,
    codesAsked:    () => [...codesAsked],
    requestStop:   () => requestStop(),
    browserLooked: () => browserLooked,
  };
}

/**
 * Fires the next timer of this delay once the flow has started it, after the change the flow meets next: the flow has made every call of
 * its last step by the time it waits again, so the change reaches the next step only.
 */
async function afterTheNextWait(launch: LaunchInFlight, delayMilliseconds: number, change: () => void = () => undefined): Promise<void> {
  await launch.timers.untilPending(delayMilliseconds);
  change();
  launch.timers.fire(delayMilliseconds);
}

async function untilTheWindowCloses(launch: LaunchInFlight): Promise<void> {
  await afterTheNextWait(launch, WAITS.windowWatchIntervalMilliseconds);
  await afterTheNextWait(launch, WAITS.windowWatchIntervalMilliseconds, () => launch.window.enterSituation('window-closed'));
  for (let i = 1; i < WAITS.windowGonePolls; i++) await afterTheNextWait(launch, WAITS.windowWatchIntervalMilliseconds);
}

function dialogShapeOf(verdict: Exclude<LaunchVerdict, { readonly verdict: 'closed' }>): string {
  const dialogRun = LaunchAddressUtil.dialogRunOf(launchMessageOf(verdict, EXAMPLE_PORT));
  return detachedStartCallShapeOf(dialogRun.program, dialogRun.programArguments);
}

function splashAt(step: 'looking' | 'opening', forgeCounts: ForgeCounts | null): string {
  return LaunchAddressUtil.splashStepAddressOf(SPLASH_ADDRESS, step, forgeCounts);
}

describe('a launch with nothing on the port', () => {
  test('starts the server and the splash at once, moves the splash on, opens the page, and stops both when the window closes', async () => {
    const launch = launchIn('server-down', { verdict: 'nothing-answers' }, 'window-closed');
    await launch.timers.untilPending(WAITS.pollIntervalMilliseconds);
    expect(launch.processRun.ownedChildrenRunning()).toEqual([SERVER_SHAPE, SPLASH_BROWSER_SHAPE]);

    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds, () => launch.window.enterSituation('window-open'));
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds, () => launch.setHealth(gaiaAnswering({ forgesRegistered: 5, forgesAnswered: 3 })));
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds, () => launch.setHealth(gaiaAnswering({ forgesRegistered: 5, forgesAnswered: 5 })));

    await launch.timers.untilPending(WAITS.windowWatchIntervalMilliseconds);
    expect(launch.window.navigations()).toEqual([
      splashAt('looking', { forgesRegistered: 5, forgesAnswered: 3 }),
      splashAt('looking', { forgesRegistered: 5, forgesAnswered: 5 }),
      splashAt('opening', null),
      PAGE_ADDRESS,
    ]);
    expect(launch.codesAsked()).toEqual([EXAMPLE_TOKEN]);
    expect(launch.processRun.ownedChildrenStopped()).toEqual([]);

    await untilTheWindowCloses(launch);
    expect(await launch.verdict).toEqual({ verdict: 'closed', serverWasStarted: true });
    expect(launch.processRun.ownedChildrenStopped()).toEqual([SPLASH_BROWSER_SHAPE, SERVER_SHAPE]);
    expect(launch.processRun.ownedChildrenRunning()).toEqual([]);
    expect(launch.timers.pendingDelays()).toEqual([]);
  });

  test('keeps following a window that is still listed, and closes only after the gone polls in a row', async () => {
    const launch = launchIn('server-down', { verdict: 'nothing-answers' }, 'window-open');
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds, () => launch.setHealth(gaiaAnswering({ forgesRegistered: 1, forgesAnswered: 1 })));
    await afterTheNextWait(launch, WAITS.windowWatchIntervalMilliseconds, () => launch.window.enterSituation('window-closed'));
    await afterTheNextWait(launch, WAITS.windowWatchIntervalMilliseconds, () => launch.window.enterSituation('window-open'));
    for (let i = 0; i < WAITS.windowGonePolls; i++) {
      await afterTheNextWait(launch, WAITS.windowWatchIntervalMilliseconds, () => launch.window.enterSituation('browser-ended'));
    }
    expect(await launch.verdict).toEqual({ verdict: 'closed', serverWasStarted: true });
    // The first two listings are the window found and the server's first wait; the rest follow the open page.
    const pageTargetCalls = launch.window.callsAnswered().filter((call) => call.endsWith('page targets')).slice(2);
    expect(pageTargetCalls).toEqual([
      'window-closed: page targets',
      'window-open: page targets',
      'browser-ended: page targets',
      'browser-ended: page targets',
      'browser-ended: page targets',
    ]);
  });

  test('stops both when Gaia\'s window closes while the browser still lists another window on Gaia\'s profile', async () => {
    const launch = launchIn('server-down', { verdict: 'nothing-answers' }, 'window-open');
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds, () => launch.setHealth(gaiaAnswering({ forgesRegistered: 1, forgesAnswered: 1 })));
    await afterTheNextWait(launch, WAITS.windowWatchIntervalMilliseconds);
    for (let i = 0; i < WAITS.windowGonePolls; i++) {
      await afterTheNextWait(launch, WAITS.windowWatchIntervalMilliseconds, () => launch.window.enterSituation('other-window-left'));
    }
    expect(await launch.verdict).toEqual({ verdict: 'closed', serverWasStarted: true });
    expect(launch.window.callsAnswered().slice(-WAITS.windowGonePolls)).toEqual(Array.from({ length: WAITS.windowGonePolls }, () => 'other-window-left: page targets'));
    expect(launch.processRun.ownedChildrenStopped()).toEqual([SPLASH_BROWSER_SHAPE, SERVER_SHAPE]);
    expect(launch.processRun.ownedChildrenRunning()).toEqual([]);
  });

  test('stops both quietly, with no dialog, when User closes the splash while another window on Gaia\'s profile stays', async () => {
    const launch = launchIn('server-down', { verdict: 'nothing-answers' }, 'window-open');
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds, () => {
      launch.setHealth(gaiaAnswering({ forgesRegistered: 0, forgesAnswered: 0 }));
      launch.window.enterSituation('other-window-left');
    });
    expect(await launch.verdict).toEqual({ verdict: 'closed', serverWasStarted: true });
    expect(launch.processRun.callShapesAnswered()).toEqual([SERVER_SHAPE, SPLASH_BROWSER_SHAPE]);
    expect(launch.processRun.ownedChildrenStopped()).toEqual([SPLASH_BROWSER_SHAPE, SERVER_SHAPE]);
  });

  test('opens Attention without waiting on forges when every registered forge has answered', async () => {
    const launch = launchIn('server-down', { verdict: 'nothing-answers' }, 'window-open');
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds, () => launch.setHealth(gaiaAnswering({ forgesRegistered: 0, forgesAnswered: 0 })));
    await launch.timers.untilPending(WAITS.windowWatchIntervalMilliseconds);
    expect(launch.window.navigations()).toEqual([splashAt('looking', { forgesRegistered: 0, forgesAnswered: 0 }), splashAt('opening', null), PAGE_ADDRESS]);
    launch.requestStop();
    expect(await launch.verdict).toEqual({ verdict: 'closed', serverWasStarted: true });
  });

  test('opens Attention with the forges that answered once the tries for the rest run out', async () => {
    const launch = launchIn('server-down', { verdict: 'nothing-answers' }, 'window-open');
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds, () => launch.setHealth(gaiaAnswering({ forgesRegistered: 5, forgesAnswered: 2 })));
    for (let i = 0; i < WAITS.forgeLookTries; i++) await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    await launch.timers.untilPending(WAITS.windowWatchIntervalMilliseconds);
    expect(launch.window.navigations()).toEqual([splashAt('looking', { forgesRegistered: 5, forgesAnswered: 2 }), splashAt('opening', null), PAGE_ADDRESS]);
    launch.requestStop();
    expect(await launch.verdict).toEqual({ verdict: 'closed', serverWasStarted: true });
    expect(launch.processRun.ownedChildrenRunning()).toEqual([]);
  });

  test('stops the browser and the server when it is asked to end while the window is open', async () => {
    const launch = launchIn('server-down', { verdict: 'nothing-answers' }, 'window-open');
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds, () => launch.setHealth(gaiaAnswering({ forgesRegistered: 1, forgesAnswered: 1 })));
    await launch.timers.untilPending(WAITS.windowWatchIntervalMilliseconds);
    launch.requestStop();
    expect(await launch.verdict).toEqual({ verdict: 'closed', serverWasStarted: true });
    expect(launch.processRun.ownedChildrenStopped()).toEqual([SPLASH_BROWSER_SHAPE, SERVER_SHAPE]);
    expect(launch.timers.pendingDelays()).toEqual([]);
  });

  test('stops both and says so in a dialog when the server does not answer within its tries', async () => {
    const launch = launchIn('server-down', { verdict: 'nothing-answers' }, 'window-open');
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    for (let i = 0; i < WAITS.serverStartTries; i++) await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    const verdict = await launch.verdict;
    expect(verdict).toEqual({ verdict: 'unrepaired', failure: 'server-not-started' });
    expect(launch.processRun.ownedChildrenStopped()).toEqual([SPLASH_BROWSER_SHAPE, SERVER_SHAPE]);
    expect(launch.processRun.callShapesAnswered().at(-1)).toBe(dialogShapeOf({ verdict: 'unrepaired', failure: 'server-not-started' }));
  });

  test('stops both and says so in a dialog when the browser shows no window within its tries', async () => {
    const launch = launchIn('server-down', { verdict: 'nothing-answers' }, 'window-closed');
    for (let i = 0; i < WAITS.windowAppearTries; i++) await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    expect(await launch.verdict).toEqual({ verdict: 'unrepaired', failure: 'window-not-found' });
    expect(launch.processRun.ownedChildrenRunning()).toEqual([]);
    expect(launch.processRun.callShapesAnswered().at(-1)).toBe(dialogShapeOf({ verdict: 'unrepaired', failure: 'window-not-found' }));
  });

  test('stops looking for the window at once and says so in a dialog when the browser ends before it lists one', async () => {
    const launch = launchIn('server-down', { verdict: 'nothing-answers' }, 'window-closed');
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds, () => launch.processRun.endByItself(SPLASH_BROWSER_SHAPE));
    expect(await launch.verdict).toEqual({ verdict: 'unrepaired', failure: 'window-not-found' });
    expect(launch.window.callsAnswered()).toEqual(['window-closed: page targets']);
    expect(launch.processRun.ownedChildrenRunning()).toEqual([]);
  });

  test('stops both and says so in a dialog when the window is still listed but does not move on to the page', async () => {
    const launch = launchIn('server-down', { verdict: 'nothing-answers' }, 'window-open');
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds, () => {
      launch.setHealth(gaiaAnswering({ forgesRegistered: 0, forgesAnswered: 0 }));
      launch.window.enterSituation('navigation-refused');
    });
    expect(await launch.verdict).toEqual({ verdict: 'unrepaired', failure: 'page-not-opened' });
    expect(launch.processRun.ownedChildrenRunning()).toEqual([]);
    expect(launch.processRun.callShapesAnswered().at(-1)).toBe(dialogShapeOf({ verdict: 'unrepaired', failure: 'page-not-opened' }));
  });

  test('stops both quietly, with no dialog, when User closes the splash before the page opens', async () => {
    const launch = launchIn('server-down', { verdict: 'nothing-answers' }, 'window-open');
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds, () => {
      launch.setHealth(gaiaAnswering({ forgesRegistered: 0, forgesAnswered: 0 }));
      launch.window.enterSituation('window-closed');
    });
    expect(await launch.verdict).toEqual({ verdict: 'closed', serverWasStarted: true });
    expect(launch.processRun.callShapesAnswered()).toEqual([SERVER_SHAPE, SPLASH_BROWSER_SHAPE]);
    expect(launch.processRun.ownedChildrenStopped()).toEqual([SPLASH_BROWSER_SHAPE, SERVER_SHAPE]);
  });

  test('stops both quietly, with no dialog and no more tries, when User closes the splash while the server starts', async () => {
    const launch = launchIn('server-down', { verdict: 'nothing-answers' }, 'window-open');
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    for (let i = 0; i < WAITS.windowGonePolls; i++) {
      await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds, () => launch.window.enterSituation('window-closed'));
    }
    expect(await launch.verdict).toEqual({ verdict: 'closed', serverWasStarted: true });
    expect(launch.healthAsked()).toBe(1 + WAITS.windowGonePolls);
    expect(launch.processRun.callShapesAnswered()).toEqual([SERVER_SHAPE, SPLASH_BROWSER_SHAPE]);
    expect(launch.processRun.ownedChildrenRunning()).toEqual([]);
  });

  test('stops the browser and says so in a dialog when the server it started ends while the forges are looked for', async () => {
    const launch = launchIn('server-down', { verdict: 'nothing-answers' }, 'window-open');
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds, () => launch.setHealth(gaiaAnswering({ forgesRegistered: 5, forgesAnswered: 2 })));
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds, () => launch.processRun.endByItself(SERVER_SHAPE));
    expect(await launch.verdict).toEqual({ verdict: 'unrepaired', failure: 'server-stopped' });
    expect(launch.codesAsked()).toEqual([]);
    expect(launch.processRun.ownedChildrenStopped()).toEqual([SPLASH_BROWSER_SHAPE]);
    expect(launch.processRun.callShapesAnswered().at(-1)).toBe(dialogShapeOf({ verdict: 'unrepaired', failure: 'server-stopped' }));
  });

  test('stops the browser and says so in a dialog when the server it started ends while the page is open', async () => {
    const launch = launchIn('server-down', { verdict: 'nothing-answers' }, 'window-open');
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds, () => launch.setHealth(gaiaAnswering({ forgesRegistered: 1, forgesAnswered: 1 })));
    await afterTheNextWait(launch, WAITS.windowWatchIntervalMilliseconds);
    await afterTheNextWait(launch, WAITS.windowWatchIntervalMilliseconds, () => launch.processRun.endByItself(SERVER_SHAPE));
    expect(await launch.verdict).toEqual({ verdict: 'unrepaired', failure: 'server-stopped' });
    expect(launch.window.navigations().at(-1)).toBe(PAGE_ADDRESS);
    expect(launch.processRun.ownedChildrenStopped()).toEqual([SPLASH_BROWSER_SHAPE]);
    expect(launch.processRun.ownedChildrenRunning()).toEqual([]);
    expect(launch.processRun.callShapesAnswered().at(-1)).toBe(dialogShapeOf({ verdict: 'unrepaired', failure: 'server-stopped' }));
  });
});

describe('a launch whose server ends before it answers', () => {
  test('stops the browser on the splash and says so in a dialog', async () => {
    const launch = launchIn('server-ends', { verdict: 'nothing-answers' }, 'window-open');
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    expect(await launch.verdict).toEqual({ verdict: 'unrepaired', failure: 'server-ended' });
    expect(launch.processRun.callShapesAnswered()).toEqual([SERVER_SHAPE, SPLASH_BROWSER_SHAPE, dialogShapeOf({ verdict: 'unrepaired', failure: 'server-ended' })]);
    expect(launch.processRun.ownedChildrenStopped()).toEqual([SPLASH_BROWSER_SHAPE]);
    expect(launch.processRun.ownedChildrenRunning()).toEqual([]);
    expect(launch.window.navigations()).toEqual([]);
  });
});

describe('a launch with Gaia already up', () => {
  test('opens the splash at its last step, asks for a code only once the window is listed, moves it to the page, and stops only the browser', async () => {
    const launch = launchIn('server-up', gaiaAnswering({ forgesRegistered: 5, forgesAnswered: 5 }), 'window-open');
    await launch.timers.untilPending(WAITS.pollIntervalMilliseconds);
    expect(launch.processRun.callShapesAnswered()).toEqual([BESIDE_BROWSER_SHAPE]);
    expect(launch.codesAsked()).toEqual([]);
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    await launch.timers.untilPending(WAITS.windowWatchIntervalMilliseconds);
    expect(launch.codesAsked()).toEqual([EXAMPLE_TOKEN]);
    expect(launch.window.navigations()).toEqual([PAGE_ADDRESS]);
    await untilTheWindowCloses(launch);
    expect(await launch.verdict).toEqual({ verdict: 'closed', serverWasStarted: false });
    expect(launch.processRun.ownedChildrenStopped()).toEqual([BESIDE_BROWSER_SHAPE]);
    expect(launch.healthAsked()).toBe(1);
  });

  test('puts no session code in the browser\'s arguments, where every account on the Mac could read it', async () => {
    const launch = launchIn('server-up', gaiaAnswering({ forgesRegistered: 5, forgesAnswered: 5 }), 'window-open');
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    await launch.timers.untilPending(WAITS.windowWatchIntervalMilliseconds);
    expect(launch.processRun.callShapesAnswered().join()).not.toContain(EXAMPLE_SESSION_CODE);
    launch.requestStop();
    expect(await launch.verdict).toEqual({ verdict: 'closed', serverWasStarted: false });
  });

  test('starts no browser when Gaia\'s token cannot be read, and says so in a dialog', async () => {
    token = null;
    const launch = launchIn('server-up', gaiaAnswering(null), 'window-open');
    expect(await launch.verdict).toEqual({ verdict: 'unrepaired', failure: 'session-not-issued' });
    expect(launch.codesAsked()).toEqual([]);
    expect(launch.processRun.callShapesAnswered()).toEqual([dialogShapeOf({ verdict: 'unrepaired', failure: 'session-not-issued' })]);
    expect(launch.processRun.ownedChildrenRunning()).toEqual([]);
  });
});

describe('a launch that is refused', () => {
  test('with no browser shows a dialog that names the browsers Gaia opens in, and starts nothing', async () => {
    const launch = launchIn('no-browser', { verdict: 'nothing-answers' }, 'window-closed', null);
    expect(await launch.verdict).toEqual({ verdict: 'refused', refusal: 'no-browser' });
    expect(launch.processRun.callShapesAnswered()).toEqual([dialogShapeOf({ verdict: 'refused', refusal: 'no-browser' })]);
    expect(launchMessageOf({ verdict: 'refused', refusal: 'no-browser' }, EXAMPLE_PORT)).toContain('Google Chrome or Microsoft Edge');
  });

  test('with another program on the port shows a dialog, looks for no browser and starts nothing', async () => {
    const launch = launchIn('port-held', { verdict: 'another-program-answers' }, 'window-closed');
    expect(await launch.verdict).toEqual({ verdict: 'refused', refusal: 'port-held-by-another-program' });
    expect(launch.processRun.callShapesAnswered()).toEqual([dialogShapeOf({ verdict: 'refused', refusal: 'port-held-by-another-program' })]);
    expect(launch.browserLooked()).toBe(0);
  });
});

describe('a launch from a Gaia.app', () => {
  test('installed for another install version shows a dialog that says to install it again, and probes and starts nothing', async () => {
    const appBundleInfo: AppBundleInfoReading = { verdict: 'readable', installVersion: GAIA_INSTALL_VERSION + 1 };
    const launch = launchIn('app-bundle-from-another-version', { verdict: 'nothing-answers' }, 'window-closed', EXAMPLE_BROWSER, appBundleInfo);
    expect(await launch.verdict).toEqual({ verdict: 'refused', refusal: 'app-bundle-from-another-version' });
    expect(launch.processRun.callShapesAnswered()).toEqual([dialogShapeOf({ verdict: 'refused', refusal: 'app-bundle-from-another-version' })]);
    expect([launch.healthAsked(), launch.browserLooked()]).toEqual([0, 0]);
    expect(launchMessageOf({ verdict: 'refused', refusal: 'app-bundle-from-another-version' }, EXAMPLE_PORT)).toContain('gaia install-app');
  });

  test('whose Info.plist is absent or holds no install version refuses the same, since it cannot show which version it fits', async () => {
    const unreadablePlists: readonly AppBundleInfoReading[] = [{ verdict: 'absent' }, { verdict: 'unreadable', failure: 'no GaiaInstallVersion' }];
    for (const appBundleInfo of unreadablePlists) {
      const launch = launchIn('app-bundle-from-another-version', { verdict: 'nothing-answers' }, 'window-closed', EXAMPLE_BROWSER, appBundleInfo);
      expect(await launch.verdict).toEqual({ verdict: 'refused', refusal: 'app-bundle-from-another-version' });
      expect(launch.healthAsked()).toBe(0);
    }
  });

  test('installed for this install version launches as a launch from a terminal does', async () => {
    const appBundleInfo: AppBundleInfoReading = { verdict: 'readable', installVersion: GAIA_INSTALL_VERSION };
    const launch = launchIn('server-up', gaiaAnswering({ forgesRegistered: 5, forgesAnswered: 5 }), 'window-open', EXAMPLE_BROWSER, appBundleInfo);
    await afterTheNextWait(launch, WAITS.pollIntervalMilliseconds);
    expect(launch.processRun.callShapesAnswered()).toEqual([BESIDE_BROWSER_SHAPE]);
    launch.requestStop();
    expect(await launch.verdict).toEqual({ verdict: 'closed', serverWasStarted: false });
  });
});
