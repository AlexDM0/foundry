/**
 * The real-system spec of the launcher, run only by `bun run record launcher-programs` on a Mac with Chrome or Edge: it launches Gaia for
 * real under the run's scratch home, with the real `gaia serve`, browser, window watch and dialogs, and records what each program the
 * launcher starts answers, under the example values the flow spec launches with. The situations: nothing on the port (the server and the
 * splash start, the page opens, and closing the window stops both), Gaia already up (the page opens, and the server outlives the window),
 * a server that ends before it answers, no browser, another program on the port and a Gaia.app installed for another install version (a
 * dialog each, which this spec dismisses), and the dialog of every other refusal and failure. The browser's version stamps the recording.
 */
import { existsSync }    from 'node:fs';
import { join }          from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { AppBundleInfoReading }                   from '../../adapters/app-bundle/AppBundleInfoFile.ts';
import { serverRecordPathIn }                          from '../../adapters/gaia-files/ServerRecordWriter.ts';
import { ServerTokenFile }                             from '../../adapters/gaia-files/ServerTokenFile.ts';
import { healthProbeVerdictFor, realGaiaServerClient } from '../../adapters/gaia-server/GaiaServerClient.ts';
import {
  realProcessRun,
  type DetachedStartRequest,
  type OwnedChild,
  type OwnedStartRequest,
  type ProcessRun,
} from '../../lib/process-run/ProcessRun.ts';
import { environmentCopy, homeDirectory }                      from '../../services/Environment.ts';
import { realWatchTimers }                                     from '../../services/ForgeWatch.ts';
import { GAIA_INSTALL_VERSION }                                from '../../shared/constants/InstallVersion.ts';
import { recordAnswer, recordSystemVersion, repositoryRoot }   from '../../testing/BoundaryRecordings.ts';
import { detachedStartCallShapeOf, ownedStartCallShapeOf }     from '../../testing/RecordedRuns.ts';
import { createScratchDirectory, removeScratchPath }           from '../../testing/ScratchRoot.ts';
import { foundBrowserIn, type FoundBrowser }                   from './BrowserFinder.ts';
import { realBrowserWindowWatch }                              from './BrowserWindowWatch.ts';
import { createLauncher, launchMessageOf, type LaunchVerdict } from './Launcher.ts';
import {
  EXAMPLE_BROWSER,
  EXAMPLE_BUN_PROGRAM,
  EXAMPLE_MAIN_PATH,
  EXAMPLE_PORT,
  EXAMPLE_PROFILE_FOLDER,
  EXAMPLE_SESSION_CODE,
  EXAMPLE_SPLASH_PAGE_PATH,
  EXAMPLE_THEME,
  LAUNCHER_PROGRAMS_RECORDING_NAME,
  launchCallShapeOf,
  type LaunchSituation,
} from './testing/RecordedLauncherPrograms.ts';
import { LaunchAddressUtil } from './utils/LaunchAddressUtil.ts';

/** As in the window watch's recording: under a scratch home the browser waits on the account's keychain unless it keeps it in memory. */
const SCRATCH_HOME_BROWSER_ARGUMENTS = ['--use-mock-keychain'];
const POLL_MILLISECONDS = 100;
const POLL_TRIES = 300;
const VERSION_TIMEOUT_MILLISECONDS = 10_000;
const SESSION_CODE_IN_ADDRESS = /#session=[0-9a-f]+/;

const MAIN_PATH = join(repositoryRoot(), 'src', 'Main.ts');
const SPLASH_PAGE_PATH = join(repositoryRoot(), 'resources', 'page', 'loading.html');

let browser: FoundBrowser;
let profileFolder = '';
/** A home of its own for the programs a launch starts, removed after: `gaia serve` writes its token and record there, Bun its cache. */
let launchHome = '';
let requestStop: () => void = () => undefined;
let childrenToEnd: OwnedChild[] = [];
let recordingsInFlight: Promise<void>[] = [];
let portHolders: Bun.Server<undefined>[] = [];

beforeEach(() => {
  const foundBrowser = foundBrowserIn(homeDirectory());
  if (foundBrowser === null) throw new Error('Recording launcher-programs needs Google Chrome or Microsoft Edge in /Applications.');
  browser       = foundBrowser;
  profileFolder = createScratchDirectory('launch-profile');
  launchHome    = createScratchDirectory('launch-home');
});

afterEach(async () => {
  requestStop();
  for (const child of childrenToEnd) {
    child.stop();
    await child.exited;
  }
  childrenToEnd = [];
  for (const portHolder of portHolders) await portHolder.stop(true);
  portHolders = [];
  removeScratchPath(profileFolder);
  removeScratchPath(launchHome);
});

/** A port setting that names no port: `gaia serve` refuses it and ends at once, as a server that cannot start does. */
const PORT_SETTING_THAT_NAMES_NO_PORT = 'example-no-port';

function launchEnvironment(portSetting: string): Record<string, string> {
  return { ...environmentCopy(), HOME: launchHome, GAIA_PORT: portSetting };
}

async function freePort(): Promise<number> {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
  const port = server.port ?? 0;
  await server.stop(true);
  return port;
}

/** The launch's real values as the example values the flow spec launches with, so a recorded call shape matches its call. */
function exampleArgumentOf(argument: string, port: number): string {
  const substitutions: readonly (readonly [string, string])[] = [
    [process.execPath, EXAMPLE_BUN_PROGRAM],
    [MAIN_PATH, EXAMPLE_MAIN_PATH],
    [pathToFileURL(SPLASH_PAGE_PATH).href, pathToFileURL(EXAMPLE_SPLASH_PAGE_PATH).href],
    [SPLASH_PAGE_PATH, EXAMPLE_SPLASH_PAGE_PATH],
    [profileFolder, EXAMPLE_PROFILE_FOLDER],
    [browser.program, EXAMPLE_BROWSER.program],
    [`127.0.0.1:${port}`, `127.0.0.1:${EXAMPLE_PORT}`],
    [`127.0.0.1%3A${port}`, `127.0.0.1%3A${EXAMPLE_PORT}`],
    [`port ${port}`, `port ${EXAMPLE_PORT}`],
  ];
  const substituted = substitutions.reduce((text, [realValue, exampleValue]) => text.replaceAll(realValue, exampleValue), argument);
  return substituted.replace(SESSION_CODE_IN_ADDRESS, `#session=${EXAMPLE_SESSION_CODE}`);
}

/**
 * The real process-run, recording each start under the example call shape of its situation. An owned child is recorded once it ends, with
 * whether its stop ended it; a dialog is recorded at its start and dismissed at once.
 */
function recordingProcessRun(situation: LaunchSituation, port: number): ProcessRun {
  const processRun = realProcessRun(() => launchEnvironment(situation === 'server-ends' ? PORT_SETTING_THAT_NAMES_NO_PORT : String(port)));
  const exampleShapeOf = (request: OwnedStartRequest | DetachedStartRequest): readonly [string, readonly string[]] => [
    exampleArgumentOf(request.program, port),
    request.programArguments.map((argument) => exampleArgumentOf(argument, port)),
  ];
  return {
    run: (request) => {
      throw new Error(`A launch runs no program to its end, and was asked to run ${request.program}.`);
    },
    startOwned: (request) => {
      const [exampleProgram, exampleArguments] = exampleShapeOf(request);
      const callShape = launchCallShapeOf(situation, ownedStartCallShapeOf(exampleProgram, exampleArguments));
      const isBrowser = request.program === browser.program;
      const answer    = processRun.startOwned(isBrowser ? { ...request, programArguments: [...request.programArguments, ...SCRATCH_HOME_BROWSER_ARGUMENTS] } : request);
      if (answer.verdict !== 'started') {
        recordAnswer(LAUNCHER_PROGRAMS_RECORDING_NAME, callShape, answer);
        return answer;
      }
      childrenToEnd.push(answer.child);
      let stopWasAsked = false;
      recordingsInFlight.push(answer.child.exited.then((exitCode) => {
        const ending = { by: stopWasAsked ? 'stop' : 'itself', exitCode };
        recordAnswer(LAUNCHER_PROGRAMS_RECORDING_NAME, callShape, { verdict: 'started', processId: answer.child.processId, ending });
      }));
      return {
        verdict: 'started',
        child:   {
          processId: answer.child.processId,
          exited:    answer.child.exited,
          stop:      () => {
            stopWasAsked = true;
            answer.child.stop();
          },
        },
      };
    },
    startDetached: (request) => {
      const [exampleProgram, exampleArguments] = exampleShapeOf(request);
      const answer = processRun.startDetached(request);
      recordAnswer(LAUNCHER_PROGRAMS_RECORDING_NAME, launchCallShapeOf(situation, detachedStartCallShapeOf(exampleProgram, exampleArguments)), answer);
      if (answer.verdict === 'started') process.kill(answer.processId);
      return answer;
    },
  };
}

function launchOf(situation: LaunchSituation, port: number, findBrowser: () => FoundBrowser | null, appBundleInfo: AppBundleInfoReading | null = null): Promise<LaunchVerdict> {
  const untilStopRequested = new Promise<void>((resolve) => {
    requestStop = resolve;
  });
  return createLauncher({
    port,
    appBundleInfo,
    serverProgram:        { program: process.execPath, programArguments: [MAIN_PATH, 'serve'], workingDirectory: repositoryRoot() },
    browserProfileFolder: profileFolder,
    splashPagePath:       SPLASH_PAGE_PATH,
    theme:                EXAMPLE_THEME,
    workingDirectory:     homeDirectory(),
    findBrowser,
    processRun:           recordingProcessRun(situation, port),
    browserWindowWatch:   realBrowserWindowWatch(),
    gaiaServer:           realGaiaServerClient(),
    readServerToken:      () => new ServerTokenFile(launchHome).read(),
    timers:               realWatchTimers(),
    untilStopRequested,
  }).launch();
}

/** Closes Gaia's window once it shows Gaia's page, as User does; the browser keeps running, as it does on a Mac. */
async function closeTheWindowOnceThePageOpens(port: number): Promise<void> {
  const watch = realBrowserWindowWatch();
  for (let i = 0; i < POLL_TRIES; i++) {
    await Bun.sleep(POLL_MILLISECONDS);
    const portAnswer = await watch.debuggingPortIn(profileFolder);
    if (portAnswer.verdict === 'not-written') continue;
    const targetsAnswer = await watch.pageTargetsAt(portAnswer.debuggingPort);
    const page = targetsAnswer.verdict === 'listed' ? targetsAnswer.pageTargets.find((pageTarget) => pageTarget.url.startsWith(`http://127.0.0.1:${port}/`)) : undefined;
    if (page === undefined) continue;
    await fetch(`http://127.0.0.1:${portAnswer.debuggingPort}/json/close/${page.targetId}`);
    return;
  }
  throw new Error('Gaia\'s page never opened in the window.');
}

async function untilGaiaAnswers(port: number): Promise<void> {
  for (let i = 0; i < POLL_TRIES && await healthProbeVerdictFor(port) !== 'gaia-answers'; i++) await Bun.sleep(POLL_MILLISECONDS);
}

describe('a launch on a real Mac', () => {
  test('stamps the recording with the browser it opens', async () => {
    const version = await realProcessRun(environmentCopy).run({
      program: browser.program, programArguments: ['--version'], workingDirectory: profileFolder, timeoutMilliseconds: VERSION_TIMEOUT_MILLISECONDS
    });
    if (version.verdict !== 'finished' || version.exitCode !== 0) throw new Error(`${browser.program} --version answered ${JSON.stringify(version)}`);
    recordSystemVersion(LAUNCHER_PROGRAMS_RECORDING_NAME, version.standardOutput.trim());
  });

  test('with nothing on the port starts the server and the splash, opens the page, and stops both when the window closes', async () => {
    const port = await freePort();
    const verdict = launchOf('server-down', port, () => browser);
    await closeTheWindowOnceThePageOpens(port);
    expect(await verdict).toEqual({ verdict: 'closed', serverWasStarted: true });
    await Promise.all(recordingsInFlight.splice(0));
    expect(await healthProbeVerdictFor(port)).toBe('nothing-answers');
    expect(existsSync(serverRecordPathIn(launchHome))).toBe(false);
  });

  test('with Gaia already up opens its page, and leaves the server running when the window closes', async () => {
    const port = await freePort();
    const serverStart = realProcessRun(() => launchEnvironment(String(port)))
      .startOwned({ program: process.execPath, programArguments: [MAIN_PATH, 'serve'], workingDirectory: repositoryRoot() });
    if (serverStart.verdict !== 'started') throw new Error('gaia serve did not start.');
    childrenToEnd.push(serverStart.child);
    await untilGaiaAnswers(port);
    const verdict = launchOf('server-up', port, () => browser);
    await closeTheWindowOnceThePageOpens(port);
    expect(await verdict).toEqual({ verdict: 'closed', serverWasStarted: false });
    await Promise.all(recordingsInFlight.splice(0));
    expect(await healthProbeVerdictFor(port)).toBe('gaia-answers');
  });

  test('with a server that ends before it answers stops the browser and shows a dialog', async () => {
    expect(await launchOf('server-ends', await freePort(), () => browser)).toEqual({ verdict: 'unrepaired', failure: 'server-ended' });
    await Promise.all(recordingsInFlight.splice(0));
  });

  test('with no browser shows a dialog and starts nothing', async () => {
    expect(await launchOf('no-browser', await freePort(), () => null)).toEqual({ verdict: 'refused', refusal: 'no-browser' });
  });

  test('shows every refusal and failure in a dialog of its own', () => {
    const verdicts: readonly Exclude<LaunchVerdict, { readonly verdict: 'closed' }>[] = [
      { verdict: 'refused', refusal: 'app-bundle-from-another-version' },
      { verdict: 'refused', refusal: 'no-browser' },
      { verdict: 'refused', refusal: 'port-held-by-another-program' },
      ...(['server-not-started', 'server-ended', 'browser-not-started', 'window-not-found', 'session-not-issued', 'page-not-opened'] as const)
        .map((failure) => ({ verdict: 'unrepaired', failure }) as const),
    ];
    const processRun = recordingProcessRun('every-dialog', EXAMPLE_PORT);
    for (const verdict of verdicts) {
      const dialogRun = LaunchAddressUtil.dialogRunOf(launchMessageOf(verdict, EXAMPLE_PORT));
      expect(processRun.startDetached({ ...dialogRun, workingDirectory: homeDirectory() })).toMatchObject({ verdict: 'started' });
    }
  });

  test('from a Gaia.app installed for another install version shows a dialog and starts nothing', async () => {
    const appBundleInfo: AppBundleInfoReading = { verdict: 'readable', installVersion: GAIA_INSTALL_VERSION + 1 };
    expect(await launchOf('app-bundle-from-another-version', await freePort(), () => browser, appBundleInfo))
      .toEqual({ verdict: 'refused', refusal: 'app-bundle-from-another-version' });
  });

  test('with another program on the port shows a dialog and starts nothing', async () => {
    const portHolder = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => Response.json({ application: 'example-application' }) });
    portHolders.push(portHolder);
    expect(await launchOf('port-held', portHolder.port ?? 0, () => browser)).toEqual({ verdict: 'refused', refusal: 'port-held-by-another-program' });
  });
});
