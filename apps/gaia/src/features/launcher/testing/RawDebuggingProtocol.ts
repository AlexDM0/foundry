/**
 * The recording specs' own requests over a browser's debugging pipe, beside the window watch on the same channel: closing a window as User
 * does, and reading a value of a page's document. Its ids start far above the watch's, so each side settles only its own answers.
 * Test-only.
 */
import type { ChildChannel } from '../../../lib/process-run/ProcessRun.ts';

export interface RawDebuggingProtocol {
  readonly ask:         (method: string, params: Readonly<Record<string, unknown>>, sessionId?: string) => Promise<Readonly<Record<string, unknown>>>;
  readonly closeWindow: (targetId: string) => Promise<void>;
  /** The value of an expression in the window's page, read through a session attached for that one read. */
  readonly evaluatedIn: (targetId: string, expression: string) => Promise<unknown>;
}

const FIRST_RAW_MESSAGE_ID = 1_000_000;
const MESSAGE_END = '\0';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function rawDebuggingProtocolOver(channel: ChildChannel): RawDebuggingProtocol {
  const resolveById = new Map<number, (message: Readonly<Record<string, unknown>>) => void>();
  let lastMessageId = FIRST_RAW_MESSAGE_ID;
  let unreadText = '';
  channel.onText((text) => {
    const messageTexts = (unreadText + text).split(MESSAGE_END);
    unreadText = messageTexts.pop() ?? '';
    for (const messageText of messageTexts) {
      const message: unknown = JSON.parse(messageText);
      if (!isRecord(message) || typeof message['id'] !== 'number') continue;
      resolveById.get(message['id'])?.(message);
      resolveById.delete(message['id']);
    }
  });

  function ask(method: string, params: Readonly<Record<string, unknown>>, sessionId?: string): Promise<Readonly<Record<string, unknown>>> {
    lastMessageId += 1;
    const messageId = lastMessageId;
    return new Promise((resolve, reject) => {
      resolveById.set(messageId, (message) => {
        const { error, result } = message;
        if (isRecord(error)) reject(new Error(`${method} was refused: ${JSON.stringify(error)}`));
        else resolve(isRecord(result) ? result : {});
      });
      channel.write(`${JSON.stringify({
        id: messageId, method, params, ...(sessionId === undefined ? {} : { sessionId })
      })}${MESSAGE_END}`);
    });
  }

  return {
    ask,
    closeWindow: async (targetId) => {
      await ask('Target.closeTarget', { targetId });
    },
    evaluatedIn: async (targetId, expression) => {
      const { sessionId } = await ask('Target.attachToTarget', { targetId, flatten: true });
      if (typeof sessionId !== 'string') throw new Error('The browser gave the window no session.');
      const { result } = await ask('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
      await ask('Target.detachFromTarget', { sessionId });
      return isRecord(result) ? result['value'] : undefined;
    },
  };
}
