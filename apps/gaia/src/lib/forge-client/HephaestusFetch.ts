/**
 * The boundary to a Hephaestus's HTTP API: one request with a bounded wait, answered with its status and body; or one event stream, read
 * chunk by chunk until it ends or is closed. A forge that does not answer is an ordinary answer, never a throw.
 */

export type HephaestusMethod = 'GET' | 'POST';

export interface HephaestusByteBody {
  readonly bytes:     Uint8Array;
  readonly mediaType: string;
}

/** `text`: the body is read as text; `bytes`: as the bytes it is, such as a picture, and `bodyText` is then empty. */
export type HephaestusAnswerForm = 'text' | 'bytes';

export interface HephaestusRequest {
  /** Hephaestus's address as the registry names it, such as `http://127.0.0.1:4930/`. */
  readonly hephaestusUrl:       string;
  readonly method:              HephaestusMethod;
  readonly path:                string;
  readonly bearerToken:         string | null;
  /** At most one of `jsonBody` and `byteBody` is set; both set is a caller's defect and throws. */
  readonly jsonBody:            string | null;
  readonly byteBody:            HephaestusByteBody | null;
  readonly answerAs:            HephaestusAnswerForm;
  readonly timeoutMilliseconds: number;
}

export interface HephaestusStreamRequest {
  readonly hephaestusUrl:       string;
  readonly path:                string;
  readonly bearerToken:         string | null;
  /** Sent as `Last-Event-ID`, so the stream replays what came after that event; `null` sends none. */
  readonly lastEventId:         string | null;
  /** Bounds the wait for the answer's head only: a stream that is open may stay quiet for as long as it likes. */
  readonly timeoutMilliseconds: number;
}

export interface AnsweredRequest {
  readonly verdict:     'answered';
  readonly status:      number;
  readonly contentType: string | null;
  readonly bodyText:    string;
  /** Set only for a request answered as bytes. */
  readonly bodyBytes:   Uint8Array | null;
}

/** `unreachable`: no connection, or one that broke before the answer was whole. `timed-out`: no whole answer within the bound. */
export type HephaestusAnswer = AnsweredRequest | { readonly verdict: 'unreachable' } | { readonly verdict: 'timed-out' };

/** `closed`: the stream ended, by Hephaestus or by `close`. `broken`: the connection broke while the stream was open. */
export type StreamEnding = 'closed' | 'broken';

export type StreamChunk = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'ended'; readonly ending: StreamEnding };

export interface HephaestusStream {
  /** The next text of the stream as it arrives; after the end, the end again. */
  readonly nextChunk: () => Promise<StreamChunk>;
  /** Ends the stream and its connection; a stream left open holds its connection until Hephaestus ends it. */
  readonly close:     () => void;
}

/** A head other than a 200 event stream is answered with its body, as a request is. */
export type HephaestusStreamAnswer = { readonly verdict: 'streaming'; readonly stream: HephaestusStream } | HephaestusAnswer;

export interface HephaestusFetch {
  readonly request:    (hephaestusRequest: HephaestusRequest) => Promise<HephaestusAnswer>;
  readonly openStream: (streamRequest: HephaestusStreamRequest) => Promise<HephaestusStreamAnswer>;
}

const STREAMING_STATUS = 200;
const EVENT_STREAM_CONTENT_TYPE = 'text/event-stream';
const JSON_CONTENT_TYPE = 'application/json';
const TIMEOUT_ERROR_NAME = 'TimeoutError';
const LAST_EVENT_ID_HEADER = 'Last-Event-ID';

function headersOf(bearerToken: string | null, extraHeaders: Readonly<Record<string, string>>): Record<string, string> {
  return bearerToken === null ? { ...extraHeaders } : { ...extraHeaders, Authorization: `Bearer ${bearerToken}` };
}

function failedAnswerOf(failure: unknown): HephaestusAnswer {
  const failureName = typeof failure === 'object' && failure !== null && 'name' in failure ? failure.name : null;
  return failureName === TIMEOUT_ERROR_NAME ? { verdict: 'timed-out' } : { verdict: 'unreachable' };
}

function streamOf(body: ReadableStream<Uint8Array>, abortController: AbortController): HephaestusStream {
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

function bodyOf({ jsonBody, byteBody }: HephaestusRequest): { readonly contentType: string; readonly body: string | Uint8Array } | null {
  if (jsonBody !== null && byteBody !== null) throw new Error('A request to a Hephaestus carries a JSON body or a byte body, never both.');
  if (jsonBody !== null) return { contentType: JSON_CONTENT_TYPE, body: jsonBody };
  if (byteBody !== null) return { contentType: byteBody.mediaType, body: byteBody.bytes };
  return null;
}

async function answeredRequestOf(response: Response, answerAs: HephaestusAnswerForm): Promise<AnsweredRequest> {
  const contentType = response.headers.get('Content-Type');
  if (answerAs === 'bytes') return {
    verdict: 'answered', status: response.status, contentType, bodyText: '', bodyBytes: new Uint8Array(await response.arrayBuffer())
  };
  return {
    verdict: 'answered', status: response.status, contentType, bodyText: await response.text(), bodyBytes: null
  };
}

/** The real boundary, over the runtime's `fetch`. A request that cannot be addressed, or carries two bodies, is a caller's defect and throws. */
export function realHephaestusFetch(): HephaestusFetch {
  async function request(hephaestusRequest: HephaestusRequest): Promise<HephaestusAnswer> {
    const address = new URL(hephaestusRequest.path, hephaestusRequest.hephaestusUrl);
    const requestBody = bodyOf(hephaestusRequest);
    const requestInit: RequestInit = {
      method:   hephaestusRequest.method,
      headers:  headersOf(hephaestusRequest.bearerToken, requestBody === null ? {} : { 'Content-Type': requestBody.contentType }),
      redirect: 'manual',
      signal:   AbortSignal.timeout(hephaestusRequest.timeoutMilliseconds),
    };
    if (requestBody !== null) requestInit.body = requestBody.body;
    try {
      return await answeredRequestOf(await fetch(address, requestInit), hephaestusRequest.answerAs);
    } catch (failure) {
      return failedAnswerOf(failure);
    }
  }

  async function openStream(streamRequest: HephaestusStreamRequest): Promise<HephaestusStreamAnswer> {
    const address         = new URL(streamRequest.path, streamRequest.hephaestusUrl);
    const abortController = new AbortController();
    const headTimer       = setTimeout(() => abortController.abort(new DOMException('No answer within the bound', TIMEOUT_ERROR_NAME)), streamRequest.timeoutMilliseconds);
    try {
      const streamHeaders: Record<string, string> = streamRequest.lastEventId === null
        ? { Accept: EVENT_STREAM_CONTENT_TYPE }
        : { Accept: EVENT_STREAM_CONTENT_TYPE, [LAST_EVENT_ID_HEADER]: streamRequest.lastEventId };
      const response = await fetch(address, {
        headers:  headersOf(streamRequest.bearerToken, streamHeaders),
        redirect: 'manual',
        signal:   abortController.signal,
      });
      const isEventStream = response.status === STREAMING_STATUS && (response.headers.get('Content-Type') ?? '').startsWith(EVENT_STREAM_CONTENT_TYPE);
      if (!isEventStream || response.body === null) return await answeredRequestOf(response, 'text');
      return { verdict: 'streaming', stream: streamOf(response.body, abortController) };
    } catch (failure) {
      return failedAnswerOf(failure);
    } finally {
      clearTimeout(headTimer);
    }
  }

  return { request, openStream };
}
