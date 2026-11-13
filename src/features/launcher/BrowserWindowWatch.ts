/**
 * The boundary to the browser's debugging port: the port the browser chose for `--remote-debugging-port=0`, read from its profile; the
 * page targets it lists, one per open window; and a navigation of one window to another address. A browser that does not answer is an
 * ordinary answer, never a throw.
 */
import { readFile } from 'node:fs/promises';
import { join }     from 'node:path';

export interface PageTarget {
  readonly targetId:        string;
  readonly url:             string;
  /** The target's own debugging socket, on 127.0.0.1, where a navigation is sent. */
  readonly debuggerAddress: string;
}

export type DebuggingPortAnswer = { readonly verdict: 'written'; readonly debuggingPort: number } | { readonly verdict: 'not-written' };

export type PageTargetsAnswer = { readonly verdict: 'listed'; readonly pageTargets: readonly PageTarget[] } | { readonly verdict: 'unreachable' };

/** `refused`: the browser answered the navigation with an error. `unreachable`: no answer from the target's socket within the bound. */
export type NavigationAnswer = { readonly verdict: 'navigated' } | { readonly verdict: 'refused'; readonly failure: string } | { readonly verdict: 'unreachable' };

export interface BrowserWindowWatch {
  readonly debuggingPortIn: (profileFolder: string) => Promise<DebuggingPortAnswer>;
  readonly pageTargetsAt:   (debuggingPort: number) => Promise<PageTargetsAnswer>;
  readonly navigate:        (pageTarget: PageTarget, address: string) => Promise<NavigationAnswer>;
}

/** The file a browser started with `--remote-debugging-port=0` writes into its profile: the port on the first line. */
const DEBUGGING_PORT_FILE_NAME = 'DevToolsActivePort';

/** The browser answers its target list and a navigation from memory; one that takes longer is not answering. */
export const DEBUGGING_ANSWER_TIMEOUT_MILLISECONDS = 2_000;

const PAGE_TARGET_TYPE = 'page';

const NAVIGATION_MESSAGE_ID = 1;

const HIGHEST_PORT = 65_535;

const LOOPBACK_SOCKET_PREFIX = 'ws://127.0.0.1:';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function portOfLine(line: string | undefined): number | null {
  const port = line !== undefined && /^\d+$/.test(line) ? Number(line) : Number.NaN;
  return Number.isSafeInteger(port) && port > 0 && port <= HIGHEST_PORT ? port : null;
}

/** A listed target as Gaia reads it: a page with an address and a socket on 127.0.0.1, or nothing. */
function pageTargetOf(listed: unknown): PageTarget | null {
  if (!isRecord(listed) || listed['type'] !== PAGE_TARGET_TYPE) return null;
  const { id, url, webSocketDebuggerUrl } = listed;
  if (typeof id !== 'string' || typeof url !== 'string' || typeof webSocketDebuggerUrl !== 'string') return null;
  return webSocketDebuggerUrl.startsWith(LOOPBACK_SOCKET_PREFIX) ? { targetId: id, url, debuggerAddress: webSocketDebuggerUrl } : null;
}

async function debuggingPortIn(profileFolder: string): Promise<DebuggingPortAnswer> {
  let contents: string;
  try {
    contents = await readFile(join(profileFolder, DEBUGGING_PORT_FILE_NAME), 'utf8');
  } catch {
    return { verdict: 'not-written' };
  }
  const debuggingPort = portOfLine(contents.split('\n')[0]);
  return debuggingPort === null ? { verdict: 'not-written' } : { verdict: 'written', debuggingPort };
}

async function pageTargetsAt(debuggingPort: number): Promise<PageTargetsAnswer> {
  let listed: unknown;
  try {
    const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`, { redirect: 'manual', signal: AbortSignal.timeout(DEBUGGING_ANSWER_TIMEOUT_MILLISECONDS) });
    listed = await response.json();
  } catch {
    return { verdict: 'unreachable' };
  }
  if (!Array.isArray(listed)) return { verdict: 'unreachable' };
  return { verdict: 'listed', pageTargets: listed.map(pageTargetOf).filter((pageTarget) => pageTarget !== null) };
}

function navigationAnswerOf(messageText: string): NavigationAnswer | null {
  let message: unknown;
  try {
    message = JSON.parse(messageText);
  } catch {
    return null;
  }
  if (!isRecord(message) || message['id'] !== NAVIGATION_MESSAGE_ID) return null;
  const { error, result } = message;
  if (isRecord(error)) return { verdict: 'refused', failure: typeof error['message'] === 'string' ? error['message'] : 'the browser refused the navigation' };
  if (isRecord(result) && typeof result['errorText'] === 'string') return { verdict: 'refused', failure: result['errorText'] };
  return { verdict: 'navigated' };
}

/** One socket per navigation, closed at its answer: a navigation is rare, and a socket held open would hold the window's target. */
function navigate(pageTarget: PageTarget, address: string): Promise<NavigationAnswer> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(pageTarget.debuggerAddress);
    } catch {
      resolve({ verdict: 'unreachable' });
      return;
    }
    let isSettled = false;
    let boundTimer: ReturnType<typeof setTimeout> | undefined;
    const settle = (answer: NavigationAnswer): void => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(boundTimer);
      socket.close();
      resolve(answer);
    };
    boundTimer = setTimeout(() => settle({ verdict: 'unreachable' }), DEBUGGING_ANSWER_TIMEOUT_MILLISECONDS);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ id: NAVIGATION_MESSAGE_ID, method: 'Page.navigate', params: { url: address } }));
    });
    socket.addEventListener('message', (event) => {
      const answer = typeof event.data === 'string' ? navigationAnswerOf(event.data) : null;
      if (answer !== null) settle(answer);
    });
    socket.addEventListener('error', () => settle({ verdict: 'unreachable' }));
    socket.addEventListener('close', () => settle({ verdict: 'unreachable' }));
  });
}

export function realBrowserWindowWatch(): BrowserWindowWatch {
  return { debuggingPortIn, pageTargetsAt, navigate };
}
