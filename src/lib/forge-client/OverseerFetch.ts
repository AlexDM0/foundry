/**
 * The boundary to an Overseer's HTTP API: one request with a bounded wait, answered with its status and body; or one event stream, read
 * chunk by chunk until it ends or is closed. A forge that does not answer is an ordinary answer, never a throw.
 */

export type OverseerMethod = 'GET' | 'POST';

export interface OverseerRequest {
  /** The Overseer's address as the registry names it, such as `http://127.0.0.1:4930/`. */
  readonly overseerUrl:         string;
  readonly method:              OverseerMethod;
  readonly path:                string;
  readonly bearerToken:         string | null;
  readonly jsonBody:            string | null;
  readonly timeoutMilliseconds: number;
}

export interface OverseerStreamRequest {
  readonly overseerUrl:         string;
  readonly path:                string;
  readonly bearerToken:         string | null;
  /** Bounds the wait for the answer's head only: a stream that is open may stay quiet for as long as it likes. */
  readonly timeoutMilliseconds: number;
}

export interface AnsweredRequest {
  readonly verdict:  'answered';
  readonly status:   number;
  readonly bodyText: string;
}

/** `unreachable`: no connection, or one that broke before the answer was whole. `timed-out`: no whole answer within the bound. */
export type OverseerAnswer = AnsweredRequest | { readonly verdict: 'unreachable' } | { readonly verdict: 'timed-out' };

/** `closed`: the stream ended, by the Overseer or by `close`. `broken`: the connection broke while the stream was open. */
export type StreamEnding = 'closed' | 'broken';

export type StreamChunk = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'ended'; readonly ending: StreamEnding };

export interface OverseerStream {
  /** The next text of the stream as it arrives; after the end, the end again. */
  readonly nextChunk: () => Promise<StreamChunk>;
  /** Ends the stream and its connection; a stream left open holds its connection until the Overseer ends it. */
  readonly close:     () => void;
}

/** A head other than a 200 event stream is answered with its body, as a request is. */
export type OverseerStreamAnswer = { readonly verdict: 'streaming'; readonly stream: OverseerStream } | OverseerAnswer;

export interface OverseerFetch {
  readonly request:    (overseerRequest: OverseerRequest) => Promise<OverseerAnswer>;
  readonly openStream: (streamRequest: OverseerStreamRequest) => Promise<OverseerStreamAnswer>;
}

const STREAMING_STATUS = 200;
const EVENT_STREAM_CONTENT_TYPE = 'text/event-stream';
const TIMEOUT_ERROR_NAME = 'TimeoutError';

function headersOf(bearerToken: string | null, extraHeaders: Readonly<Record<string, string>>): Record<string, string> {
  return bearerToken === null ? { ...extraHeaders } : { ...extraHeaders, Authorization: `Bearer ${bearerToken}` };
}

function failedAnswerOf(failure: unknown): OverseerAnswer {
  const failureName = typeof failure === 'object' && failure !== null && 'name' in failure ? failure.name : null;
  return failureName === TIMEOUT_ERROR_NAME ? { verdict: 'timed-out' } : { verdict: 'unreachable' };
}

function streamOf(body: ReadableStream<Uint8Array>, abortController: AbortController): OverseerStream {
  const reader  = body.getReader();
  const decoder = new TextDecoder();
  let closedByCaller = false;
  let ending: StreamEnding | null = null;

  async function nextChunk(): Promise<StreamChunk> {
    if (ending !== null) return { kind: 'ended', ending };
    try {
      const { done, value } = await reader.read();
      if (!done) return { kind: 'text', text: decoder.decode(value, { stream: true }) };
      ending = 'closed';
    } catch {
      ending = closedByCaller ? 'closed' : 'broken';
    }
    return { kind: 'ended', ending };
  }

  function close(): void {
    closedByCaller = true;
    abortController.abort();
  }

  return { nextChunk, close };
}

/** The real boundary, over the runtime's `fetch`. A request that cannot be addressed is a caller's defect and throws. */
export function realOverseerFetch(): OverseerFetch {
  async function request(overseerRequest: OverseerRequest): Promise<OverseerAnswer> {
    const address = new URL(overseerRequest.path, overseerRequest.overseerUrl);
    const jsonHeaders: Record<string, string> = overseerRequest.jsonBody === null ? {} : { 'Content-Type': 'application/json' };
    const requestInit: RequestInit = {
      method:   overseerRequest.method,
      headers:  headersOf(overseerRequest.bearerToken, jsonHeaders),
      redirect: 'manual',
      signal:   AbortSignal.timeout(overseerRequest.timeoutMilliseconds),
    };
    if (overseerRequest.jsonBody !== null) requestInit.body = overseerRequest.jsonBody;
    try {
      const response = await fetch(address, requestInit);
      return { verdict: 'answered', status: response.status, bodyText: await response.text() };
    } catch (failure) {
      return failedAnswerOf(failure);
    }
  }

  async function openStream(streamRequest: OverseerStreamRequest): Promise<OverseerStreamAnswer> {
    const address         = new URL(streamRequest.path, streamRequest.overseerUrl);
    const abortController = new AbortController();
    const headTimer       = setTimeout(() => abortController.abort(new DOMException('No answer within the bound', TIMEOUT_ERROR_NAME)), streamRequest.timeoutMilliseconds);
    try {
      const response = await fetch(address, {
        headers:  headersOf(streamRequest.bearerToken, { Accept: EVENT_STREAM_CONTENT_TYPE }),
        redirect: 'manual',
        signal:   abortController.signal,
      });
      const isEventStream = response.status === STREAMING_STATUS && (response.headers.get('Content-Type') ?? '').startsWith(EVENT_STREAM_CONTENT_TYPE);
      if (!isEventStream || response.body === null) return { verdict: 'answered', status: response.status, bodyText: await response.text() };
      return { verdict: 'streaming', stream: streamOf(response.body, abortController) };
    } catch (failure) {
      return failedAnswerOf(failure);
    } finally {
      clearTimeout(headTimer);
    }
  }

  return { request, openStream };
}
