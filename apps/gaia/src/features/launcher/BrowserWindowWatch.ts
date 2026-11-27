/**
 * The boundary to the browser's debugging pipe: a browser started with `--remote-debugging-pipe` speaks DevTools over the channel of the browser
 * child, which only the launcher holds, so no other process can reach the window. It lists the windows and navigates one; a browser that does not
 * answer is an ordinary answer, never a throw.
 */
import { JsonValueUtil, type JsonObject } from '../../lib/json-value/JsonValueUtil.ts';
import type { ChildChannel }              from '../../lib/process-run/ProcessRun.ts';

export interface PageTarget {
  readonly targetId: string;
  readonly url:      string;
}

export type PageTargetsAnswer = { readonly verdict: 'listed'; readonly pageTargets: readonly PageTarget[] } | { readonly verdict: 'unreachable' };

/** `refused`: the browser answered the navigation with an error. `unreachable`: no answer over the pipe within the bound. */
export type NavigationAnswer = { readonly verdict: 'navigated' } | { readonly verdict: 'refused'; readonly failure: string } | { readonly verdict: 'unreachable' };

export interface BrowserWindowWatch {
  readonly pageTargets: () => Promise<PageTargetsAnswer>;
  readonly navigate:    (pageTarget: PageTarget, address: string) => Promise<NavigationAnswer>;
}

/** The switch that has the browser speak its debugging protocol over descriptors 3 and 4 instead of a port any local process can reach. */
export const DEBUGGING_PIPE_ARGUMENT = '--remote-debugging-pipe';

/** The browser answers its target list and a navigation from memory; one that takes longer is not answering. */
export const DEBUGGING_ANSWER_TIMEOUT_MILLISECONDS = 2_000;

/** The pipe carries one JSON message after another, each ended by a NUL character. */
const MESSAGE_END = '\0';

const PAGE_TARGET_TYPE = 'page';

type ProtocolAnswer =
  | { readonly verdict: 'answered'; readonly result: JsonObject }
  | { readonly verdict: 'refused'; readonly failure: string }
  | { readonly verdict: 'unreachable' };

/** A listed target as Gaia reads it: a page with an address, or nothing. */
function pageTargetOf(listed: unknown): PageTarget | null {
  if (!JsonValueUtil.isJsonObject(listed) || listed['type'] !== PAGE_TARGET_TYPE) return null;
  const { targetId, url } = listed;
  return typeof targetId === 'string' && typeof url === 'string' ? { targetId, url } : null;
}

function protocolAnswerOf(message: JsonObject): ProtocolAnswer {
  const { error, result } = message;
  if (JsonValueUtil.isJsonObject(error)) return { verdict: 'refused', failure: typeof error['message'] === 'string' ? error['message'] : 'the browser refused the request' };
  return JsonValueUtil.isJsonObject(result) ? { verdict: 'answered', result } : { verdict: 'refused', failure: 'the browser answered without a result' };
}

function navigationAnswerOf(answer: ProtocolAnswer): NavigationAnswer {
  if (answer.verdict !== 'answered') return answer;
  const { errorText } = answer.result;
  return typeof errorText === 'string' ? { verdict: 'refused', failure: errorText } : { verdict: 'navigated' };
}

/** The watch over one browser's channel: every request carries an id of its own, and the browser's answer settles the request of that id. */
export function browserWindowWatchOver(channel: ChildChannel): BrowserWindowWatch {
  const settleById = new Map<number, (answer: ProtocolAnswer) => void>();
  let lastMessageId = 0;
  let unreadText = '';
  let channelIsClosed = false;

  function settleAnswerIn(messageText: string): void {
    const message = JsonValueUtil.parsedValueOf(messageText)?.parsed;
    if (!JsonValueUtil.isJsonObject(message) || typeof message['id'] !== 'number') return;
    const settle = settleById.get(message['id']);
    if (settle === undefined) return;
    settleById.delete(message['id']);
    settle(protocolAnswerOf(message));
  }

  channel.onText((text) => {
    const messageTexts = (unreadText + text).split(MESSAGE_END);
    unreadText = messageTexts.pop() ?? '';
    for (const messageText of messageTexts) settleAnswerIn(messageText);
  });
  void channel.closed.then(() => {
    channelIsClosed = true;
    for (const settle of settleById.values()) settle({ verdict: 'unreachable' });
    settleById.clear();
  });

  function send(method: string, params: Readonly<Record<string, unknown>>, sessionId: string | null): number {
    lastMessageId += 1;
    channel.write(`${JSON.stringify({
      id: lastMessageId, method, params, ...(sessionId === null ? {} : { sessionId })
    })}${MESSAGE_END}`);
    return lastMessageId;
  }

  function ask(method: string, params: Readonly<Record<string, unknown>>, sessionId: string | null = null): Promise<ProtocolAnswer> {
    if (channelIsClosed) return Promise.resolve({ verdict: 'unreachable' });
    return new Promise((resolve) => {
      const messageId  = send(method, params, sessionId);
      const boundTimer = setTimeout(() => {
        settleById.delete(messageId);
        resolve({ verdict: 'unreachable' });
      }, DEBUGGING_ANSWER_TIMEOUT_MILLISECONDS);
      settleById.set(messageId, (answer) => {
        clearTimeout(boundTimer);
        resolve(answer);
      });
    });
  }

  async function pageTargets(): Promise<PageTargetsAnswer> {
    const answer = await ask('Target.getTargets', {});
    const { targetInfos } = answer.verdict === 'answered' ? answer.result : {};
    if (!Array.isArray(targetInfos)) return { verdict: 'unreachable' };
    return { verdict: 'listed', pageTargets: targetInfos.map(pageTargetOf).filter((pageTarget) => pageTarget !== null) };
  }

  /** Attaches to the window for the one navigation and detaches after it: a session held open would hold the window's target. */
  async function navigate(pageTarget: PageTarget, address: string): Promise<NavigationAnswer> {
    const attachment = await ask('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });
    if (attachment.verdict !== 'answered') return attachment;
    const { sessionId } = attachment.result;
    if (typeof sessionId !== 'string') return { verdict: 'refused', failure: 'the browser gave the window no session' };
    const navigation = navigationAnswerOf(await ask('Page.navigate', { url: address }, sessionId));
    if (!channelIsClosed) send('Target.detachFromTarget', { sessionId }, null);
    return navigation;
  }

  return { pageTargets, navigate };
}
