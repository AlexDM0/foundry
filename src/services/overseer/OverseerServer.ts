/**
 * The Overseer's HTTP and SSE API on 127.0.0.1, design section 9.3. Every request needs a loopback Host, against DNS rebinding; one whose
 * Origin is not the API's own, a preflight above all, gets 403 and no route sends CORS headers, so the token never reaches another
 * origin's page. `POST /api/commands`, `POST /api/pictures` and `POST /api/session-codes` need the bearer token; the data routes the token or
 * the session cookie a one-time code buys at `POST /api/session`; and every answer carries the Bridge's CSP, a served file a sandbox of its
 * own. What a command does, and how a refusal is worded,
 * is the command surface's.
 */
import { timingSafeEqual } from 'node:crypto';

import type { HTMLBundle } from 'bun';

import { WATCHER_PROTOCOL_VERSION }                                               from '../../lib/watcher/constants/WatcherProtocol.ts';
import type { TranscriptEntry }                                                   from '../../shared/@types/TranscriptEntry.ts';
import { PICTURE_SIZE_LIMIT_BYTES, SERVED_JOB_FILE_NAMES, SSE_HEARTBEAT_SECONDS } from '../../shared/constants/OverseerLimits.ts';
import { PRODUCT_NAMES }                                                          from '../../shared/constants/ProductNames.ts';
import { BrowserSessions }                                                        from './BrowserSessions.ts';
import type { EventBroker, OverseerEvent }                                        from './EventBroker.ts';
import { OverseerPort, type OverseerPortChoice }                                  from './OverseerPort.ts';
import { MILLISECONDS_PER_SECOND }                                                from './constants/TimeUnits.ts';

export interface OverseerIdentity {
  application:            string;
  trackerId:              string;
  project:                string;
  codeVersion:            string;
  installVersion:         number;
  watcherProtocolVersion: number;
  processId:              number;
}

/** A route's answer: the status and the JSON body. */
export interface RouteAnswer {
  status: number;
  body:   unknown;
}

/** A `POST /api/pictures` body, read no further than past the size limit: past it, only how many bytes were declared or read by then. */
export type PictureUpload =
  | { verdict: 'read'; bytes: Uint8Array }
  | { verdict: 'over-limit'; bytes: number };

/** A job's transcript after a cursor, re-read on each call. */
export type TranscriptFollower = () => TranscriptEntry[];

export interface OverseerRoutes {
  /** Read at each request, so a token written after the Baton was won is the one checked. */
  token:        () => string | null;
  /** Read at each request: until it is true, `GET /api/identity` answers 503 `starting`, so a client waiting for the identity waits for the start. */
  started:      () => boolean;
  /** A parsed `ControlCommand` body behind a valid token: 200, 409 worded, 400 or 423. */
  command:      (body: unknown) => Promise<RouteAnswer>;
  /** A verb's body-less `POST /api/nudge` after its write: it only schedules a pass, so it needs no token. */
  onNudge:      () => void;
  state:        () => unknown;
  summary:      () => unknown;
  /** `null` until the first state was published. */
  events:       () => EventBroker | null;
  /** `null` for an unknown job or a cursor that is no `<instance>.<sequence>`. */
  transcriptOf: (jobId: string, after: string | null) => TranscriptFollower | null;
  /** A served job file's text, `null` when the job or the file does not exist. */
  jobFileText:  (jobId: string, fileName: string) => string | null;
  /** A non-empty `POST /api/pictures` body behind a valid token: 200 `{ pictureId, bytes, mediaType }`, or 413 or 415 worded. */
  storePicture: (upload: PictureUpload) => RouteAnswer;
  /** A stored picture's bytes and type, `null` when no picture has the id. */
  picture:      (pictureId: string) => { mediaType: string; bytes: Uint8Array } | null;
  /** The origins allowed to frame the Bridge, read per response: agent-dashboard's. */
  frameOrigins: () => readonly string[];
  /**
   * The Bridge's HTML import, built by `Bun.build` on the first page request and served at `GET /` with its chunks beside it through
   * `fetch`, so every file carries the page CSP: Bun's own HTML route takes no headers. Absent, `GET /` is a 404 like any unknown path.
   */
  page?:        HTMLBundle;
}

export interface OverseerServerRequest {
  portChoice:             OverseerPortChoice;
  identity:               Omit<OverseerIdentity, 'application' | 'watcherProtocolVersion'>;
  routes:                 OverseerRoutes;
  /** The clock a session code's life is measured on. */
  now:                    () => Date;
  /** Overridden by specs, which cannot wait out the production heartbeat. */
  heartbeatMilliseconds?: number;
}

export interface OverseerServer {
  port: number;
  url:  string;
  stop: () => Promise<void>;
}

const LOOPBACK_ADDRESS = '127.0.0.1';
const LOOPBACK_NAMES   = [LOOPBACK_ADDRESS, 'localhost'];

const BEARER_PREFIX = 'Bearer ';
// Cookies ignore the port, so each Overseer on the loopback address names its own.
const SESSION_COOKIE_INFIX = '-session-';
const COOKIE_PAIR_SEPARATOR = ';';

/** What decides who may read: the routes' token, this server's browser sessions and the cookie that names one. */
interface RouteAccess {
  routes:            OverseerRoutes;
  sessions:          BrowserSessions;
  sessionCookieName: string;
}

const HTTP_STATUS = {
  OK:           200,
  BAD_REQUEST:  400,
  UNAUTHORIZED: 401,
  FORBIDDEN:    403,
  NOT_FOUND:    404,
  SERVER_ERROR: 500,
  UNAVAILABLE:  503,
} as const;

const PAGE_INDEX_PATH = '/';
const BUILT_PAGE_INDEX_NAME = 'index.html';

// Job ids and served file names need no percent-decoding, so a segment holding an escape is no route and gets the 404.
const JOB_STREAM_PATH = /^\/api\/jobs\/([\w.-]+)\/stream$/;
const JOB_FILE_PATH   = /^\/api\/jobs\/([\w.-]+)\/files\/([\w.-]+)$/;
const PICTURE_PATH    = /^\/api\/pictures\/([0-9a-f]{64})$/;

function contentSecurityPolicyOf(frameOrigins: readonly string[]): string {
  const frameAncestors = frameOrigins.length === 0 ? '\'none\'' : frameOrigins.join(' ');
  return 'default-src \'self\'; script-src \'self\'; style-src \'self\'; connect-src \'self\'; img-src \'self\' data:; object-src \'none\'; '
    + `base-uri 'none'; form-action 'none'; frame-ancestors ${frameAncestors}`;
}

function jsonResponse(answer: RouteAnswer): Response {
  return Response.json(answer.body, { status: answer.status });
}

function hostIsLoopback(request: Request, port: number): boolean {
  const host = request.headers.get('host');
  return host !== null && LOOPBACK_NAMES.some((name) => host === `${name}:${port}`);
}

/** No Origin, as a server process or a same-origin GET sends it, or the API's own. */
function originIsOwn(request: Request, port: number): boolean {
  const origin = request.headers.get('origin');
  return origin === null || LOOPBACK_NAMES.some((name) => origin === `http://${name}:${port}`);
}

function bearerTokenMatches(request: Request, expectedToken: string | null): boolean {
  const authorization = request.headers.get('authorization');
  if (expectedToken === null || authorization === null || !authorization.startsWith(BEARER_PREFIX)) return false;
  const offered  = Buffer.from(authorization.slice(BEARER_PREFIX.length));
  const expected = Buffer.from(expectedToken);
  return offered.length === expected.length && timingSafeEqual(offered, expected);
}

async function answerCommand(request: Request, routes: OverseerRoutes): Promise<Response> {
  if (!bearerTokenMatches(request, routes.token())) return jsonResponse({ status: HTTP_STATUS.UNAUTHORIZED, body: { refusal: 'unauthorized' } });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ status: HTTP_STATUS.BAD_REQUEST, body: { refusal: 'malformed-body' } });
  }
  return jsonResponse(await routes.command(body));
}

/** A declared length over the limit is not read at all, and a body that runs past it stops being read there, so no memory goes to it. */
async function pictureUploadOf(request: Request, sizeLimitBytes: number): Promise<PictureUpload> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) > sizeLimitBytes) return { verdict: 'over-limit', bytes: Number(declaredLength) };
  if (request.body === null) return { verdict: 'read', bytes: new Uint8Array() };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let readBytes = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    readBytes += read.value.length;
    if (readBytes > sizeLimitBytes) {
      await reader.cancel();
      return { verdict: 'over-limit', bytes: readBytes };
    }
    chunks.push(read.value);
  }
  const bytes = new Uint8Array(readBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { verdict: 'read', bytes };
}

/** The raw body is the picture; what it is and whether it fits is the route's, read from its bytes. */
async function answerPictureUpload(request: Request, routes: OverseerRoutes): Promise<Response> {
  if (!bearerTokenMatches(request, routes.token())) return jsonResponse({ status: HTTP_STATUS.UNAUTHORIZED, body: { refusal: 'unauthorized' } });
  const upload = await pictureUploadOf(request, PICTURE_SIZE_LIMIT_BYTES);
  if (upload.verdict === 'read' && upload.bytes.length === 0) return jsonResponse({ status: HTTP_STATUS.BAD_REQUEST, body: { refusal: 'malformed-body' } });
  return jsonResponse(routes.storePicture(upload));
}

/** Never sniffed, never cached, and sandboxed: a picture is shown as an image and can run nothing. */
function pictureResponse(routes: OverseerRoutes, pictureId: string): Response {
  const picture = routes.picture(pictureId);
  if (picture === null) return jsonResponse({ status: HTTP_STATUS.NOT_FOUND, body: { refusal: 'not-found' } });
  return new Response(new Uint8Array(picture.bytes), {
    headers: {
      'content-type': picture.mediaType, 'x-content-type-options': 'nosniff', 'content-security-policy': 'sandbox', 'cache-control': 'no-store'
    },
  });
}

function unauthorizedResponse(): Response {
  return jsonResponse({ status: HTTP_STATUS.UNAUTHORIZED, body: { refusal: 'unauthorized' } });
}

function sessionCookieNameOf(port: number): string {
  return `${PRODUCT_NAMES.PROGRAM}${SESSION_COOKIE_INFIX}${port}`;
}

function sessionSecretIn(request: Request, cookieName: string): string | null {
  const cookieHeader = request.headers.get('cookie') ?? '';
  for (const pair of cookieHeader.split(COOKIE_PAIR_SEPARATOR)) {
    const separator = pair.indexOf('=');
    if (separator > 0 && pair.slice(0, separator).trim() === cookieName) return pair.slice(separator + 1).trim();
  }
  return null;
}

/** The Bridge's session cookie, or the bearer token a CLI reader holds. Request headers a browser alone would send prove nothing. */
function readerIsAuthorized(request: Request, access: RouteAccess): boolean {
  const sessionSecret = sessionSecretIn(request, access.sessionCookieName);
  return (sessionSecret !== null && access.sessions.holdsSession(sessionSecret)) || bearerTokenMatches(request, access.routes.token());
}

function sessionTokenResponse(routes: OverseerRoutes): Response {
  const token = routes.token();
  return token === null ? unauthorizedResponse() : jsonResponse({ status: HTTP_STATUS.OK, body: { token } });
}

function sessionCodeResponse(request: Request, access: RouteAccess): Response {
  if (!bearerTokenMatches(request, access.routes.token())) return unauthorizedResponse();
  return jsonResponse({ status: HTTP_STATUS.OK, body: { code: access.sessions.issueCode() } });
}

/** The code comes from the JSON body alone, never the URL, so it reaches no address bar, history or request log. */
async function sessionExchangeResponse(request: Request, access: RouteAccess): Promise<Response> {
  let code: unknown;
  try {
    ({ code } = await request.json() as { code?: unknown });
  } catch {
    return unauthorizedResponse();
  }
  const sessionSecret = typeof code === 'string' ? access.sessions.exchangeCode(code) : null;
  if (sessionSecret === null) return unauthorizedResponse();
  const response = jsonResponse({ status: HTTP_STATUS.OK, body: { outcome: 'done' } });
  response.headers.set('set-cookie', `${access.sessionCookieName}=${sessionSecret}; Path=/; HttpOnly; SameSite=Strict`);
  return response;
}

interface EventStreams {
  /** Each open event stream's closer, so a stopping server ends them and its graceful stop is not held open by a client. */
  open:                  Set<() => void>;
  heartbeatMilliseconds: number;
}

/** An SSE response whose writer sends a `: ping` every heartbeat and runs `tick` with it, until the client or the server goes. */
function eventStreamResponse(eventStreams: EventStreams, start: (write: (text: string) => void) => { tick: () => void; stop: () => void }): Response {
  const encoder = new TextEncoder();
  let finish = (): void => undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => controller.enqueue(encoder.encode(text));
      const started = start(write);
      const heartbeat = setInterval(() => {
        write(': ping\n\n');
        started.tick();
      }, eventStreams.heartbeatMilliseconds);
      finish = () => {
        clearInterval(heartbeat);
        started.stop();
        eventStreams.open.delete(close);
      };
      const close = () => {
        finish();
        controller.close();
      };
      eventStreams.open.add(close);
    },
    cancel() {
      finish();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
}

function eventText(event: Pick<OverseerEvent, 'id' | 'kind' | 'data'>): string {
  return `id: ${event.id}\nevent: ${event.kind}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function eventsResponse(request: Request, routes: OverseerRoutes, eventStreams: EventStreams): Response {
  const broker = routes.events();
  if (broker === null) return jsonResponse({ status: HTTP_STATUS.NOT_FOUND, body: { refusal: 'not-ready' } });
  return eventStreamResponse(eventStreams, (write) => {
    const replay = broker.replayAfter(request.headers.get('last-event-id'));
    const snapshot = broker.snapshot();
    if (replay.verdict === 'replayed') replay.events.forEach((event) => write(eventText(event)));
    else if (snapshot !== null) write(eventText(snapshot));
    const unsubscribe = broker.subscribe((event) => write(eventText(event)));
    return { tick: () => undefined, stop: unsubscribe };
  });
}

function transcriptResponse(request: Request, routes: OverseerRoutes, jobId: string, eventStreams: EventStreams): Response {
  const after = request.headers.get('last-event-id') ?? new URL(request.url).searchParams.get('after');
  const follow = routes.transcriptOf(jobId, after);
  if (follow === null) return jsonResponse({ status: HTTP_STATUS.NOT_FOUND, body: { refusal: 'not-found' } });
  return eventStreamResponse(eventStreams, (write) => {
    const history = follow();
    const lastCursor = history.at(-1)?.cursor ?? after ?? '';
    write(`id: ${lastCursor}\nevent: history\ndata: ${JSON.stringify(history)}\n\n`);
    const sendNew = () => follow().forEach((entry) => write(`id: ${entry.cursor}\nevent: message\ndata: ${JSON.stringify(entry)}\n\n`));
    const unsubscribe = routes.events()?.subscribe(sendNew) ?? (() => undefined);
    return { tick: sendNew, stop: unsubscribe };
  });
}

function jobFileResponse(routes: OverseerRoutes, jobId: string, fileName: string): Response {
  const text = SERVED_JOB_FILE_NAMES.includes(fileName) ? routes.jobFileText(jobId, fileName) : null;
  if (text === null) return jsonResponse({ status: HTTP_STATUS.NOT_FOUND, body: { refusal: 'not-found' } });
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8', 'content-security-policy': 'sandbox' } });
}

/** The built Bridge's files by the path each is served at: the page at `/`, every chunk at its own name. */
type BuiltPageFiles = ReadonlyMap<string, Blob>;

type BuiltPageOutcome =
  | { verdict: 'built'; files: BuiltPageFiles }
  | { verdict: 'failed' };

async function buildPage(page: HTMLBundle): Promise<BuiltPageOutcome> {
  const built = await Bun.build({
    entrypoints: [page.index],
    target:      'browser',
    minify:      true,
    define:      { 'process.env.NODE_ENV': '"production"' },
    jsx:         { development: false },
    throw:       false,
  });
  if (!built.success) return { verdict: 'failed' };
  const files = new Map<string, Blob>();
  for (const output of built.outputs) {
    const fileName = output.path.replace(/^\.\//, '');
    files.set(fileName === BUILT_PAGE_INDEX_NAME ? PAGE_INDEX_PATH : `/${fileName}`, output);
  }
  return { verdict: 'built', files };
}

/** Builds the page on the first request and hands every later one that build; a failed build is retried by the next request. */
function pageFilesOf(page: HTMLBundle): () => Promise<BuiltPageOutcome> {
  let building: Promise<BuiltPageOutcome> | null = null;
  return async () => {
    building ??= buildPage(page);
    const outcome = await building;
    if (outcome.verdict === 'failed') building = null;
    return outcome;
  };
}

function notFoundResponse(): Response {
  return jsonResponse({ status: HTTP_STATUS.NOT_FOUND, body: { refusal: 'not-found' } });
}

async function pageFileResponse(pageFiles: () => Promise<BuiltPageOutcome>, pathname: string): Promise<Response> {
  const outcome = await pageFiles();
  if (outcome.verdict === 'failed') return jsonResponse({ status: HTTP_STATUS.SERVER_ERROR, body: { refusal: 'page-build-failed' } });
  const file = outcome.files.get(pathname);
  return file === undefined ? notFoundResponse() : new Response(file, { headers: { 'content-type': file.type } });
}

type PageFiles = (() => Promise<BuiltPageOutcome>) | null;

/** The routes that answer board data, each behind `readerIsAuthorized`; `null` for any other request. */
function dataRouteOf(request: Request, routes: OverseerRoutes, eventStreams: EventStreams): (() => Response) | null {
  const { pathname } = new URL(request.url);
  if (request.method !== 'GET') return null;
  if (pathname === '/api/session-token') return () => sessionTokenResponse(routes);
  if (pathname === '/api/state') return () => jsonResponse({ status: HTTP_STATUS.OK, body: routes.state() });
  if (pathname === '/api/events') return () => eventsResponse(request, routes, eventStreams);
  const jobStreamId = JOB_STREAM_PATH.exec(pathname)?.[1];
  if (jobStreamId !== undefined) return () => transcriptResponse(request, routes, jobStreamId, eventStreams);
  const [, jobId, fileName] = JOB_FILE_PATH.exec(pathname) ?? [];
  if (jobId !== undefined && fileName !== undefined) return () => jobFileResponse(routes, jobId, fileName);
  const pictureId = PICTURE_PATH.exec(pathname)?.[1];
  if (pictureId !== undefined) return () => pictureResponse(routes, pictureId);
  return null;
}

function routeOf(request: Request, access: RouteAccess, identity: OverseerIdentity, eventStreams: EventStreams, pageFiles: PageFiles): Response | Promise<Response> {
  const { routes } = access;
  const { pathname } = new URL(request.url);
  const { method } = request;
  const dataRoute = dataRouteOf(request, routes, eventStreams);
  if (dataRoute !== null) return readerIsAuthorized(request, access) ? dataRoute() : unauthorizedResponse();
  if (method === 'GET' && pathname === '/api/identity') {
    return routes.started()
      ? jsonResponse({ status: HTTP_STATUS.OK, body: identity })
      : jsonResponse({ status: HTTP_STATUS.UNAVAILABLE, body: { refusal: 'starting' } });
  }
  if (method === 'GET' && pathname === '/api/summary') return jsonResponse({ status: HTTP_STATUS.OK, body: routes.summary() });
  if (method === 'POST' && pathname === '/api/session-codes') return sessionCodeResponse(request, access);
  if (method === 'POST' && pathname === '/api/session') return sessionExchangeResponse(request, access);
  if (method === 'POST' && pathname === '/api/commands') return answerCommand(request, routes);
  if (method === 'POST' && pathname === '/api/pictures') return answerPictureUpload(request, routes);
  if (method === 'POST' && pathname === '/api/nudge') {
    routes.onNudge();
    return jsonResponse({ status: HTTP_STATUS.OK, body: { outcome: 'done' } });
  }
  if (method === 'GET' && pageFiles !== null && !pathname.startsWith('/api/')) return pageFileResponse(pageFiles, pathname);
  return notFoundResponse();
}

/** A served job file's and a picture's own sandbox policy stands; every other answer carries the page's. */
function withPagePolicy(response: Response, frameOrigins: readonly string[]): Response {
  if (!response.headers.has('content-security-policy')) response.headers.set('content-security-policy', contentSecurityPolicyOf(frameOrigins));
  return response;
}

function start(serverRequest: OverseerServerRequest): OverseerServer {
  const { routes } = serverRequest;
  const eventStreams: EventStreams = {
    open:                  new Set(),
    heartbeatMilliseconds: serverRequest.heartbeatMilliseconds ?? SSE_HEARTBEAT_SECONDS * MILLISECONDS_PER_SECOND,
  };
  const sessions = BrowserSessions.createBrowserSessions(serverRequest.now);
  const pageFiles = routes.page === undefined ? null : pageFilesOf(routes.page);
  const identity: OverseerIdentity = { application: PRODUCT_NAMES.PROGRAM, ...serverRequest.identity, watcherProtocolVersion: WATCHER_PROTOCOL_VERSION };
  const server = OverseerPort.bindFirstFree(serverRequest.portChoice, (port) => Bun.serve({
    hostname:    LOOPBACK_ADDRESS,
    port,
    reusePort:   false,
    development: false,
    async fetch(request, ownServer) {
      const boundPort = ownServer.port ?? port;
      const frameOrigins = routes.frameOrigins();
      // A preflight is refused like a foreign Origin: no route answers one, so no browser of another origin may send a write.
      if (!hostIsLoopback(request, boundPort) || !originIsOwn(request, boundPort) || request.method === 'OPTIONS') {
        return withPagePolicy(jsonResponse({ status: HTTP_STATUS.FORBIDDEN, body: { refusal: 'forbidden' } }), frameOrigins);
      }
      // A stream is quiet between events by design, so Bun's idle timeout is off for it rather than left to the heartbeat's timing.
      const { pathname } = new URL(request.url);
      if (pathname === '/api/events' || JOB_STREAM_PATH.test(pathname)) ownServer.timeout(request, 0);
      const access: RouteAccess = { routes, sessions, sessionCookieName: sessionCookieNameOf(boundPort) };
      return withPagePolicy(await routeOf(request, access, identity, eventStreams, pageFiles), frameOrigins);
    },
  }));
  const boundPort = server.port ?? 0;
  return {
    port: boundPort,
    url:  `http://${LOOPBACK_ADDRESS}:${boundPort}/`,
    // Graceful: the answer to the `overseer-stop` that ended the Overseer is still in flight when the listener closes.
    stop: async () => {
      for (const close of [...eventStreams.open]) close();
      await server.stop(false);
    },
  };
}

export const OverseerServer = Object.freeze({ start, pictureUploadOf });
