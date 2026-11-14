/**
 * One headless Chrome driven over the DevTools protocol, for the frame capture: it opens one blank page, runs a script on it, evaluates
 * expressions and takes pictures of the viewport. It talks to Chrome over its own pipes, so it opens no port and never polls.
 */
import { CHROME_LOCATIONS } from './constants/FrameCapture.ts';

interface DevToolsMessage {
  readonly id?:     number;
  readonly result?: Record<string, unknown>;
  readonly error?:  { readonly message?: string };
}

export interface ViewportSize {
  readonly widthPixels:       number;
  readonly heightPixels:      number;
  readonly deviceScaleFactor: number;
}

export interface HeadlessChromePage {
  /** Runs a script on the page, as a classic script; an exception is thrown here. */
  readonly runScript:    (source: string) => Promise<void>;
  /** The value of an expression that may return a promise, as JSON. */
  readonly valueOf:      (expression: string) => Promise<unknown>;
  /** The viewport as a PNG. */
  readonly pictureBytes: () => Promise<Uint8Array>;
  readonly close:        () => Promise<void>;
}

/** `--remote-debugging-pipe` reads commands from this descriptor and writes answers to the next, each message ended by a NUL. */
const COMMAND_DESCRIPTOR = 3;
const ANSWER_DESCRIPTOR = 4;
const MESSAGE_END = '\0';

export function chromeExecutablePath(): string | null {
  const application = CHROME_LOCATIONS.APPLICATION_PATHS.find((path) => Bun.file(path).size > 0);
  if (application !== undefined) return application;
  for (const commandName of CHROME_LOCATIONS.COMMAND_NAMES) {
    const found = Bun.which(commandName);
    if (found !== null) return found;
  }
  return null;
}

type DevToolsSender = (method: string, params?: Record<string, unknown>, sessionId?: string | null) => Promise<Record<string, unknown>>;

/** Sends a command and answers it by its id; the answers arrive on their own descriptor, read for as long as Chrome runs. */
function pipeSenderOf(chrome: Bun.Subprocess): DevToolsSender {
  const descriptors = chrome.stdio as readonly unknown[];
  const commands = Bun.file(Number(descriptors[COMMAND_DESCRIPTOR])).writer();
  const answers = Bun.file(Number(descriptors[ANSWER_DESCRIPTOR])).stream();
  const pending = new Map<number, { readonly resolve: (result: Record<string, unknown>) => void; readonly reject: (error: Error) => void }>();
  let nextId = 1;
  const answered = (text: string): void => {
    const message = JSON.parse(text) as DevToolsMessage;
    if (message.id === undefined) return;
    const waiting = pending.get(message.id);
    pending.delete(message.id);
    if (message.error === undefined) waiting?.resolve(message.result ?? {});
    else waiting?.reject(new Error(message.error.message ?? 'a DevTools call failed'));
  };
  void (async () => {
    const decoder = new TextDecoder();
    let buffered = '';
    for await (const chunk of answers) {
      buffered += decoder.decode(chunk, { stream: true });
      let end = buffered.indexOf(MESSAGE_END);
      while (end !== -1) {
        answered(buffered.slice(0, end));
        buffered = buffered.slice(end + 1);
        end = buffered.indexOf(MESSAGE_END);
      }
    }
  })();
  return async (method, params = {}, sessionId = null) => {
    const id = nextId;
    nextId += 1;
    const answer = new Promise<Record<string, unknown>>((resolve, reject) => pending.set(id, { resolve, reject }));
    void commands.write(`${JSON.stringify({
      id, method, params, ...(sessionId === null ? {} : { sessionId })
    })}${MESSAGE_END}`);
    await commands.flush();
    return answer;
  };
}

export async function openHeadlessChromePage(chromePath: string, profileFolder: string, viewport: ViewportSize): Promise<HeadlessChromePage> {
  const chrome = Bun.spawn([
    chromePath,
    '--headless=new',
    '--remote-debugging-pipe',
    `--user-data-dir=${profileFolder}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--disable-gpu',
    '--run-all-compositor-stages-before-draw',
    '--force-color-profile=srgb',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const send = pipeSenderOf(chrome);
  const created = await send('Target.createTarget', { url: 'about:blank' });
  const attached = await send('Target.attachToTarget', { targetId: created['targetId'], flatten: true });
  const sessionId = String(attached['sessionId']);
  const sendToPage = async (method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> => send(method, params, sessionId);
  await sendToPage('Emulation.setDeviceMetricsOverride', {
    width: viewport.widthPixels, height: viewport.heightPixels, deviceScaleFactor: viewport.deviceScaleFactor, mobile: false,
  });
  const evaluated = async (expression: string): Promise<unknown> => {
    const answer = await sendToPage('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    const exception = answer['exceptionDetails'] as { readonly exception?: { readonly description?: string }; readonly text?: string } | undefined;
    if (exception !== undefined) throw new Error(`the page threw: ${exception.exception?.description ?? exception.text ?? 'an exception'}`);
    return (answer['result'] as { readonly value?: unknown } | undefined)?.value;
  };
  return {
    runScript: async (source) => {
      await evaluated(source);
    },
    valueOf:      evaluated,
    pictureBytes: async () => {
      const picture = await sendToPage('Page.captureScreenshot', { format: 'png' });
      return Uint8Array.from(Buffer.from(String(picture['data']), 'base64'));
    },
    close: async () => {
      chrome.kill();
      await chrome.exited;
    },
  };
}
