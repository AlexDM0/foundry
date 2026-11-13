/**
 * `gaia launch` (PLAN 9.2): probes Gaia's health on the port; starts `gaia serve` as an owned child when nothing answers and opens the
 * browser at once on the splash, which it moves on as the server and its forges answer; opens the window on Gaia's page with a fresh
 * session code; follows the window through the browser's debugging port; and when no window is left, stops the browser and the server it
 * started. Every wait is a bounded number of tries at an injectable interval, and every refusal or failure is shown in a dialog.
 */
import type { GaiaServerClient, HealthReading } from '../../adapters/gaia-server/GaiaServerClient.ts';
import type { ForgeCounts }                     from '../../adapters/gaia-server/HealthDocument.ts';
import type { OwnedChild, ProcessRun }          from '../../lib/process-run/ProcessRun.ts';
import type { WatchTimers }                     from '../../services/ForgeWatch.ts';
import type { ThemeChoice }                     from '../../shared/@types/GaiaSettings.ts';
import type { FoundBrowser }                    from './BrowserFinder.ts';
import type { BrowserWindowWatch, PageTarget }  from './BrowserWindowWatch.ts';
import { LaunchAddressUtil }                    from './utils/LaunchAddressUtil.ts';

export interface ProgramToStart {
  readonly program:          string;
  readonly programArguments: readonly string[];
  readonly workingDirectory: string;
}

export interface LaunchWaits {
  readonly pollIntervalMilliseconds:        number;
  /** Tries for the browser to report a window; a slow first start of a profile takes several seconds. */
  readonly windowAppearTries:               number;
  readonly serverStartTries:                number;
  /** Tries for every registered forge to answer before Attention opens with what has answered. */
  readonly forgeLookTries:                  number;
  readonly windowWatchIntervalMilliseconds: number;
  /** Polls in a row with no window before the window counts as closed: a browser lists no window for a moment while one replaces another. */
  readonly windowGonePolls:                 number;
  readonly childExitWaitMilliseconds:       number;
}

export const LAUNCH_WAITS: LaunchWaits = {
  pollIntervalMilliseconds:        250,
  windowAppearTries:               120,
  serverStartTries:                120,
  forgeLookTries:                  20,
  windowWatchIntervalMilliseconds: 1_000,
  windowGonePolls:                 3,
  childExitWaitMilliseconds:       10_000,
};

export interface LauncherOptions {
  readonly port:                 number;
  readonly serverProgram:        ProgramToStart;
  /** Gaia's own browser profile, kept between launches for the notification permission and the stored choices (PLAN 4). */
  readonly browserProfileFolder: string;
  readonly splashPagePath:       string;
  readonly theme:                ThemeChoice;
  /** Where the browser and the dialog run: a folder that exists. */
  readonly workingDirectory:     string;
  readonly findBrowser:          () => FoundBrowser | null;
  readonly processRun:           ProcessRun;
  readonly browserWindowWatch:   BrowserWindowWatch;
  readonly gaiaServer:           GaiaServerClient;
  readonly readServerToken:      () => Promise<string | null>;
  readonly timers:               WatchTimers;
  /** Settles when the launcher is asked to end, as by a signal: it then closes as if the window had closed. */
  readonly untilStopRequested:   Promise<void>;
  readonly waits?:               LaunchWaits;
}

export type LaunchRefusal = 'port-held-by-another-program' | 'no-browser';

export type LaunchFailure =
  | 'server-not-started'
  | 'server-ended'
  | 'browser-not-started'
  | 'window-not-found'
  | 'session-not-issued'
  | 'page-not-opened';

export type LaunchVerdict =
  | { readonly verdict: 'closed'; readonly serverWasStarted: boolean }
  | { readonly verdict: 'refused'; readonly refusal: LaunchRefusal }
  | { readonly verdict: 'unrepaired'; readonly failure: LaunchFailure };

export interface Launcher {
  readonly launch: () => Promise<LaunchVerdict>;
}

const BROWSER_NAMES = 'Google Chrome or Microsoft Edge';

/** The sentence a dialog and the terminal show for each refusal and failure; none tells User to run a command. */
export function launchMessageOf(verdict: Exclude<LaunchVerdict, { readonly verdict: 'closed' }>, port: number): string {
  if (verdict.verdict === 'refused') {
    return verdict.refusal === 'no-browser'
      ? `Gaia opens in a ${BROWSER_NAMES} window, and neither is in an Applications folder.`
      : `Another application answers on port ${port}, where Gaia serves. Gaia did not start.`;
  }
  switch (verdict.failure) {
    case 'server-not-started': return 'Gaia\'s server did not start in time. Gaia closed again.';
    case 'server-ended': return 'Gaia\'s server stopped before it answered. Gaia closed again.';
    case 'browser-not-started': return `The browser did not start. Gaia opens in a ${BROWSER_NAMES} window.`;
    case 'window-not-found': return 'The browser opened no window that Gaia can follow. Gaia closed again.';
    case 'session-not-issued': return 'Gaia\'s server gave the window no session. Gaia closed again.';
    case 'page-not-opened': return 'The window did not move on to Gaia\'s page. Gaia closed again.';
  }
}

type WaitOutcome = 'elapsed' | 'stop-requested';

interface WindowFound {
  readonly debuggingPort: number;
  readonly pageTargets:   readonly PageTarget[];
}

interface StopLatch {
  readonly isStopRequested: () => boolean;
  readonly afterDelay:      (delayMilliseconds: number) => Promise<WaitOutcome>;
}

/** One listener on the stop request for the whole launch, however many waits it makes. */
function stopLatchOf(untilStopRequested: Promise<void>, timers: WatchTimers): StopLatch {
  let stopIsRequested = false;
  const wakeOnStop = new Set<() => void>();
  void untilStopRequested.then(() => {
    stopIsRequested = true;
    for (const wake of wakeOnStop) wake();
    wakeOnStop.clear();
  });
  return {
    isStopRequested: () => stopIsRequested,
    afterDelay:      (delayMilliseconds) => {
      if (stopIsRequested) return Promise.resolve('stop-requested');
      return new Promise((resolve) => {
        const wake = (): void => {
          timer.cancel();
          resolve('stop-requested');
        };
        const timer = timers.start(() => {
          wakeOnStop.delete(wake);
          resolve('elapsed');
        }, delayMilliseconds);
        wakeOnStop.add(wake);
      });
    },
  };
}

interface FollowedChild {
  readonly child:    OwnedChild;
  readonly hasEnded: () => boolean;
}

function followedChildOf(child: OwnedChild): FollowedChild {
  let childHasEnded = false;
  void child.exited.then(() => {
    childHasEnded = true;
  });
  return { child, hasEnded: () => childHasEnded };
}

export function createLauncher(options: LauncherOptions): Launcher {
  const waits = options.waits ?? LAUNCH_WAITS;
  const latch = stopLatchOf(options.untilStopRequested, options.timers);

  function showDialog(verdict: Exclude<LaunchVerdict, { readonly verdict: 'closed' }>): LaunchVerdict {
    const dialogRun = LaunchAddressUtil.dialogRunOf(launchMessageOf(verdict, options.port));
    // The dialog outlives the launcher: Gaia closes at once, and the dialog stays until User dismisses it.
    options.processRun.startDetached({ ...dialogRun, workingDirectory: options.workingDirectory });
    return verdict;
  }

  /** Stops a child and waits for its end, within a bound: a child that ignores the stop is left, and the launch still closes. */
  async function stopAndAwait(followedChild: FollowedChild): Promise<void> {
    followedChild.child.stop();
    let endTheWait: () => void = () => undefined;
    const boundRanOut = new Promise<void>((resolve) => {
      endTheWait = resolve;
    });
    const boundTimer = options.timers.start(() => endTheWait(), waits.childExitWaitMilliseconds);
    await Promise.race([followedChild.child.exited, boundRanOut]);
    boundTimer.cancel();
  }

  async function stopAll(browser: FollowedChild | null, server: FollowedChild | null): Promise<void> {
    if (browser !== null) await stopAndAwait(browser);
    if (server !== null) await stopAndAwait(server);
  }

  function startBrowser(foundBrowser: FoundBrowser, startAddress: string): FollowedChild | null {
    const browserStart = options.processRun.startOwned({
      program:          foundBrowser.program,
      programArguments: LaunchAddressUtil.browserArgumentsOf(startAddress, options.browserProfileFolder),
      workingDirectory: options.workingDirectory,
    });
    return browserStart.verdict === 'started' ? followedChildOf(browserStart.child) : null;
  }

  /** The first listing that holds a window; the port is read again at each try, since a stale file names the browser before this one. */
  async function windowFound(): Promise<WindowFound | 'not-found' | 'stop-requested'> {
    for (let i = 0; i < waits.windowAppearTries; i++) {
      if (await latch.afterDelay(waits.pollIntervalMilliseconds) === 'stop-requested') return 'stop-requested';
      const portAnswer = await options.browserWindowWatch.debuggingPortIn(options.browserProfileFolder);
      if (portAnswer.verdict === 'not-written') continue;
      const targetsAnswer = await options.browserWindowWatch.pageTargetsAt(portAnswer.debuggingPort);
      if (targetsAnswer.verdict === 'listed' && targetsAnswer.pageTargets.length > 0) {
        return { debuggingPort: portAnswer.debuggingPort, pageTargets: targetsAnswer.pageTargets };
      }
    }
    return 'not-found';
  }

  /** Follows the window until no page target is left for the gone polls in a row, or until the launcher is asked to end. */
  async function untilWindowCloses(debuggingPort: number): Promise<void> {
    let pollsWithoutWindow = 0;
    while (pollsWithoutWindow < waits.windowGonePolls) {
      if (await latch.afterDelay(waits.windowWatchIntervalMilliseconds) === 'stop-requested') return;
      const targetsAnswer = await options.browserWindowWatch.pageTargetsAt(debuggingPort);
      pollsWithoutWindow = targetsAnswer.verdict === 'listed' && targetsAnswer.pageTargets.length > 0 ? 0 : pollsWithoutWindow + 1;
    }
  }

  async function sessionCodeOrNull(): Promise<string | null> {
    const token = await options.readServerToken();
    if (token === null) return null;
    const codeAnswer = await options.gaiaServer.sessionCodeFor(options.port, token);
    return codeAnswer.verdict === 'issued' ? codeAnswer.code : null;
  }

  async function launchBesideARunningServer(foundBrowser: FoundBrowser): Promise<LaunchVerdict> {
    const sessionCode = await sessionCodeOrNull();
    if (sessionCode === null) return showDialog({ verdict: 'unrepaired', failure: 'session-not-issued' });
    const browser = startBrowser(foundBrowser, LaunchAddressUtil.pageAddressOf(options.port, sessionCode));
    if (browser === null) return showDialog({ verdict: 'unrepaired', failure: 'browser-not-started' });
    const window = await windowFound();
    if (window === 'not-found') {
      await stopAll(browser, null);
      return showDialog({ verdict: 'unrepaired', failure: 'window-not-found' });
    }
    if (window !== 'stop-requested') await untilWindowCloses(window.debuggingPort);
    await stopAll(browser, null);
    return { verdict: 'closed', serverWasStarted: false };
  }

  /** The server's first Gaia answer, or why there is none: the server ended, the tries ran out, or the launcher was asked to end. */
  async function serverAnswer(server: FollowedChild): Promise<Extract<HealthReading, { readonly verdict: 'gaia-answers' }> | LaunchFailure | 'stop-requested'> {
    for (let i = 0; i < waits.serverStartTries; i++) {
      if (server.hasEnded()) return 'server-ended';
      const healthReading = await options.gaiaServer.healthReadingFor(options.port);
      if (healthReading.verdict === 'gaia-answers') return healthReading;
      if (await latch.afterDelay(waits.pollIntervalMilliseconds) === 'stop-requested') return 'stop-requested';
    }
    return 'server-not-started';
  }

  function forgesAllAnswered(forgeCounts: ForgeCounts | null): boolean {
    return forgeCounts === null || forgeCounts.forgesAnswered >= forgeCounts.forgesRegistered;
  }

  /** Shows the forges answering on the splash until all have, or the tries run out; Attention shows any that answer later. */
  async function lookForForges(splashTarget: PageTarget, splashAddress: string, firstCounts: ForgeCounts | null): Promise<WaitOutcome> {
    let shownCounts = firstCounts;
    await options.browserWindowWatch.navigate(splashTarget, LaunchAddressUtil.splashStepAddressOf(splashAddress, 'looking', shownCounts));
    for (let i = 0; i < waits.forgeLookTries && !forgesAllAnswered(shownCounts); i++) {
      if (await latch.afterDelay(waits.pollIntervalMilliseconds) === 'stop-requested') return 'stop-requested';
      const healthReading = await options.gaiaServer.healthReadingFor(options.port);
      const counts = healthReading.verdict === 'gaia-answers' ? healthReading.forgeCounts : shownCounts;
      if (counts?.forgesAnswered !== shownCounts?.forgesAnswered || counts?.forgesRegistered !== shownCounts?.forgesRegistered) {
        shownCounts = counts;
        await options.browserWindowWatch.navigate(splashTarget, LaunchAddressUtil.splashStepAddressOf(splashAddress, 'looking', shownCounts));
      }
    }
    return 'elapsed';
  }

  async function launchWithItsOwnServer(foundBrowser: FoundBrowser): Promise<LaunchVerdict> {
    const serverStart = options.processRun.startOwned(options.serverProgram);
    if (serverStart.verdict !== 'started') return showDialog({ verdict: 'unrepaired', failure: 'server-not-started' });
    const server        = followedChildOf(serverStart.child);
    const splashAddress = LaunchAddressUtil.splashAddressOf(options.splashPagePath, options.port, options.theme);
    const browser       = startBrowser(foundBrowser, splashAddress);
    const closedEarly = async (failure: LaunchFailure | 'stop-requested'): Promise<LaunchVerdict> => {
      await stopAll(browser, server);
      return failure === 'stop-requested' ? { verdict: 'closed', serverWasStarted: true } : showDialog({ verdict: 'unrepaired', failure });
    };
    if (browser === null) return closedEarly('browser-not-started');

    const window = await windowFound();
    if (window === 'not-found') return closedEarly('window-not-found');
    if (window === 'stop-requested') return closedEarly('stop-requested');
    const splashTarget = LaunchAddressUtil.splashTargetAmong(window.pageTargets, splashAddress);
    if (splashTarget === null) return closedEarly('window-not-found');

    const answer = await serverAnswer(server);
    if (typeof answer === 'string') return closedEarly(answer);
    if (await lookForForges(splashTarget, splashAddress, answer.forgeCounts) === 'stop-requested') return closedEarly('stop-requested');
    await options.browserWindowWatch.navigate(splashTarget, LaunchAddressUtil.splashStepAddressOf(splashAddress, 'opening', null));

    const sessionCode = await sessionCodeOrNull();
    if (sessionCode === null) return closedEarly('session-not-issued');
    const pageNavigation = await options.browserWindowWatch.navigate(splashTarget, LaunchAddressUtil.pageAddressOf(options.port, sessionCode));
    if (pageNavigation.verdict !== 'navigated') return closedEarly('page-not-opened');

    await untilWindowCloses(window.debuggingPort);
    await stopAll(browser, server);
    return { verdict: 'closed', serverWasStarted: true };
  }

  async function launch(): Promise<LaunchVerdict> {
    const probe = await options.gaiaServer.healthReadingFor(options.port);
    if (probe.verdict === 'another-program-answers') return showDialog({ verdict: 'refused', refusal: 'port-held-by-another-program' });
    const foundBrowser = options.findBrowser();
    if (foundBrowser === null) return showDialog({ verdict: 'refused', refusal: 'no-browser' });
    return probe.verdict === 'gaia-answers' ? launchBesideARunningServer(foundBrowser) : launchWithItsOwnServer(foundBrowser);
  }

  return { launch };
}
