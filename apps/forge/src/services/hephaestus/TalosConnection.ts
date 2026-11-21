/**
 * Hephaestus's one connection to its board's Talos: the frozen `hello` at the protocol version this code requires, then frames numbered
 * here, each answered by the `done` of its own id or by `no-answer` once the frame timeout passed. Every connection reads its data, also
 * where nobody listens for `state`, since a socket nobody reads never sees its `close`.
 */
import type { Socket } from 'node:net';

import { JsonRecordUtil } from '../../lib/json-record/JsonRecordUtil.ts';
import type {
  ClientFrame,
  DoneFrame,
  FrameRefusalReason,
  HelloFrame,
  RefusedFrame,
  StateFrame
} from '../../lib/talos/@types/TalosFrame.ts';
import type { ChildEnd, ChildState } from '../../lib/talos/ChildRecord.ts';
import type { RecognisedEnding }     from '../../lib/talos/EndingPatterns.ts';
import type { LocalEndpoint }        from '../../lib/talos/LocalEndpoint.ts';
import { TALOS_PROTOCOL_VERSION }    from '../../lib/talos/constants/TalosProtocol.ts';

/** A client frame as a caller hands it; the connection gives it its `frameId`. */
export type TalosFrameRequest = FrameWithoutId<ClientFrame>;

type FrameWithoutId<Frame> = Frame extends ClientFrame ? Omit<Frame, 'frameId'> : never;

export interface TalosConnection {
  readonly send:    (frame: TalosFrameRequest) => Promise<DoneFrame | 'no-answer'>;
  readonly onState: (listener: (frame: StateFrame) => void) => void;
  /** Called once, when Talos or `close` ended the connection. */
  readonly onClose: (listener: () => void) => void;
  readonly close:   () => void;
}

export interface TalosConnectionRequest {
  readonly endpoint:                 string;
  readonly secret:                   string;
  readonly localEndpoint:            Pick<LocalEndpoint, 'connectionTo'>;
  readonly frameTimeoutMilliseconds: number;
}

export type TalosConnectionOutcome =
  | { readonly verdict: 'welcomed'; readonly connection: TalosConnection }
  | { readonly verdict: 'version-mismatch'; readonly protocolVersion: number }
  | { readonly verdict: 'refused'; readonly reason: RefusedFrame['reason'] }
  /** No endpoint to connect to, or no first answer within the frame timeout. */
  | { readonly verdict: 'silent' };

type FirstAnswer = Exclude<TalosConnectionOutcome, { verdict: 'welcomed' }> | { readonly verdict: 'welcome' };

const LINE_SEPARATOR = '\n';

const REFUSED_REASONS: readonly RefusedFrame['reason'][] = ['malformed', 'secret', 'quitting'];
const FRAME_REFUSAL_REASONS: readonly FrameRefusalReason[] = [
  'malformed-launch', 'folder-outside-board', 'unknown-child', 'child-ended', 'kind-takes-no-input', 'no-quit-act', 'quitting',
];
const CHILD_STATES: readonly ChildState[] = ['starting', 'running', 'stopping', 'ended'];

function parsedObjectOf(line: string): Readonly<Record<string, unknown>> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return JsonRecordUtil.valueIsAPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function fieldOf(parsed: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.hasOwn(parsed, key) ? parsed[key] : undefined;
}

function isWholeNumber(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isOneOf<Value extends string>(value: unknown, values: readonly Value[]): value is Value {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

/** The first line Talos answers a `hello` with; anything else reads as silence. */
function firstAnswerOf(line: string): FirstAnswer {
  const parsed = parsedObjectOf(line);
  if (parsed === null) return { verdict: 'silent' };
  const kind = fieldOf(parsed, 'kind');
  const protocolVersion = fieldOf(parsed, 'protocolVersion');
  const reason = fieldOf(parsed, 'reason');
  if (kind === 'welcome') return { verdict: 'welcome' };
  if (kind === 'version-mismatch' && isWholeNumber(protocolVersion)) return { verdict: 'version-mismatch', protocolVersion };
  if (kind === 'refused' && isOneOf(reason, REFUSED_REASONS)) return { verdict: 'refused', reason };
  return { verdict: 'silent' };
}

function doneFrameOf(parsed: Readonly<Record<string, unknown>>): DoneFrame | null {
  const frameId = fieldOf(parsed, 'frameId');
  const verdict = fieldOf(parsed, 'verdict');
  const reason = fieldOf(parsed, 'reason');
  if (!isWholeNumber(frameId)) return null;
  if (verdict === 'done' || verdict === 'already-done') return { kind: 'done', frameId, verdict };
  return verdict === 'refused' && isOneOf(reason, FRAME_REFUSAL_REASONS) ? {
    kind: 'done', frameId, verdict, reason
  } : null;
}

/** Talos wrote the end and the recognised ending from its own records; they are handed on as Talos sent them. */
function stateFrameOf(parsed: Readonly<Record<string, unknown>>): StateFrame | null {
  const childId = fieldOf(parsed, 'childId');
  const state = fieldOf(parsed, 'state');
  const end = fieldOf(parsed, 'end') ?? null;
  const recognisedEnding = fieldOf(parsed, 'recognisedEnding') ?? null;
  if (typeof childId !== 'string' || !isOneOf(state, CHILD_STATES)) return null;
  if (end !== null && !JsonRecordUtil.valueIsAPlainObject(end)) return null;
  if (recognisedEnding !== null && !JsonRecordUtil.valueIsAPlainObject(recognisedEnding)) return null;
  return {
    kind:             'state',
    childId,
    state,
    end:              end as ChildEnd | null,
    recognisedEnding: recognisedEnding as RecognisedEnding | null,
  };
}

interface PendingFrame {
  readonly settle: (answer: DoneFrame | 'no-answer') => void;
  readonly timer:  ReturnType<typeof setTimeout>;
}

/** The connection past its `welcome`: `pending` holds every frame sent and not yet answered, by its id. */
function welcomedConnectionOf(socket: Socket, frameTimeoutMilliseconds: number): { connection: TalosConnection; takeLine: (line: string) => void; closed: () => void } {
  const pending = new Map<number, PendingFrame>();
  const stateListeners: ((frame: StateFrame) => void)[] = [];
  const closeListeners: (() => void)[] = [];
  let lastFrameId = 0;
  let isClosed = false;

  const settle = (frameId: number, answer: DoneFrame | 'no-answer'): void => {
    const waiting = pending.get(frameId);
    if (waiting === undefined) return;
    pending.delete(frameId);
    clearTimeout(waiting.timer);
    waiting.settle(answer);
  };
  const closed = (): void => {
    if (isClosed) return;
    isClosed = true;
    for (const frameId of [...pending.keys()]) settle(frameId, 'no-answer');
    for (const listener of closeListeners) listener();
  };
  const takeLine = (line: string): void => {
    const parsed = parsedObjectOf(line);
    if (parsed === null) return;
    const kind = fieldOf(parsed, 'kind');
    if (kind === 'done') {
      const done = doneFrameOf(parsed);
      if (done !== null) settle(done.frameId, done);
      return;
    }
    if (kind !== 'state') return;
    const state = stateFrameOf(parsed);
    if (state !== null) for (const listener of stateListeners) listener(state);
  };
  const connection: TalosConnection = Object.freeze({
    send: (frame: TalosFrameRequest): Promise<DoneFrame | 'no-answer'> => {
      if (isClosed) return Promise.resolve('no-answer');
      lastFrameId += 1;
      const frameId = lastFrameId;
      return new Promise<DoneFrame | 'no-answer'>((resolve) => {
        // The frame timeout measures real time: how long a Talos that holds the frame may take to answer it.
        const timer = setTimeout(() => settle(frameId, 'no-answer'), frameTimeoutMilliseconds);
        pending.set(frameId, { settle: resolve, timer });
        socket.write(`${JSON.stringify({ ...frame, frameId })}${LINE_SEPARATOR}`);
      });
    },
    onState: (listener: (frame: StateFrame) => void): void => {
      stateListeners.push(listener);
    },
    onClose: (listener: () => void): void => {
      closeListeners.push(listener);
    },
    close: (): void => {
      socket.destroy();
      closed();
    },
  });
  return { connection, takeLine, closed };
}

/** Connects, says `hello` with the secret at `TALOS_PROTOCOL_VERSION` and answers what Talos said first. Never throws. */
export function connectToTalos(request: TalosConnectionRequest): Promise<TalosConnectionOutcome> {
  return new Promise<TalosConnectionOutcome>((resolve) => {
    let socket: Socket;
    try {
      socket = request.localEndpoint.connectionTo(request.endpoint);
    } catch {
      resolve({ verdict: 'silent' });
      return;
    }
    let pendingText = '';
    let welcomed: ReturnType<typeof welcomedConnectionOf> | null = null;
    let answered = false;
    const answer = (outcome: TalosConnectionOutcome): void => {
      if (answered) return;
      answered = true;
      clearTimeout(firstAnswerTimer);
      resolve(outcome);
    };
    const giveUp = (): void => {
      if (answered) return;
      socket.destroy();
      answer({ verdict: 'silent' });
    };
    // The first answer's wait measures real time, as any frame's does.
    const firstAnswerTimer = setTimeout(giveUp, request.frameTimeoutMilliseconds);
    const takeFirstLine = (line: string): void => {
      const firstAnswer = firstAnswerOf(line);
      if (firstAnswer.verdict !== 'welcome') {
        socket.destroy();
        answer(firstAnswer);
        return;
      }
      welcomed = welcomedConnectionOf(socket, request.frameTimeoutMilliseconds);
      answer({ verdict: 'welcomed', connection: welcomed.connection });
    };
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      pendingText += chunk;
      let separatorIndex = pendingText.indexOf(LINE_SEPARATOR);
      while (separatorIndex !== -1) {
        const line = pendingText.slice(0, separatorIndex);
        pendingText = pendingText.slice(separatorIndex + 1);
        if (welcomed !== null) welcomed.takeLine(line);
        else if (!answered) takeFirstLine(line);
        separatorIndex = pendingText.indexOf(LINE_SEPARATOR);
      }
    });
    socket.on('error', giveUp);
    socket.on('close', () => {
      giveUp();
      welcomed?.closed();
    });
    socket.once('connect', () => {
      const hello: HelloFrame = { kind: 'hello', requiredProtocolVersion: TALOS_PROTOCOL_VERSION, secret: request.secret };
      socket.write(`${JSON.stringify(hello)}${LINE_SEPARATOR}`);
    });
  });
}
