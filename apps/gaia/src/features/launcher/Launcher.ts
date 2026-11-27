/**
 * `gaia launch` (`docs/architecture.md`, "Processes"): starts `gaia serve` and the splash when nothing answers on the port, moves the window to
 * Gaia's page once it exists, and stops what it started when no window of Gaia's is left, whatever other window shows on Gaia's profile. Every
 * wait is bounded and every refusal a dialog; a Gaia.app of another install version refuses before it starts anything.
 */
import { appBundleFolderName, type AppBundleInfoReading } from '../../adapters/app-bundle/AppBundleInfoFile.ts';
import type { GaiaServerClient, HealthReading }           from '../../adapters/gaia-server/GaiaServerClient.ts';
import type { ForgeCounts }                               from '../../adapters/gaia-server/HealthDocument.ts';
import type { ChildChannel, OwnedChild, ProcessRun }      from '../../lib/process-run/ProcessRun.ts';
import type { ClockTimers }                               from '../../services/Clock.ts';
import type { ThemeChoice }                               from '../../shared/@types/GaiaSettings.ts';
import { GAIA_INSTALL_VERSION }                           from '../../shared/constants/InstallVersion.ts';
import type { FoundBrowser }                              from './BrowserFinder.ts';
import type { BrowserWindowWatch, PageTarget }            from './BrowserWindowWatch.ts';
import { LaunchAddressUtil }                              from './utils/LaunchAddressUtil.ts';

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
  readonly port:                   number;
  /** The Info.plist of the Gaia.app that started this launch; `null` for a launch from a terminal, which no bundle started. */
  readonly appBundleInfo:          AppBundleInfoReading | null;
  readonly serverProgram:          ProgramToStart;
  /** Gaia's own browser profile, kept between launches for the notification permission and the stored choices. */
  readonly browserProfileFolder:   string;
  readonly splashPagePath:         string;
  readonly theme:                  ThemeChoice;
  /** Where the browser and the dialog run: a folder that exists. */
  readonly workingDirectory:       string;
  readonly findBrowser:            () => FoundBrowser | null;
  readonly processRun:             ProcessRun;
  /** The watch over the debugging pipe of the browser the launch starts. */
  readonly browserWindowWatchOver: (channel: ChildChannel) => BrowserWindowWatch;
  readonly gaiaServer:             GaiaServerClient;
  readonly readServerToken:        () => Promise<string | null>;
  readonly timers:                 ClockTimers;
  /** Settles when the launcher is asked to end, as by a signal: it then closes as if the window had closed. */
  readonly untilStopRequested:     Promise<void>;
  readonly waits?:                 LaunchWaits;
}

export type LaunchRefusal = 'app-bundle-from-another-version' | 'port-held-by-another-program' | 'no-browser';

export type LaunchFailure =
  | 'server-not-started'
  | 'server-ended'
  | 'server-stopped'
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

/**
 * The sentence a dialog and the terminal show for each refusal and failure. Only the bundle's refusal names a command: `gaia install-app`
 * is the one way the bundle is installed, so it is also the way to install it again.
 */
export function launchMessageOf(verdict: Exclude<LaunchVerdict, { readonly verdict: 'closed' }>, port: number): string {
  if (verdict.verdict === 'refused') {
    switch (verdict.refusal) {
      case 'app-bundle-from-another-version':
        return `${appBundleFolderName()} was installed for another version of Gaia. Run "gaia install-app" again to install it for this one.`;
      case 'no-browser': return `Gaia opens in a ${BROWSER_NAMES} window, and neither is in an Applications folder.`;
      case 'port-held-by-another-program': return `Another application answers on port ${port}, where Gaia serves. Gaia did not start.`;
    }
  }
  switch (verdict.failure) {
    case 'server-not-started': return 'Gaia\'s server did not start in time. Gaia closed again.';
    case 'server-ended': return 'Gaia\'s server stopped before it answered. Gaia closed again.';
    case 'server-stopped': return 'Gaia\'s server stopped while its window was open. Gaia closed again.';
    case 'browser-not-started': return `The browser did not start. Gaia opens in a ${BROWSER_NAMES} window.`;
    case 'window-not-found': return 'The browser opened no window that Gaia can follow. Gaia closed again.';
    case 'session-not-issued': return 'Gaia\'s server gave the window no session. Gaia closed again.';
    case 'page-not-opened': return 'The window did not move on to Gaia\'s page. Gaia closed again.';
  }
}

type WaitOutcome = 'elapsed' | 'stop-requested';

/** How a launch ends without a dialog: asked to end, or its window closed by User. */
type QuietEnding = 'stop-requested' | 'window-closed';

interface StopLatch {
  readonly afterDelay: (delayMilliseconds: number) => Promise<WaitOutcome>;
}

/** One listener on the stop request for the whole launch, however many waits it makes. */
function stopLatchOf(untilStopRequested: Promise<void>, timers: ClockTimers): StopLatch {
  let stopIsRequested = false;
  const wakeOnStop = new Set<() => void>();
  void untilStopRequested.then(() => {
    stopIsRequested = true;
    for (const wake of wakeOnStop) wake();
    wakeOnStop.clear();
  });
  return {
    afterDelay: (delayMilliseconds) => {
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

interface StartedBrowser {
  readonly followed:    FollowedChild;
  readonly channel:     ChildChannel;
  readonly windowWatch: BrowserWindowWatch;
}

export function createLauncher(options: LauncherOptions): Launcher {
  const waits = options.waits ?? LAUNCH_WAITS;
  const latch = stopLatchOf(options.untilStopRequested, options.timers);

  /** Whether the browser lists a window of Gaia's; a browser that does not answer lists none. */
  async function gaiaWindowIsListed(windowWatch: BrowserWindowWatch, openedTarget: PageTarget): Promise<boolean> {
    const targetsAnswer = await windowWatch.pageTargets();
    return targetsAnswer.verdict === 'listed' && LaunchAddressUtil.gaiaWindowIsAmong(targetsAnswer.pageTargets, openedTarget, options.port);
  }

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

  async function stopAll(browser: StartedBrowser | null, server: FollowedChild | null): Promise<void> {
    if (browser !== null) {
      await stopAndAwait(browser.followed);
      browser.channel.close();
    }
    if (server !== null) await stopAndAwait(server);
  }

  /** Stops what the launch started; a quiet ending closes with no dialog, a failure shows one. */
  async function closedAfter(ending: LaunchFailure | QuietEnding, browser: StartedBrowser | null, server: FollowedChild | null): Promise<LaunchVerdict> {
    await stopAll(browser, server);
    if (ending === 'stop-requested' || ending === 'window-closed') return { verdict: 'closed', serverWasStarted: server !== null };
    return showDialog({ verdict: 'unrepaired', failure: ending });
  }

  function startBrowser(foundBrowser: FoundBrowser, startAddress: string): StartedBrowser | null {
    const browserStart = options.processRun.startOwned({
      program:          foundBrowser.program,
      programArguments: LaunchAddressUtil.browserArgumentsOf(startAddress, options.browserProfileFolder),
      workingDirectory: options.workingDirectory,
      withChannel:      true,
    });
    if (browserStart.verdict !== 'started') return null;
    const { channel } = browserStart.child;
    if (channel === null) {
      browserStart.child.stop();
      return null;
    }
    return { followed: followedChildOf(browserStart.child), channel, windowWatch: options.browserWindowWatchOver(channel) };
  }

  /**
   * The first listing that holds a window. A browser that ends before it lists one has handed its window to a browser already running on
   * Gaia's profile, whose pipe the launch does not hold, so the launch stops looking at once.
   */
  async function windowFound(browser: StartedBrowser): Promise<readonly PageTarget[] | 'not-found' | 'stop-requested'> {
    for (let i = 0; i < waits.windowAppearTries; i++) {
      if (await latch.afterDelay(waits.pollIntervalMilliseconds) === 'stop-requested') return 'stop-requested';
      if (browser.followed.hasEnded()) return 'not-found';
      const targetsAnswer = await browser.windowWatch.pageTargets();
      if (targetsAnswer.verdict === 'listed' && targetsAnswer.pageTargets.length > 0) return targetsAnswer.pageTargets;
    }
    return 'not-found';
  }

  /** Counts listings in a row that hold no window of Gaia's: a browser lists none for a moment while one window replaces another. */
  function windowAbsenceOf(windowWatch: BrowserWindowWatch, openedTarget: PageTarget): { readonly windowIsGone: () => Promise<boolean> } {
    let listingsWithoutWindow = 0;
    return {
      windowIsGone: async () => {
        listingsWithoutWindow = await gaiaWindowIsListed(windowWatch, openedTarget) ? 0 : listingsWithoutWindow + 1;
        return listingsWithoutWindow >= waits.windowGonePolls;
      },
    };
  }

  /** Follows Gaia's window until it is gone, the launcher is asked to end, or the server the launch started has ended. */
  async function untilWindowCloses(
    windowWatch: BrowserWindowWatch,
    openedTarget: PageTarget,
    ownedServer: FollowedChild | null,
  ): Promise<QuietEnding | 'server-stopped'> {
    const windowAbsence = windowAbsenceOf(windowWatch, openedTarget);
    for (;;) {
      if (await latch.afterDelay(waits.windowWatchIntervalMilliseconds) === 'stop-requested') return 'stop-requested';
      if (ownedServer?.hasEnded() === true) return 'server-stopped';
      if (await windowAbsence.windowIsGone()) return 'window-closed';
    }
  }

  async function sessionCodeOrNull(token: string): Promise<string | null> {
    const codeAnswer = await options.gaiaServer.sessionCodeFor(options.port, token);
    return codeAnswer.verdict === 'issued' ? codeAnswer.code : null;
  }

  /** Moves the splash's window to Gaia's page; a window gone by then was closed by User, and the launch closes quietly. */
  async function pageOpenedIn(windowWatch: BrowserWindowWatch, splashTarget: PageTarget, sessionCode: string): Promise<'opened' | 'page-not-opened' | 'window-closed'> {
    const pageNavigation = await windowWatch.navigate(splashTarget, LaunchAddressUtil.pageAddressOf(options.port, sessionCode));
    if (pageNavigation.verdict === 'navigated') return 'opened';
    return await gaiaWindowIsListed(windowWatch, splashTarget) ? 'page-not-opened' : 'window-closed';
  }

  /**
   * The window opens on the splash at its last step, never on an address with the code: a browser's arguments are readable by every
   * account on the Mac. The code is asked for once the window exists, so its short life starts then.
   */
  async function launchBesideARunningServer(foundBrowser: FoundBrowser): Promise<LaunchVerdict> {
    const token = await options.readServerToken();
    if (token === null) return showDialog({ verdict: 'unrepaired', failure: 'session-not-issued' });
    const splashAddress = LaunchAddressUtil.splashAddressOf(options.splashPagePath, options.port, options.theme);
    const browser       = startBrowser(foundBrowser, LaunchAddressUtil.splashStepAddressOf(splashAddress, 'opening', null));
    if (browser === null) return showDialog({ verdict: 'unrepaired', failure: 'browser-not-started' });

    const pageTargets = await windowFound(browser);
    if (pageTargets === 'not-found') return closedAfter('window-not-found', browser, null);
    if (pageTargets === 'stop-requested') return closedAfter('stop-requested', browser, null);
    const splashTarget = LaunchAddressUtil.splashTargetAmong(pageTargets, splashAddress);
    if (splashTarget === null) return closedAfter('window-not-found', browser, null);

    const sessionCode = await sessionCodeOrNull(token);
    if (sessionCode === null) return closedAfter('session-not-issued', browser, null);
    const pageOpening = await pageOpenedIn(browser.windowWatch, splashTarget, sessionCode);
    if (pageOpening !== 'opened') return closedAfter(pageOpening, browser, null);

    return closedAfter(await untilWindowCloses(browser.windowWatch, splashTarget, null), browser, null);
  }

  /** The server's first Gaia answer, or why there is none: the server ended, the tries ran out, the window closed, or a stop was asked. */
  async function serverAnswer(
    server: FollowedChild,
    windowWatch: BrowserWindowWatch,
    splashTarget: PageTarget,
  ): Promise<Extract<HealthReading, { readonly verdict: 'gaia-answers' }> | LaunchFailure | QuietEnding> {
    const windowAbsence = windowAbsenceOf(windowWatch, splashTarget);
    for (let i = 0; i < waits.serverStartTries; i++) {
      if (server.hasEnded()) return 'server-ended';
      const healthReading = await options.gaiaServer.healthReadingFor(options.port);
      if (healthReading.verdict === 'gaia-answers') return healthReading;
      if (await latch.afterDelay(waits.pollIntervalMilliseconds) === 'stop-requested') return 'stop-requested';
      if (await windowAbsence.windowIsGone()) return 'window-closed';
    }
    return 'server-not-started';
  }

  function forgesAllAnswered(forgeCounts: ForgeCounts | null): boolean {
    return forgeCounts === null || forgeCounts.forgesAnswered >= forgeCounts.forgesRegistered;
  }

  /** Shows the forges answering on the splash until all have, or the tries run out; Attention shows any that answer later. */
  async function lookForForges(
    server: FollowedChild,
    windowWatch: BrowserWindowWatch,
    splashTarget: PageTarget,
    splashAddress: string,
    firstCounts: ForgeCounts | null,
  ): Promise<WaitOutcome | 'window-closed' | 'server-stopped'> {
    const windowAbsence = windowAbsenceOf(windowWatch, splashTarget);
    let shownCounts = firstCounts;
    await windowWatch.navigate(splashTarget, LaunchAddressUtil.splashStepAddressOf(splashAddress, 'looking', shownCounts));
    for (let i = 0; i < waits.forgeLookTries && !forgesAllAnswered(shownCounts); i++) {
      if (await latch.afterDelay(waits.pollIntervalMilliseconds) === 'stop-requested') return 'stop-requested';
      if (server.hasEnded()) return 'server-stopped';
      if (await windowAbsence.windowIsGone()) return 'window-closed';
      const healthReading = await options.gaiaServer.healthReadingFor(options.port);
      const counts = healthReading.verdict === 'gaia-answers' ? healthReading.forgeCounts : shownCounts;
      if (counts?.forgesAnswered !== shownCounts?.forgesAnswered || counts?.forgesRegistered !== shownCounts?.forgesRegistered) {
        shownCounts = counts;
        await windowWatch.navigate(splashTarget, LaunchAddressUtil.splashStepAddressOf(splashAddress, 'looking', shownCounts));
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
    if (browser === null) return closedAfter('browser-not-started', null, server);

    const pageTargets = await windowFound(browser);
    if (pageTargets === 'not-found') return closedAfter('window-not-found', browser, server);
    if (pageTargets === 'stop-requested') return closedAfter('stop-requested', browser, server);
    const splashTarget = LaunchAddressUtil.splashTargetAmong(pageTargets, splashAddress);
    if (splashTarget === null) return closedAfter('window-not-found', browser, server);

    const answer = await serverAnswer(server, browser.windowWatch, splashTarget);
    if (typeof answer === 'string') return closedAfter(answer, browser, server);
    const lookOutcome = await lookForForges(server, browser.windowWatch, splashTarget, splashAddress, answer.forgeCounts);
    if (lookOutcome !== 'elapsed') return closedAfter(lookOutcome, browser, server);
    await browser.windowWatch.navigate(splashTarget, LaunchAddressUtil.splashStepAddressOf(splashAddress, 'opening', null));

    const token       = await options.readServerToken();
    const sessionCode = token === null ? null : await sessionCodeOrNull(token);
    if (sessionCode === null) return closedAfter(server.hasEnded() ? 'server-stopped' : 'session-not-issued', browser, server);
    const pageOpening = await pageOpenedIn(browser.windowWatch, splashTarget, sessionCode);
    if (pageOpening !== 'opened') return closedAfter(pageOpening, browser, server);

    return closedAfter(await untilWindowCloses(browser.windowWatch, splashTarget, server), browser, server);
  }

  /** A plist that holds no install version reads as another version's: the launch fails closed. */
  function appBundleFitsThisGaia(): boolean {
    const { appBundleInfo } = options;
    return appBundleInfo === null || (appBundleInfo.verdict === 'readable' && appBundleInfo.installVersion === GAIA_INSTALL_VERSION);
  }

  async function launch(): Promise<LaunchVerdict> {
    if (!appBundleFitsThisGaia()) return showDialog({ verdict: 'refused', refusal: 'app-bundle-from-another-version' });
    const probe = await options.gaiaServer.healthReadingFor(options.port);
    if (probe.verdict === 'another-program-answers') return showDialog({ verdict: 'refused', refusal: 'port-held-by-another-program' });
    const foundBrowser = options.findBrowser();
    if (foundBrowser === null) return showDialog({ verdict: 'refused', refusal: 'no-browser' });
    return probe.verdict === 'gaia-answers' ? launchBesideARunningServer(foundBrowser) : launchWithItsOwnServer(foundBrowser);
  }

  return { launch };
}
