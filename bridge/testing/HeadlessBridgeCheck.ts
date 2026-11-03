/**
 * The Bridge loaded for real: `oversee --port 0` on a scratch board with the fake agent, the URL `open` prints, its session code included,
 * opened in headless Chrome over the DevTools
 * protocol, every tab visited, and every console error, uncaught exception, failed request and error-level log entry (a CSP violation is
 * one) collected. Dispatched workers have no browser skill, so this is their check; `bridge/HeadlessBridge.integration.spec.ts` runs it.
 */
import { chmodSync, realpathSync, writeFileSync } from 'node:fs';
import { delimiter, join }                        from 'node:path';

import { runAgentProgressBesideRecordedGit, startAgentProgress } from '../../cli/testing/CliProcess.ts';
import { createInitializedRecordedGitRepository }                from '../../cli/testing/InitializedScratchRepository.ts';
import { COMMON_FOLDER_OUTSIDE }                                 from '../../cli/testing/RecordedGitStages.ts';
import { environmentCopy }                                       from '../../src/shared/Environment.ts';
import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  type RecordedGit,
  type RecordedGitStage
} from '../../src/testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { firstValueOf, waitUntil }                        from '../../src/testing/WaitUntil.ts';
import { BRIDGE_TABS }                                    from '../shell/HashRouter.ts';

export const HEADLESS_CHECK_PROJECT = 'Example Agency';

export interface HeadlessBridgeReading {
  /** Each console error, exception, failed request or error-level log entry, worded with its source. */
  readonly problems:         readonly string[];
  /** The project heading the shell rendered, `null` when it never rendered one. */
  readonly projectHeading:   string | null;
  readonly visitedTabs:      readonly string[];
  /** The address bar once the board rendered, which must hold no session code. */
  readonly addressAfterLoad: string;
  /** The status of an `overseer-pause` posted with the token the page's session cookie fetched, `null` when none came back. */
  readonly commandStatus:    number | null;
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
const EXECUTABLE_FILE_MODE = 0o755;
const EXAMPLE_BRANCH = 'main';
const EXAMPLE_COMMIT = '0123456789abcdef0123456789abcdef01234567';

/** The isolation check here asks git for the root of the scratch home, which holds no tracker and lies in no repository. */
const HOME_ISOLATION_CHECK: RecordedGitStage = [COMMON_FOLDER_OUTSIDE];

/**
 * What an idle Overseer asks git about a repository with one checkout, one commit and no CLAUDE.md on its branch. Its polls decide how
 * often, so it answers from a set rather than a stage.
 */
function idleOverseerAnswersIn(repositoryDirectory: string): RecordedGitStage {
  const onTheBranch = { [RECORDED_PLACEHOLDERS.BRANCH]: EXAMPLE_BRANCH, [RECORDED_PLACEHOLDERS.COMMIT]: EXAMPLE_COMMIT };
  return [
    { gitArguments: ['version'], answeredAs: GIT_CALL_SHAPES.VERSION },
    { gitArguments: ['symbolic-ref', '--quiet', '--short', 'HEAD'], answeredAs: GIT_CALL_SHAPES.CURRENT_BRANCH, filledIn: onTheBranch },
    {
      gitArguments: ['worktree', 'list', '--porcelain'],
      answeredAs:   GIT_CALL_SHAPES.WORKTREE_LIST_MAIN_ONLY,
      filledIn:     { ...onTheBranch, [RECORDED_PLACEHOLDERS.REPOSITORY]: realpathSync(repositoryDirectory) },
    },
    { gitArguments: ['rev-parse', '--verify', '--quiet', EXAMPLE_BRANCH], answeredAs: GIT_CALL_SHAPES.BRANCH_VERIFIED, filledIn: onTheBranch },
    {
      gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${EXAMPLE_BRANCH}^{commit}`],
      answeredAs:   GIT_CALL_SHAPES.BRANCH_COMMIT_RESOLVED,
      filledIn:     onTheBranch,
    },
    {
      gitArguments: ['show', `${EXAMPLE_BRANCH}:CLAUDE.md`],
      answeredAs:   GIT_CALL_SHAPES.FILE_NOT_ON_BRANCH,
      filledIn:     { ...onTheBranch, [RECORDED_PLACEHOLDERS.PATH]: 'CLAUDE.md' },
    },
  ];
}

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

/**
 * The URL `open` prints, its session code in the fragment. Each platform's browser opener is a stub that does nothing, so the one browser
 * the code reaches is the headless Chrome below.
 */
async function pageUrlFromOpen(recordedGit: RecordedGit, repositoryDirectory: string, homeDirectory: string, openerStubDirectory: string): Promise<string> {
  for (const openerName of BROWSER_OPENER_NAMES) {
    const stubPath = join(openerStubDirectory, openerName);
    writeFileSync(stubPath, '#!/bin/sh\nexit 0\n');
    chmodSync(stubPath, EXECUTABLE_FILE_MODE);
  }
  const environment = environmentCopy();
  environment['PATH'] = [openerStubDirectory, environment['PATH'] ?? ''].join(delimiter);
  const opened = await runAgentProgressBesideRecordedGit(recordedGit, HOME_ISOLATION_CHECK, ['open'], {
    currentDirectory: repositoryDirectory, homeDirectory, environment, recordedGitStage: [],
  });
  if (opened.exitCode !== 0) throw new Error(`open failed at exit ${opened.exitCode}: ${opened.standardError}`);
  return opened.standardOutput.trim();
}

/**
 * Starts an Overseer and Chrome, reads the Bridge after `open`, and removes both and every scratch folder again, whatever happened. Git
 * plays `recordedGit` here and recorded answers in each spawned binary; a git call the Overseer could not answer is one of the problems.
 */
export async function readTheBridgeHeadless(chromePath: string, recordedGit: RecordedGit): Promise<HeadlessBridgeReading> {
  const repositoryDirectory = await createInitializedRecordedGitRepository(
    'headless-bridge', ['--project', HEADLESS_CHECK_PROJECT, '--no-hooks'], FIXED_CLOCK, recordedGit
  );
  const homeDirectory = createScratchDirectory('headless-bridge-home');
  const chromeProfileDirectory = createScratchDirectory('headless-bridge-chrome');
  const openerStubDirectory = createScratchDirectory('headless-bridge-opener');
  const problems: string[] = [];
  let chrome: Bun.Subprocess<'ignore', 'ignore', 'pipe'> | null = null;
  let devTools: ReturnType<typeof connectDevTools> | null = null;
  let overseer: ReturnType<typeof startAgentProgress> | null = null;
  try {
    const overseerOptions = { currentDirectory: repositoryDirectory, homeDirectory, recordedGitAnswerSet: idleOverseerAnswersIn(repositoryDirectory) };
    const startedOverseer = await recordedGit.playStage(HOME_ISOLATION_CHECK, async () => startAgentProgress(['oversee', '--port', '0'], overseerOptions));
    overseer = startedOverseer;
    await startedOverseer.firstOutputLine;
    const url = await pageUrlFromOpen(recordedGit, repositoryDirectory, homeDirectory, openerStubDirectory);
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
    await devTools.send('Page.navigate', { url });
    const evaluate = async (expression: string): Promise<unknown> => {
      const answer = await devTools?.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return (answer?.['result'] as { value?: unknown } | undefined)?.value ?? null;
    };
    let projectHeading: string | null = null;
    await waitUntil(async () => {
      const heading = await evaluate('document.querySelector(\'.bridge-project\')?.textContent ?? null');
      projectHeading = typeof heading === 'string' ? heading : null;
      return projectHeading === HEADLESS_CHECK_PROJECT;
    }, () => `the live board's project heading, still ${projectHeading ?? 'none'}: ${problems.join('\n')}`, POLL_INTERVAL_MILLISECONDS);
    const shownAddress = await evaluate('window.location.href');
    const addressAfterLoad = typeof shownAddress === 'string' ? shownAddress : '';
    const visitedTabs: string[] = [];
    for (const tab of BRIDGE_TABS) {
      await evaluate(`window.location.hash = '#${tab}'`);
      const shownTab = (): Promise<unknown> => evaluate('document.querySelector(\'.bridge-panel\')?.getAttribute(\'data-tab\') ?? null');
      await waitUntil(async () => await shownTab() === tab, `the ${tab} tab showing`, POLL_INTERVAL_MILLISECONDS);
      visitedTabs.push(tab);
    }
    const commandStatus = await evaluate(SEND_A_COMMAND_AS_THE_BRIDGE_DOES);
    return {
      problems, projectHeading, visitedTabs, addressAfterLoad, commandStatus: typeof commandStatus === 'number' ? commandStatus : null
    };
  } finally {
    devTools?.close();
    chrome?.kill();
    await chrome?.exited;
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
