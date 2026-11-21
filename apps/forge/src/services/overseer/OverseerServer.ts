/**
 * The Overseer's HTTP and SSE API on 127.0.0.1, design section 9.3. Every request needs a loopback Host, against DNS rebinding; one whose
 * Origin is not the API's own, a preflight above all, gets 403 and no route sends CORS headers, so the token never reaches another
 * origin's page. `GET /api/versions` answers at every moment, and each endpoint the compatibility registry serves also answers at its
 * `/api/v<n>/<endpoint>`, through its unversioned route. The versions, the identity, the summary and the nudge are open; every other
 * route needs the bearer token, the only credential there is. Every answer carries `API_CONTENT_SECURITY_POLICY`, a served file and a
 * picture a sandbox of their own. A 401, a 403 and a read route's 500 answer `{refusal, text}`. What a command does, and how a refusal
 * is worded, is the command surface's.
 */
import { timingSafeEqual } from 'node:crypto';

import type { BoardStreamHandshake }                         from 'forge-contracts/BoardStreamHandshake';
import { FORGE_COMPATIBILITY_REGISTRY }                      from 'forge-contracts/ForgeCompatibilityRegistry';
import { FORGE_SYSTEM_VERSIONS }                             from 'forge-contracts/ForgeSystemVersions';
import type { IdentityDocument }                             from 'forge-contracts/IdentityDocument';
import type { MonitorEventDocument, MonitorStreamHandshake } from 'forge-contracts/MonitorSnapshotDocument';
import type { EndpointEntry }                                from 'system-versions/CompatibilityEntry';
import { CompatibilityRegistryUtil }                         from 'system-versions/CompatibilityRegistryUtil';
import type { SystemVersion, VersionsDocument }              from 'system-versions/VersionsDocument';

import { TALOS_PROTOCOL_VERSION }                     from '../../lib/talos/constants/TalosProtocol.ts';
import type { TranscriptEntry }                       from '../../shared/@types/TranscriptEntry.ts';
import { IDENTITY_VERSION, SERVED_CONTRACT_VERSIONS } from '../../shared/constants/OverseerApiContracts.ts';
import {
  FLINT_BRAIN_DIGEST_SIZE_LIMIT_BYTES,
  PICTURE_SIZE_LIMIT_BYTES,
  PROFILE_OUTPUT_FOLLOW_MILLISECONDS,
  SERVED_JOB_FILE_NAMES,
  SSE_HEARTBEAT_SECONDS
} from '../../shared/constants/OverseerLimits.ts';
import { PRODUCT_NAMES }                         from '../../shared/constants/ProductNames.ts';
import type { MonitorSnapshot }                  from '../../shared/monitor/@types/MonitorSnapshot.ts';
import type { EventBroker, OverseerEvent }       from './EventBroker.ts';
import type { GateProfileOutputFollower }        from './GateProfiling.ts';
import type { MonitorStream }                    from './MonitorStream.ts';
import { OverseerPort, type OverseerPortChoice } from './OverseerPort.ts';
import { MILLISECONDS_PER_SECOND }               from './constants/TimeUnits.ts';

/** The package's identity, but for `application`: the program's name, which a build linked beside the released program changes. */
export interface OverseerIdentity extends Omit<IdentityDocument, 'application'> {
  identityVersion:      typeof IDENTITY_VERSION;
  application:          string;
  trackerId:            string;
  project:              string;
  codeVersion:          string;
  installVersion:       number;
  talosProtocolVersion: number;
  processId:            number;
  /** The version of each API contract this program serves; a contract it does not serve has no key. */
  contracts:            typeof SERVED_CONTRACT_VERSIONS;
}

/** What a 401, a 403 or a 500 refuses, which the routes word as `text` beside it. */
export type ServerRefusal = 'unauthorized' | 'forbidden' | 'read-failed' | 'malformed-body';

/** A route's answer: the status and the JSON body. */
export interface RouteAnswer {
  status: number;
  body:   unknown;
}

/** A request body read no further than past its size limit: past it, only how many bytes were declared or read by then. */
export type BoundedBody =
  | { verdict: 'read'; bytes: Uint8Array }
  | { verdict: 'over-limit'; bytes: number };

/** A `POST /api/pictures` body, bounded by the picture size limit. */
export type PictureUpload = BoundedBody;

/** A job's transcript after a cursor, re-read on each call. */
export type TranscriptFollower = () => TranscriptEntry[];

export interface OverseerRoutes {
  /** Read at each request, so a token written after the Baton was won is the one checked. */
  token:           () => string | null;
  /** Read at each request: until it is true, `GET /api/identity` answers 503 `starting`, so a client waiting for the identity waits for the start. */
  started:         () => boolean;
  /** A parsed `ControlCommand` body behind a valid token: 200, 409 worded, 400 or 423. */
  command:         (body: unknown) => Promise<RouteAnswer>;
  /** A parsed digest for Flint's brain behind the token: the brain's move, or why the rule director moves. */
  askFlintBrain:   (body: unknown) => Promise<RouteAnswer>;
  /** A verb's body-less `POST /api/nudge` after its write: it only schedules a pass, so it needs no token. */
  onNudge:         () => void;
  /** `GET /api/state`: the command line's own reading, served at no versioned path. */
  state:           () => unknown;
  /** `GET /api/board`: the contract's `ForgeBoardDocument`, built from the same reading as `state`. */
  board:           () => unknown;
  summary:         () => unknown;
  /** `GET /api/monitor`: 200 and the `MonitorSnapshot`, or 503 `starting` before the Overseer knows its generation. */
  monitor:         () => RouteAnswer;
  /** `GET /api/presence`: 200 and the `ForgePresenceDocument`, or 503 `starting` before this generation's presence is written. */
  presence:        () => RouteAnswer;
  /** `GET /api/crash-log?number=<n>`, the newest log without the query: 200 and the `ForgeCrashLogDocument`, or 404 `no-crash-log`. */
  crashLog:        (writtenNumber: string | null) => RouteAnswer;
  /** `null` until the first monitor snapshot was published. */
  monitorStream:   () => MonitorStream | null;
  /** The sentence beside a 401, a 403 or a 500. */
  refusalTextOf:   (refusal: ServerRefusal) => string;
  /** `null` until the first state was published. */
  events:          () => EventBroker | null;
  /** `null` for an unknown job or a cursor that is no `<instance>.<sequence>`. */
  transcriptOf:    (jobId: string, after: string | null) => TranscriptFollower | null;
  /** `null` for a run the board does not hold, or a cursor that is no whole line number. */
  profileOutputOf: (profileRunId: string, after: string | null) => GateProfileOutputFollower | null;
  /** A served job file's text, `null` when the job or the file does not exist. */
  jobFileText:     (jobId: string, fileName: string) => string | null;
  /** A non-empty `POST /api/pictures` body behind a valid token: 200 `{ pictureId, bytes, mediaType }`, or 413 or 415 worded. */
  storePicture:    (upload: PictureUpload) => RouteAnswer;
  /** A stored picture's bytes and type, `null` when no picture has the id. */
  picture:         (pictureId: string) => { mediaType: string; bytes: Uint8Array } | null;
}

export interface OverseerServerRequest {
  portChoice:             OverseerPortChoice;
  identity:               Omit<OverseerIdentity, 'identityVersion' | 'application' | 'talosProtocolVersion' | 'contracts'>;
  routes:                 OverseerRoutes;
  /** Overridden by specs, which cannot wait out the production heartbeat. */
  heartbeatMilliseconds?: number;
  /** Overridden by specs, like the heartbeat. */
  followMilliseconds?:    number;
  /** What `GET /api/versions` answers and the monitor stream carries; `FORGE_SYSTEM_VERSIONS` unless a client's recording overrides it. */
  versions?:              VersionsDocument;
}

export interface OverseerServer {
  port: number;
  url:  string;
  stop: () => Promise<void>;
}

const LOOPBACK_ADDRESS = '127.0.0.1';
const LOOPBACK_NAMES   = [LOOPBACK_ADDRESS, 'localhost'];

const BEARER_PREFIX = 'Bearer ';
const HTTP_STATUS = {
  OK:           200,
  BAD_REQUEST:  400,
  UNAUTHORIZED: 401,
  FORBIDDEN:    403,
  NOT_FOUND:    404,
  TOO_LARGE:    413,
  SERVER_ERROR: 500,
  UNAVAILABLE:  503,
} as const;

// Job ids and served file names need no percent-decoding, so a segment holding an escape is no route and gets the 404.
const JOB_STREAM_PATH = /^\/api\/jobs\/([\w.-]+)\/stream$/;
const JOB_FILE_PATH   = /^\/api\/jobs\/([\w.-]+)\/files\/([\w.-]+)$/;
const PICTURE_PATH    = /^\/api\/pictures\/([0-9a-f]{64})$/;
const PROFILE_STREAM_PATH = /^\/api\/profiles\/([\w.-]+)\/stream$/;

const API_PATH_PREFIX     = '/api/';
const VERSIONS_PATH       = '/api/versions';
const VERSIONED_PATH      = /^\/api\/v([1-9]\d*)\/(.+)$/;
const EVENTS_PATH         = '/api/events';
const MONITOR_PATH        = '/api/monitor';
const PRESENCE_PATH       = '/api/presence';
const BOARD_PATH          = '/api/board';
const CRASH_LOG_PATH      = '/api/crash-log';
const CRASH_LOG_NUMBER_PARAMETER = 'number';
const MONITOR_EVENTS_PATH = '/api/monitor/events';
// Unversioned and in no registry entry.
const FLINT_BRAIN_ASK_PATH = '/api/flint-brain/ask';

/** The API serves no page: an answer may load nothing, post nowhere and sit in no frame. */
const API_CONTENT_SECURITY_POLICY = 'default-src \'none\'; frame-ancestors \'none\'; base-uri \'none\'; form-action \'none\'';

function jsonResponse(answer: RouteAnswer): Response {
  return Response.json(answer.body, { status: answer.status });
}

const STATUS_OF_SERVER_REFUSAL: Readonly<Record<ServerRefusal, number>> = {
  'unauthorized':   HTTP_STATUS.UNAUTHORIZED,
  'forbidden':      HTTP_STATUS.FORBIDDEN,
  'read-failed':    HTTP_STATUS.SERVER_ERROR,
  'malformed-body': HTTP_STATUS.BAD_REQUEST,
};

function refusalResponse(routes: OverseerRoutes, refusal: ServerRefusal): Response {
  return jsonResponse({ status: STATUS_OF_SERVER_REFUSAL[refusal], body: { refusal, text: routes.refusalTextOf(refusal) } });
}

function unauthorizedResponse(routes: OverseerRoutes): Response {
  return refusalResponse(routes, 'unauthorized');
}

/** A read route that throws, as on a malformed board file, answers its refusal rather than Bun's plain-text 500. */
function readAnswerOf(routes: OverseerRoutes, answer: () => Response): Response {
  try {
    return answer();
  } catch {
    return refusalResponse(routes, 'read-failed');
  }
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
  if (!bearerTokenMatches(request, routes.token())) return unauthorizedResponse(routes);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({
      status: HTTP_STATUS.BAD_REQUEST,
      body:   {
        controlVersion: SERVED_CONTRACT_VERSIONS.control, refusal: 'malformed-body', fields: {}, text: routes.refusalTextOf('malformed-body')
      },
    });
  }
  return jsonResponse(await routes.command(body));
}

/** A declared length over the limit is not read at all, and a body that runs past it stops being read there, so no memory goes to it. */
async function boundedBodyOf(request: Request, sizeLimitBytes: number): Promise<BoundedBody> {
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
  if (!bearerTokenMatches(request, routes.token())) return unauthorizedResponse(routes);
  const upload = await boundedBodyOf(request, PICTURE_SIZE_LIMIT_BYTES);
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

/** The digest is read no further than its size limit; past it, or as no JSON, nothing reaches the brain. */
async function answerFlintBrainAsk(request: Request, routes: OverseerRoutes): Promise<Response> {
  if (!bearerTokenMatches(request, routes.token())) return unauthorizedResponse(routes);
  const body = await boundedBodyOf(request, FLINT_BRAIN_DIGEST_SIZE_LIMIT_BYTES);
  if (body.verdict === 'over-limit') return jsonResponse({ status: HTTP_STATUS.TOO_LARGE, body: { refusal: 'too-large' } });
  let digest: unknown;
  try {
    digest = JSON.parse(new TextDecoder().decode(body.bytes));
  } catch {
    return refusalResponse(routes, 'malformed-body');
  }
  return jsonResponse(await routes.askFlintBrain(digest));
}

export interface EventStreams {
  /** Each open event stream's closer, so a stopping server ends them and its graceful stop is not held open by a client. */
  open:                  Set<() => void>;
  heartbeatMilliseconds: number;
  /** How often a profile stream reads its run's output again; a schedule only. */
  followMilliseconds:    number;
}

function eventStreamsOf(timing: { heartbeatMilliseconds?: number; followMilliseconds?: number }): EventStreams {
  return {
    open:                  new Set(),
    heartbeatMilliseconds: timing.heartbeatMilliseconds ?? SSE_HEARTBEAT_SECONDS * MILLISECONDS_PER_SECOND,
    followMilliseconds:    timing.followMilliseconds ?? PROFILE_OUTPUT_FOLLOW_MILLISECONDS,
  };
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

/** Every stream opens with it; it carries no id, so it never moves a client's `Last-Event-ID` and a reconnect still replays. */
function handshakeEventText(systemVersion: SystemVersion): string {
  const handshake: BoardStreamHandshake & MonitorStreamHandshake = { systemVersion };
  return `event: handshake\ndata: ${JSON.stringify(handshake)}\n\n`;
}

function eventsResponse(request: Request, routes: OverseerRoutes, eventStreams: EventStreams, systemVersion: SystemVersion): Response {
  const broker = routes.events();
  if (broker === null) return jsonResponse({ status: HTTP_STATUS.NOT_FOUND, body: { refusal: 'not-ready' } });
  return eventStreamResponse(eventStreams, (write) => {
    write(handshakeEventText(systemVersion));
    const replay = broker.replayAfter(request.headers.get('last-event-id'));
    const snapshot = broker.snapshot();
    if (replay.verdict === 'replayed') replay.events.forEach((event) => write(eventText(event)));
    else if (snapshot !== null) write(eventText(snapshot));
    const unsubscribe = broker.subscribe((event) => write(eventText(event)));
    return { tick: () => undefined, stop: unsubscribe };
  });
}

function monitorEventText(snapshot: MonitorSnapshot, systemVersion: SystemVersion): string {
  const event: MonitorEventDocument = { ...snapshot, systemVersion };
  return `event: monitor\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * The handshake, then a whole snapshot on connect, then each one that changed, every event naming the system version: an Overseer a Baton
 * pass brings may be another version. No ids and no replay, since every event is whole.
 */
function monitorEventsResponse(routes: OverseerRoutes, eventStreams: EventStreams, systemVersion: SystemVersion): Response {
  const monitorStream = routes.monitorStream();
  const latest = monitorStream?.latest() ?? null;
  if (monitorStream === null || latest === null) return jsonResponse({ status: HTTP_STATUS.NOT_FOUND, body: { refusal: 'not-ready' } });
  return eventStreamResponse(eventStreams, (write) => {
    write(handshakeEventText(systemVersion));
    write(monitorEventText(latest, systemVersion));
    const unsubscribe = monitorStream.subscribe((snapshot) => write(monitorEventText(snapshot, systemVersion)));
    return { tick: () => undefined, stop: unsubscribe };
  });
}

/** What a stream route needs beyond the request: the routes, the open streams, and the system version its handshake names. */
interface StreamContext {
  routes:        OverseerRoutes;
  eventStreams:  EventStreams;
  systemVersion: SystemVersion;
}

function transcriptResponse(request: Request, jobId: string, { routes, eventStreams, systemVersion }: StreamContext): Response {
  const after = request.headers.get('last-event-id') ?? new URL(request.url).searchParams.get('after');
  const follow = routes.transcriptOf(jobId, after);
  if (follow === null) return jsonResponse({ status: HTTP_STATUS.NOT_FOUND, body: { refusal: 'not-found' } });
  return eventStreamResponse(eventStreams, (write) => {
    write(handshakeEventText(systemVersion));
    const history = follow();
    const lastCursor = history.at(-1)?.cursor ?? after ?? '';
    write(`id: ${lastCursor}\nevent: history\ndata: ${JSON.stringify(history)}\n\n`);
    const sendNew = () => follow().forEach((entry) => write(`id: ${entry.cursor}\nevent: message\ndata: ${JSON.stringify(entry)}\n\n`));
    const unsubscribe = routes.events()?.subscribe(sendNew) ?? (() => undefined);
    return { tick: sendNew, stop: unsubscribe };
  });
}

/**
 * A gate profile's output: each line after the cursor, then each line appended later, as a `line` event with its line number as the id.
 * The output is read on its own schedule, never from the board's events, so the board event stream carries no output line.
 */
function profileOutputResponse(request: Request, profileRunId: string, { routes, eventStreams, systemVersion }: StreamContext): Response {
  const after = request.headers.get('last-event-id') ?? new URL(request.url).searchParams.get('after');
  const follow = routes.profileOutputOf(profileRunId, after);
  if (follow === null) return jsonResponse({ status: HTTP_STATUS.NOT_FOUND, body: { refusal: 'not-found' } });
  return eventStreamResponse(eventStreams, (write) => {
    write(handshakeEventText(systemVersion));
    const sendNew = () => follow().forEach((line) => write(`id: ${line.lineNumber}\nevent: line\ndata: ${JSON.stringify({ text: line.text })}\n\n`));
    sendNew();
    const following = setInterval(sendNew, eventStreams.followMilliseconds);
    return { tick: () => undefined, stop: () => clearInterval(following) };
  });
}

function jobFileResponse(routes: OverseerRoutes, jobId: string, fileName: string): Response {
  const text = SERVED_JOB_FILE_NAMES.includes(fileName) ? routes.jobFileText(jobId, fileName) : null;
  if (text === null) return jsonResponse({ status: HTTP_STATUS.NOT_FOUND, body: { refusal: 'not-found' } });
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8', 'content-security-policy': 'sandbox' } });
}

function notFoundResponse(): Response {
  return jsonResponse({ status: HTTP_STATUS.NOT_FOUND, body: { refusal: 'not-found' } });
}

/** The routes that answer board data, each behind the bearer token; `null` for any other request. */
function dataRouteOf(request: Request, routes: OverseerRoutes, eventStreams: EventStreams, systemVersion: SystemVersion): (() => Response) | null {
  const { pathname, searchParams } = new URL(request.url);
  if (request.method !== 'GET') return null;
  const streamContext: StreamContext = { routes, eventStreams, systemVersion };
  if (pathname === '/api/state') return () => jsonResponse({ status: HTTP_STATUS.OK, body: routes.state() });
  if (pathname === BOARD_PATH) return () => jsonResponse({ status: HTTP_STATUS.OK, body: routes.board() });
  if (pathname === EVENTS_PATH) return () => eventsResponse(request, routes, eventStreams, systemVersion);
  if (pathname === MONITOR_PATH) return () => jsonResponse(routes.monitor());
  if (pathname === PRESENCE_PATH) return () => jsonResponse(routes.presence());
  if (pathname === CRASH_LOG_PATH) return () => jsonResponse(routes.crashLog(searchParams.get(CRASH_LOG_NUMBER_PARAMETER)));
  if (pathname === MONITOR_EVENTS_PATH) return () => monitorEventsResponse(routes, eventStreams, systemVersion);
  const jobStreamId = JOB_STREAM_PATH.exec(pathname)?.[1];
  if (jobStreamId !== undefined) return () => transcriptResponse(request, jobStreamId, streamContext);
  const profileRunId = PROFILE_STREAM_PATH.exec(pathname)?.[1];
  if (profileRunId !== undefined) return () => profileOutputResponse(request, profileRunId, streamContext);
  const [, jobId, fileName] = JOB_FILE_PATH.exec(pathname) ?? [];
  if (jobId !== undefined && fileName !== undefined) return () => jobFileResponse(routes, jobId, fileName);
  const pictureId = PICTURE_PATH.exec(pathname)?.[1];
  if (pictureId !== undefined) return () => pictureResponse(routes, pictureId);
  return null;
}

/** What the open routes answer as they are: the identity and the system versions. */
interface OpenDocuments {
  identity: OverseerIdentity;
  versions: VersionsDocument;
}

function routeOf(request: Request, routes: OverseerRoutes, documents: OpenDocuments, eventStreams: EventStreams): Response | Promise<Response> {
  const { pathname } = new URL(request.url);
  const { method } = request;
  // Before the identity's 503: a client of any version asks this first, also while the Overseer starts.
  if (method === 'GET' && pathname === VERSIONS_PATH) return jsonResponse({ status: HTTP_STATUS.OK, body: documents.versions });
  const dataRoute = dataRouteOf(request, routes, eventStreams, documents.versions.current);
  if (dataRoute !== null) return bearerTokenMatches(request, routes.token()) ? readAnswerOf(routes, dataRoute) : unauthorizedResponse(routes);
  if (method === 'GET' && pathname === '/api/identity') {
    return routes.started()
      ? jsonResponse({ status: HTTP_STATUS.OK, body: documents.identity })
      : jsonResponse({ status: HTTP_STATUS.UNAVAILABLE, body: { refusal: 'starting' } });
  }
  if (method === 'GET' && pathname === '/api/summary') return readAnswerOf(routes, () => jsonResponse({ status: HTTP_STATUS.OK, body: routes.summary() }));
  if (method === 'POST' && pathname === '/api/commands') return answerCommand(request, routes);
  if (method === 'POST' && pathname === FLINT_BRAIN_ASK_PATH) return answerFlintBrainAsk(request, routes);
  if (method === 'POST' && pathname === '/api/pictures') return answerPictureUpload(request, routes);
  if (method === 'POST' && pathname === '/api/nudge') {
    routes.onNudge();
    return jsonResponse({ status: HTTP_STATUS.OK, body: { outcome: 'done' } });
  }
  return notFoundResponse();
}

/** A served job file's and a picture's own sandbox policy stands; every other answer carries the API's. */
function withApiPolicy(response: Response): Response {
  if (!response.headers.has('content-security-policy')) response.headers.set('content-security-policy', API_CONTENT_SECURITY_POLICY);
  return response;
}

/** What answers a request: the server's routes, identity and open streams, kept apart from the socket. */
export interface OverseerRequestHandler {
  /** Answers one request as the server bound at `boundPort` does; `holdOpen` turns the idle timeout off for a stream that is quiet by design. */
  answer:           (request: Request, boundPort: number, holdOpen?: () => void) => Promise<Response>;
  closeEveryStream: () => void;
}

/** Each endpoint served at a versioned path: every registry entry that a client of a supported version needs. */
function servedEndpointsOf(versions: VersionsDocument): readonly EndpointEntry[] {
  const removable = CompatibilityRegistryUtil.removableAt(FORGE_COMPATIBILITY_REGISTRY, versions.minimumSupported);
  return FORGE_COMPATIBILITY_REGISTRY.flatMap((entry) => (entry.kind === 'endpoint' && !removable.includes(entry) ? [entry] : []));
}

/**
 * The request at its unversioned path, which every route answers: a `/api/v<n>/<path>` a served endpoint names, by its template, becomes
 * `/api/<path>`, keeping its method, headers and body, so the token, CSP and stream rules are the unversioned route's. `null`
 * for a version or a path not served.
 */
function requestAtUnversionedPath(request: Request, servedEndpoints: readonly EndpointEntry[]): Request | null {
  const url = new URL(request.url);
  const [, version, endpointPath] = VERSIONED_PATH.exec(url.pathname) ?? [];
  if (version === undefined || endpointPath === undefined) return request;
  if (CompatibilityRegistryUtil.endpointEntryForPath(servedEndpoints, endpointPath, Number(version)) === null) return null;
  url.pathname = `${API_PATH_PREFIX}${endpointPath}`;
  return new Request(url.href, request);
}

/** Every request but a stream is answered within the idle timeout; a stream stays open, between its heartbeats, until a side ends it. */
function pathIsStream(pathname: string): boolean {
  return pathname === EVENTS_PATH || pathname === MONITOR_EVENTS_PATH || JOB_STREAM_PATH.test(pathname) || PROFILE_STREAM_PATH.test(pathname);
}

function requestHandlerOf(serverRequest: OverseerServerRequest): OverseerRequestHandler {
  const { routes } = serverRequest;
  const eventStreams = eventStreamsOf(serverRequest);
  const versions = serverRequest.versions ?? FORGE_SYSTEM_VERSIONS;
  const servedEndpoints = servedEndpointsOf(versions);
  const identity: OverseerIdentity = {
    identityVersion:      IDENTITY_VERSION,
    application:          PRODUCT_NAMES.PROGRAM,
    ...serverRequest.identity,
    talosProtocolVersion: TALOS_PROTOCOL_VERSION,
    contracts:            SERVED_CONTRACT_VERSIONS,
  };
  return {
    answer: async (request, boundPort, holdOpen) => {
      // A preflight is refused like a foreign Origin: no route answers one, so no browser of another origin may send a write.
      if (!hostIsLoopback(request, boundPort) || !originIsOwn(request, boundPort) || request.method === 'OPTIONS') {
        return withApiPolicy(refusalResponse(routes, 'forbidden'));
      }
      const routedRequest = requestAtUnversionedPath(request, servedEndpoints);
      if (routedRequest === null) return withApiPolicy(notFoundResponse());
      if (pathIsStream(new URL(routedRequest.url).pathname)) holdOpen?.();
      return withApiPolicy(await routeOf(routedRequest, routes, { identity, versions }, eventStreams));
    },
    closeEveryStream: () => {
      for (const close of [...eventStreams.open]) close();
    },
  };
}

function start(serverRequest: OverseerServerRequest): OverseerServer {
  const handler = requestHandlerOf(serverRequest);
  const server = OverseerPort.bindFirstFree(serverRequest.portChoice, (port) => Bun.serve({
    hostname:    LOOPBACK_ADDRESS,
    port,
    reusePort:   false,
    development: false,
    // A stream is quiet between events by design, so Bun's idle timeout is off for it rather than left to the heartbeat's timing.
    fetch:       (request, ownServer) => handler.answer(request, ownServer.port ?? port, () => ownServer.timeout(request, 0)),
  }));
  const boundPort = server.port ?? 0;
  return {
    port: boundPort,
    url:  `http://${LOOPBACK_ADDRESS}:${boundPort}/`,
    // Graceful: the answer to the `overseer-stop` that ended the Overseer is still in flight when the listener closes.
    stop: async () => {
      handler.closeEveryStream();
      await server.stop(false);
    },
  };
}

export const OverseerServer = Object.freeze({
  API_CONTENT_SECURITY_POLICY, start, requestHandlerOf, boundedBodyOf, dataRouteOf, eventStreamsOf, pathIsStream
});
