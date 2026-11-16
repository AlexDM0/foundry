/**
 * The Bridge loaded for real: `oversee --port 0` on a scratch board with the fake agent, the redirect file `open` hands its opener, which
 * holds the session code, opened in headless Chrome over the DevTools
 * protocol, every tab visited, and every console error, uncaught exception, failed request and error-level log entry (a CSP violation is
 * one) collected. Dispatched workers have no browser skill, so this is their check; `bridge/HeadlessBridge.integration.spec.ts` runs it.
 */
import {
  chmodSync,
  existsSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { delimiter, join } from 'node:path';
import { pathToFileURL }   from 'node:url';

import {
  type AgentProgressResult,
  runAgentProgressBesideRecordedGit,
  startAgentProgress,
  type StartedAgentProgress
} from '../../cli/testing/CliProcess.ts';
import { createInitializedRecordedGitRepository }         from '../../cli/testing/InitializedScratchRepository.ts';
import { COMMON_FOLDER_OUTSIDE, idleOverseerAnswersIn }   from '../../cli/testing/RecordedGitStages.ts';
import { ownerOnlyFilesFor }                              from '../../src/lib/owner-only-files/OwnerOnlyFilesFor.ts';
import { workspacePathsFor }                              from '../../src/services/tracker/Workspace.ts';
import { environmentCopy }                                from '../../src/shared/Environment.ts';
import { stopProcessesReachingInto }                      from '../../src/testing/ProcessesInFolder.ts';
import { type RecordedGit, type RecordedGitStage }        from '../../src/testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { firstValueOf, waitUntil }                        from '../../src/testing/WaitUntil.ts';
import { HashRouter }                                     from '../shell/HashRouter.ts';

export const HEADLESS_CHECK_PROJECT = 'Example Agency';

/** The scratch board has no ticket that depends on another and no epic, and a stored pipeline, so it shows every tab but Waves and Epics. */
export const HEADLESS_CHECK_TABS = HashRouter.shownTabsOf(false, false, true);

/** No gates, on purpose: a readable pipeline, so the Bridge shows the board's tabs and the live flow instead of the setup alone. */
const HEADLESS_CHECK_PIPELINE_TEXT = `${JSON.stringify({
  version: 3, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
}, null, 2)}\n`;

export interface HeadlessBridgeReading {
  /** Each console error, exception, failed request or error-level log entry, worded with its source. */
  readonly problems:                 readonly string[];
  /** The project heading the shell rendered, `null` when it never rendered one. */
  readonly projectHeading:           string | null;
  readonly visitedTabs:              readonly string[];
  /** The screen the Pipeline view drew from the live facts on its tab, `null` when it drew none. */
  readonly pipelineScreen:           string | null;
  /** The address bar once the board rendered, which must hold no session code. */
  readonly addressAfterLoad:         string;
  /** The status of an `overseer-pause` posted with the token the page's session cookie fetched, `null` when none came back. */
  readonly commandStatus:            number | null;
  /** The width of a picture uploaded with the token and shown from its served route under the page CSP, `null` when it never showed. */
  readonly pictureWidth:             number | null;
  /** Each argument the stub browser opener got. */
  readonly openerArguments:          readonly string[];
  /** The code in the redirect file `open` handed its opener, read while the file stood, `null` when it held none. */
  readonly sessionCodeOfOpen:        string | null;
  /** What `open` printed on standard output, which must hold no session code. */
  readonly openStandardOutput:       string;
  readonly redirectFileWasOwnerOnly: boolean;
  /** Read once `open` ended on its stop signal. */
  readonly redirectFileWasRemoved:   boolean;
}

interface DevToolsMessage {
  readonly id?:     number;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
  readonly result?: Record<string, unknown>;
}

const DEVTOOLS_LISTENING_PATTERN = /DevTools listening on (ws:\/\/[^\s]+)/;
const POLL_INTERVAL_MILLISECONDS = 100;
const FIXED_CLOCK = (): Date => new Date('2026-10-29T20:00:00Z');
const BROWSER_OPENER_NAMES = ['open', 'xdg-open'];
// The path `bridge/api/CommandClient.ts` takes: the token from the cookie-guarded route, then the command with it as the bearer.
const SEND_A_COMMAND_AS_THE_BRIDGE_DOES = 'fetch(\'/api/session-token\').then((answer) => answer.json()).then(({ token }) => fetch(\'/api/commands\', '
  + '{ method: \'POST\', headers: { authorization: `Bearer ${token}`, \'content-type\': \'application/json\' }, '
  + 'body: JSON.stringify({ kind: \'overseer-pause\' }) })).then((answer) => answer.status)';
// The path `bridge/api/PictureUploadClient.ts` takes, a 1×1 PNG as the raw body, then the served picture shown as the page shows one.
const ONE_PIXEL_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const UPLOAD_AND_SHOW_A_PICTURE_AS_THE_BRIDGE_DOES = 'fetch(\'/api/session-token\').then((answer) => answer.json()).then(({ token }) => fetch(\'/api/pictures\', '
  + `{ method: 'POST', headers: { authorization: \`Bearer \${token}\`, 'content-type': 'image/png' }, body: Uint8Array.from(atob('${ONE_PIXEL_PNG_BASE64}'), `
  + '(character) => character.charCodeAt(0)) })).then((answer) => answer.json()).then(({ pictureId }) => { const picture = new Image(); '
  + 'picture.src = `/api/pictures/${pictureId}`; return picture.decode().then(() => picture.naturalWidth); })';
const EXECUTABLE_FILE_MODE = 0o755;
const SESSION_CODE_IN_REDIRECT_FILE = /#session=([0-9a-f]+)/;

/** The isolation check here asks git for the root of the scratch home, which holds no tracker and lies in no repository. */
const HOME_ISOLATION_CHECK: RecordedGitStage = [COMMON_FOLDER_OUTSIDE];

async function devToolsAddressOf(chrome: Bun.Subprocess<'ignore', 'ignore', 'pipe'>): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of chrome.stderr) {
    text += decoder.decode(chunk, { stream: true });
    const address = DEVTOOLS_LISTENING_PATTERN.exec(text)?.[1];
    if (address !== undefined) return address;
  }
  throw new Error(`Chrome exited before it listened for DevTools: ${text}`);
}

async function pageSocketAddressOf(browserAddress: string): Promise<string> {
  const { host } = new URL(browserAddress);
  return await firstValueOf(async () => {
    const targets = await (await fetch(`http://${host}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[];
    return targets.find((target) => target.type === 'page')?.webSocketDebuggerUrl;
  }, 'Chrome opening a page target', POLL_INTERVAL_MILLISECONDS);
}

function connectDevTools(address: string, onEvent: (message: DevToolsMessage) => void) {
  const socket = new WebSocket(address);
  const pending = new Map<number, (result: Record<string, unknown>) => void>();
  let nextId = 1;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as DevToolsMessage;
    if (message.id !== undefined) pending.get(message.id)?.(message.result ?? {});
    else onEvent(message);
  });
  const opened = new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', () => reject(new Error('the DevTools socket failed')));
  });
  const send = async (method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
    await opened;
    const id = nextId;
    nextId += 1;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
  };
  return { send, close: () => socket.close() };
}

function problemOf(message: DevToolsMessage): string | null {
  const params = message.params ?? {};
  switch (message.method) {
    case 'Runtime.exceptionThrown':
      return `exception: ${JSON.stringify((params['exceptionDetails'] as { exception?: { description?: string }; text?: string } | undefined)?.exception?.description ?? params)}`;
    case 'Runtime.consoleAPICalled':
      return params['type'] === 'error' ? `console error: ${JSON.stringify(params['args'])}` : null;
    case 'Log.entryAdded': {
      const entry = params['entry'] as { level?: string; text?: string; url?: string } | undefined;
      return entry?.level === 'error' ? `log error: ${entry.text ?? ''} ${entry.url ?? ''}`.trim() : null;
    }
    case 'Network.loadingFailed':
      return params['canceled'] === true ? null : `failed request: ${String(params['errorText'])} (${String(params['requestId'])})`;
    case 'Network.responseReceived': {
      const response = params['response'] as { status?: number; url?: string } | undefined;
      return (response?.status ?? 0) >= 400 ? `failed request: ${response?.status} ${response?.url}` : null;
    }
    default:
      return null;
  }
}

interface RunningOpen {
  readonly started:          StartedAgentProgress;
  /** Each argument the stub opener got, one per line. */
  readonly openerArguments:  readonly string[];
  readonly redirectFilePath: string;
  /** The code the redirect file held when the opener got it; `open` prints none, since the code is the launched browser's alone. */
  readonly sessionCode:      string | null;
  /** `null` while `open` still runs. */
  readonly ending:           () => AgentProgressResult | null;
}

/**
 * `open`, which issues the session code and stays until the code's life ends. Each platform's browser opener is a stub that only writes its
 * arguments down, so the one browser the code reaches is the headless Chrome, which loads the redirect file the stub was given.
 */
async function startOpen(recordedGit: RecordedGit, repositoryDirectory: string, homeDirectory: string, openerStubDirectory: string): Promise<RunningOpen> {
  const openerArgumentsPath = join(openerStubDirectory, 'opener-arguments.txt');
  for (const openerName of BROWSER_OPENER_NAMES) {
    const stubPath = join(openerStubDirectory, openerName);
    writeFileSync(stubPath, `#!/bin/sh\nprintf '%s\\n' "$@" > '${openerArgumentsPath}.partial'\nmv '${openerArgumentsPath}.partial' '${openerArgumentsPath}'\n`);
    chmodSync(stubPath, EXECUTABLE_FILE_MODE);
  }
  const environment = environmentCopy();
  environment['PATH'] = [openerStubDirectory, environment['PATH'] ?? ''].join(delimiter);
  const started = await recordedGit.playStage(HOME_ISOLATION_CHECK, async () => startAgentProgress(['open'], {
    currentDirectory: repositoryDirectory, homeDirectory, environment, recordedGitStage: [],
  }));
  let ending: AgentProgressResult | null = null;
  void started.finished.then((result) => {
    ending = result;
  }, () => undefined);
  const openerArguments = await firstValueOf(async () => {
    if (existsSync(openerArgumentsPath)) return readFileSync(openerArgumentsPath, 'utf8').split('\n').filter((argument) => argument !== '');
    const exited: AgentProgressResult | null = ending;
    if (exited !== null) throw new Error(`open exited at ${exited.exitCode} before it started the opener: ${exited.standardError}`);
    return undefined;
  }, 'open starting the browser opener', POLL_INTERVAL_MILLISECONDS);
  const redirectFilePath = openerArguments[openerArguments.length - 1] ?? '';
  const redirectFileText = existsSync(redirectFilePath) ? readFileSync(redirectFilePath, 'utf8') : '';
  const running: RunningOpen = {
    started,
    openerArguments,
    redirectFilePath,
    sessionCode: SESSION_CODE_IN_REDIRECT_FILE.exec(redirectFileText)?.[1] ?? null,
    ending:      () => ending,
  };
  if (!redirectFilePath.endsWith('.html')) {
    await stopTheOpen(running);
    throw new Error(`open gave the opener no redirect file, so it had no session code: ${openerArguments.join(' ')}`);
  }
  return running;
}

/** A stop signal, as a user's Ctrl-C, unless `open` already ended after the code's life. */
async function stopTheOpen(running: RunningOpen): Promise<AgentProgressResult> {
  if (running.ending() === null) process.kill(running.started.processId, 'SIGTERM');
  return await running.started.finished;
}

/**
 * Starts an Overseer and Chrome, reads the Bridge after `open`, and removes both and every scratch folder again, whatever happened. Git
 * plays `recordedGit` here and recorded answers in each spawned binary; a git call the Overseer could not answer is one of the problems.
 */
export async function readTheBridgeHeadless(chromePath: string, recordedGit: RecordedGit): Promise<HeadlessBridgeReading> {
  const repositoryDirectory = await createInitializedRecordedGitRepository(
    'headless-bridge', ['--project', HEADLESS_CHECK_PROJECT, '--no-hooks'], FIXED_CLOCK, recordedGit
  );
  writeFileSync(workspacePathsFor(repositoryDirectory).pipelineFilePath, HEADLESS_CHECK_PIPELINE_TEXT);
  const homeDirectory = createScratchDirectory('headless-bridge-home');
  const chromeProfileDirectory = createScratchDirectory('headless-bridge-chrome');
  const openerStubDirectory = createScratchDirectory('headless-bridge-opener');
  const problems: string[] = [];
  let chrome: Bun.Subprocess<'ignore', 'ignore', 'pipe'> | null = null;
  let devTools: ReturnType<typeof connectDevTools> | null = null;
  let overseer: ReturnType<typeof startAgentProgress> | null = null;
  let runningOpen: RunningOpen | null = null;
  try {
    const overseerOptions = { currentDirectory: repositoryDirectory, homeDirectory, recordedGitAnswerSet: idleOverseerAnswersIn(repositoryDirectory) };
    const startedOverseer = await recordedGit.playStage(HOME_ISOLATION_CHECK, async () => startAgentProgress(['oversee', '--port', '0'], overseerOptions));
    overseer = startedOverseer;
    await startedOverseer.firstOutputLine;
    // Chrome starts before `open` issues the code, so a cold start on a loaded machine does not use up the code's life.
    chrome = Bun.spawn([
      chromePath,
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${join(chromeProfileDirectory, 'profile')}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-extensions',
      'about:blank',
    ], { stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' });
    devTools = connectDevTools(await pageSocketAddressOf(await devToolsAddressOf(chrome)), (message) => {
      const problem = problemOf(message);
      if (problem !== null) problems.push(problem);
    });
    for (const domain of ['Runtime', 'Log', 'Network', 'Page']) await devTools.send(`${domain}.enable`);
    const opened = await startOpen(recordedGit, repositoryDirectory, homeDirectory, openerStubDirectory);
    runningOpen = opened;
    await devTools.send('Page.navigate', { url: pathToFileURL(opened.redirectFilePath).href });
    const evaluate = async (expression: string): Promise<unknown> => {
      const answer = await devTools?.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return (answer?.['result'] as { value?: unknown } | undefined)?.value ?? null;
    };
    let projectHeading: string | null = null;
    await waitUntil(async () => {
      const heading = await evaluate('document.querySelector(\'.bridge-title\')?.textContent ?? null');
      projectHeading = typeof heading === 'string' ? heading : null;
      return projectHeading === HEADLESS_CHECK_PROJECT;
    }, () => `the live board's project heading, still ${projectHeading ?? 'none'}: ${problems.join('\n')}`, POLL_INTERVAL_MILLISECONDS);
    const shownAddress = await evaluate('window.location.href');
    const addressAfterLoad = typeof shownAddress === 'string' ? shownAddress : '';
    const visitedTabs: string[] = [];
    let shownPipelineScreen: unknown = null;
    for (const tab of HEADLESS_CHECK_TABS) {
      await evaluate(`window.location.hash = '#${tab}'`);
      const shownTab = (): Promise<unknown> => evaluate('document.querySelector(\'.bridge-panel\')?.getAttribute(\'data-tab\') ?? null');
      await waitUntil(async () => await shownTab() === tab, `the ${tab} tab showing`, POLL_INTERVAL_MILLISECONDS);
      visitedTabs.push(tab);
      if (tab === 'pipeline') shownPipelineScreen = await evaluate('document.querySelector(\'.bridge-pipeline\')?.getAttribute(\'data-screen\') ?? null');
    }
    const commandStatus = await evaluate(SEND_A_COMMAND_AS_THE_BRIDGE_DOES);
    const pictureWidth = await evaluate(UPLOAD_AND_SHOW_A_PICTURE_AS_THE_BRIDGE_DOES);
    const redirectFileWasOwnerOnly = ownerOnlyFilesFor(process.platform).isOwnerOnly(opened.redirectFilePath);
    const openEnding = await stopTheOpen(opened);
    if (openEnding.exitCode !== 0) problems.push(`open ended at exit ${openEnding.exitCode}: ${openEnding.standardError}`);
    return {
      problems,
      projectHeading,
      visitedTabs,
      pipelineScreen:         typeof shownPipelineScreen === 'string' ? shownPipelineScreen : null,
      addressAfterLoad,
      commandStatus:          typeof commandStatus === 'number' ? commandStatus : null,
      pictureWidth:           typeof pictureWidth === 'number' ? pictureWidth : null,
      openerArguments:        opened.openerArguments,
      sessionCodeOfOpen:      opened.sessionCode,
      openStandardOutput:     openEnding.standardOutput,
      redirectFileWasOwnerOnly,
      redirectFileWasRemoved: !existsSync(opened.redirectFilePath),
    };
  } finally {
    if (runningOpen !== null) await stopTheOpen(runningOpen).catch(() => undefined);
    devTools?.close();
    chrome?.kill();
    await chrome?.exited;
    // A helper Chrome was still starting when it was stopped keeps running, orphaned, on a loaded machine; each one names the profile.
    await stopProcessesReachingInto(chromeProfileDirectory);
    const stopOptions = { currentDirectory: repositoryDirectory, homeDirectory, recordedGitStage: [] };
    await runAgentProgressBesideRecordedGit(recordedGit, HOME_ISOLATION_CHECK, ['oversee', 'stop'], stopOptions);
    // The returned reading holds this same array, so a git call the stopped Overseer could not answer still reaches the caller.
    const overseerGitProblem = await overseer?.finished.then(() => null, (error: unknown) => String(error));
    if (overseerGitProblem !== null && overseerGitProblem !== undefined) problems.push(overseerGitProblem);
    removeScratchDirectory(chromeProfileDirectory);
    removeScratchDirectory(openerStubDirectory);
    removeScratchDirectory(homeDirectory);
    removeScratchDirectory(repositoryDirectory);
  }
}
