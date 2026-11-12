/**
 * Gaia's server on 127.0.0.1 (PLAN 8.1): every request passes the Host and Origin guards, each route its own guard, and every answer
 * carries the page's CSP, a refusal and a failure included. It writes a fresh token before it listens and the server record once it does,
 * removes the record when it stops, and refuses to start where Gaia already answers.
 */
import { createServerRecordWriter }                                                                from '../../adapters/gaia-files/ServerRecordWriter.ts';
import type { FileRemoveVerdict }                                                                  from '../../adapters/gaia-files/utils/GaiaFileWriteUtil.ts';
import { LOOPBACK_ANY_PORT_FRAME_SOURCE, pageContentSecurityPolicyFor, withContentSecurityPolicy } from '../../lib/local-http-guards/ContentSecurityPolicy.ts';
import { hostGuardVerdictFor }                                                                     from '../../lib/local-http-guards/HostGuard.ts';
import { originGuardVerdictFor }                                                                   from '../../lib/local-http-guards/OriginGuard.ts';
import { createSessionCodes, type SessionCodes }                                                   from '../../lib/local-http-guards/SessionCodes.ts';
import { bearerTokenMatches }                                                                      from '../../lib/local-http-guards/TokenCheck.ts';
import { monotonicMillisecondsOfNow }                                                              from '../../services/Clock.ts';
import type { FleetStore }                                                                         from '../../services/FleetStore.ts';
import type { WatchTimers }                                                                        from '../../services/ForgeWatch.ts';
import { createFleetBroker, type FleetBroker }                                                     from './FleetBroker.ts';
import { healthProbeVerdictFor, HEALTH_PROBE_TIMEOUT_MILLISECONDS }                                from './HealthProbe.ts';
import { refusalAnswerOf }                                                                         from './RefusalAnswer.ts';
import { writeFreshServerToken }                                                                   from './ServerToken.ts';
import { COMMANDS_PATH, commandAnswerFor, type CommandCarrier }                                    from './routes/CommandsRoute.ts';
import {
  FRAME_SESSION_METHOD,
  frameSessionAnswerFor,
  trackerIdOfFrameSessionPath,
  type FrameSessionSources,
} from './routes/FrameSessionRoute.ts';
import { HEALTH_PATH, healthAnswerOf, type ForgeCounts }                       from './routes/HealthRoute.ts';
import { pageFileAnswerFor, type PageFilesSource }                             from './routes/PageFilesRoute.ts';
import { sessionCodeAnswerOf, sessionCookieNameFor, sessionExchangeAnswerFor } from './routes/SessionRoutes.ts';

export interface PageServerOptions {
  /** `0` binds any free port, as a spec asks for. */
  readonly port:                            number;
  readonly homeDirectory:                   string;
  readonly fleetStore:                      FleetStore;
  readonly forgeCounts:                     () => ForgeCounts;
  readonly pageFiles:                       PageFilesSource;
  /** The command port: forge-control's carrier, which `Main.ts` wires, since no feature reaches another. */
  readonly carryCommand:                    CommandCarrier;
  /** What the frame session route asks a forge's Overseer with: the registry, the forge watch's readings and the forge client. */
  readonly frameSessionSources:             FrameSessionSources;
  readonly timers:                          WatchTimers;
  /** The stamp the server record carries: recorded for a reader to show, never compared. */
  readonly now:                             () => string;
  readonly processId:                       number;
  /** Milliseconds on a monotonic clock for a session code's life; the clock's own when not given. */
  readonly monotonicNow?:                   () => number;
  readonly heartbeatIntervalMilliseconds?:  number;
  readonly healthProbeTimeoutMilliseconds?: number;
}

export interface PageServer {
  readonly url:  URL;
  readonly port: number;
  /** Ends every event stream, closes the listener and its connections, and removes the server record. */
  readonly stop: () => Promise<FileRemoveVerdict>;
}

export type PageServerStartVerdict =
  | { readonly verdict: 'serving'; readonly pageServer: PageServer }
  | { readonly verdict: 'gaia-already-serving'; readonly url: URL }
  | { readonly verdict: 'port-unavailable'; readonly port: number; readonly failure: string }
  | { readonly verdict: 'unwritable'; readonly file: 'token' | 'server-record'; readonly failure: string };

type RouteAccess = 'open' | 'token' | 'session-or-token';

interface PageServerRoute {
  readonly method:      'GET' | 'POST';
  readonly matchesPath: (pathname: string) => boolean;
  readonly access:      RouteAccess;
  /** A stream is quiet between events by design, so Bun's idle timeout is off for it rather than left to the heartbeat's timing. */
  readonly isStream:    boolean;
  readonly answer:      (request: Request, pathname: string) => Response | Promise<Response>;
}

const LOOPBACK_ADDRESS = '127.0.0.1';

const API_PATH_PREFIX = '/api/';

/** The largest body any route reads; a session code or a command is a few hundred bytes. */
const MAXIMUM_REQUEST_BODY_BYTES = 65_536;

const NO_IDLE_TIMEOUT = 0;

const JSON_CONTENT_TYPE = 'application/json;charset=utf-8';

function urlOfPort(port: number): URL {
  return new URL(`http://${LOOPBACK_ADDRESS}:${port}/`);
}

function failureOf(error: unknown): string {
  if (error instanceof Error) return (error as NodeJS.ErrnoException).code ?? error.message;
  return String(error);
}

interface RouteContext {
  readonly broker:       FleetBroker;
  readonly sessionCodes: SessionCodes;
  readonly token:        string;
  readonly options:      PageServerOptions;
}

interface Routing {
  readonly context: RouteContext;
  readonly routes:  readonly PageServerRoute[];
}

function fleetAnswerOf(broker: FleetBroker): Response {
  return new Response(broker.fleetDocumentJson(), { headers: { 'content-type': JSON_CONTENT_TYPE, 'cache-control': 'no-store' } });
}

function exactly(path: string): (pathname: string) => boolean {
  return (pathname) => pathname === path;
}

function frameSessionAnswerOf(pathname: string, sources: FrameSessionSources): Promise<Response> {
  const trackerId = trackerIdOfFrameSessionPath(pathname);
  return trackerId === null ? Promise.resolve(refusalAnswerOf('not-found')) : frameSessionAnswerFor(trackerId, sources);
}

function routesOf(context: RouteContext): readonly PageServerRoute[] {
  const { broker, sessionCodes, options } = context;
  return [
    {
      method:      'GET',
      matchesPath: exactly(HEALTH_PATH),
      access:      'open',
      isStream:    false,
      answer:      () => healthAnswerOf(options.forgeCounts()),
    },
    {
      method:      'POST',
      matchesPath: exactly('/api/session-codes'),
      access:      'token',
      isStream:    false,
      answer:      () => sessionCodeAnswerOf(sessionCodes),
    },
    {
      method:      'POST',
      matchesPath: exactly('/api/session'),
      access:      'open',
      isStream:    false,
      answer:      (request) => sessionExchangeAnswerFor(request, sessionCodes),
    },
    {
      method:      'GET',
      matchesPath: exactly('/api/fleet'),
      access:      'session-or-token',
      isStream:    false,
      answer:      () => fleetAnswerOf(broker),
    },
    {
      method:      'GET',
      matchesPath: exactly('/api/events'),
      access:      'session-or-token',
      isStream:    true,
      answer:      () => broker.openEventStream(),
    },
    {
      method:      'POST',
      matchesPath: exactly(COMMANDS_PATH),
      access:      'session-or-token',
      isStream:    false,
      answer:      (request) => commandAnswerFor(request, options.carryCommand),
    },
    {
      method:      FRAME_SESSION_METHOD,
      matchesPath: (pathname) => trackerIdOfFrameSessionPath(pathname) !== null,
      access:      'session-or-token',
      isStream:    false,
      answer:      (_request, pathname) => frameSessionAnswerOf(pathname, options.frameSessionSources),
    },
  ];
}

function accessIsGranted(request: Request, access: RouteAccess, context: RouteContext): boolean {
  if (access === 'open') return true;
  if (bearerTokenMatches(request, context.token)) return true;
  return access === 'session-or-token' && context.sessionCodes.requestHoldsSession(request);
}

function refusalOfAccess(access: RouteAccess): 'not-holder-of-token' | 'no-session' {
  return access === 'token' ? 'not-holder-of-token' : 'no-session';
}

async function routedAnswerFor(request: Request, server: Bun.Server<undefined>, port: number, routing: Routing): Promise<Response> {
  const { context, routes } = routing;
  if (hostGuardVerdictFor(request, port) !== 'admitted') return refusalAnswerOf('foreign-host');
  const originVerdict = originGuardVerdictFor(request, port);
  if (originVerdict !== 'admitted') return refusalAnswerOf(originVerdict);
  const { pathname } = new URL(request.url);
  const routesOfPath = routes.filter((route) => route.matchesPath(pathname));
  if (routesOfPath.length === 0) {
    const isPageFile = request.method === 'GET' && !pathname.startsWith(API_PATH_PREFIX);
    return isPageFile ? pageFileAnswerFor(context.options.pageFiles, pathname) : refusalAnswerOf('not-found');
  }
  const route = routesOfPath.find((candidate) => candidate.method === request.method);
  if (route === undefined) return refusalAnswerOf('method-not-allowed');
  if (!accessIsGranted(request, route.access, context)) return refusalAnswerOf(refusalOfAccess(route.access));
  if (route.isStream) server.timeout(request, NO_IDLE_TIMEOUT);
  return route.answer(request, pathname);
}

export async function startPageServer(options: PageServerOptions): Promise<PageServerStartVerdict> {
  if (options.port !== 0) {
    const probeVerdict = await healthProbeVerdictFor(options.port, options.healthProbeTimeoutMilliseconds ?? HEALTH_PROBE_TIMEOUT_MILLISECONDS);
    if (probeVerdict === 'gaia-answers') return { verdict: 'gaia-already-serving', url: urlOfPort(options.port) };
  }

  // The token is written before the server listens, so a caller that finds the health route answering reads this start's token.
  const tokenWrite = await writeFreshServerToken(options.homeDirectory);
  if (tokenWrite.verdict === 'unwritable') return { verdict: 'unwritable', file: 'token', failure: tokenWrite.failure };

  const contentSecurityPolicy = pageContentSecurityPolicyFor({ frameSources: [LOOPBACK_ANY_PORT_FRAME_SOURCE] });
  const broker = createFleetBroker({
    fleetStore: options.fleetStore,
    timers:     options.timers,
    ...options.heartbeatIntervalMilliseconds === undefined ? {} : { heartbeatIntervalMilliseconds: options.heartbeatIntervalMilliseconds },
  });
  let routing: Routing | null = null;
  let server: Bun.Server<undefined>;
  try {
    server = Bun.serve({
      hostname:           LOOPBACK_ADDRESS,
      port:               options.port,
      reusePort:          false,
      development:        false,
      maxRequestBodySize: MAXIMUM_REQUEST_BODY_BYTES,
      fetch:              async (request, ownServer) => {
        const port = ownServer.port ?? options.port;
        let answer: Response;
        try {
          answer = routing === null ? refusalAnswerOf('answer-failed') : await routedAnswerFor(request, ownServer, port, routing);
        } catch {
          answer = refusalAnswerOf('answer-failed');
        }
        return withContentSecurityPolicy(answer, contentSecurityPolicy);
      },
      error: () => withContentSecurityPolicy(refusalAnswerOf('answer-failed'), contentSecurityPolicy),
    });
  } catch (error) {
    broker.stop();
    return { verdict: 'port-unavailable', port: options.port, failure: failureOf(error) };
  }

  const port = server.port ?? options.port;
  const url  = urlOfPort(port);
  const context: RouteContext = {
    broker,
    sessionCodes: createSessionCodes({ cookieName: sessionCookieNameFor(port), now: options.monotonicNow ?? monotonicMillisecondsOfNow }),
    token:        tokenWrite.token,
    options,
  };
  routing = { context, routes: routesOf(context) };

  const serverRecordWriter = createServerRecordWriter(options.homeDirectory);
  const stopListening = async (): Promise<void> => {
    broker.stop();
    // Graceful, so each stream the broker just ended still sends its last bytes; what remains in flight is a short answer.
    await server.stop(false);
  };
  const recordWrite = await serverRecordWriter.write({ url, processId: options.processId, startedAt: options.now() });
  if (recordWrite.verdict === 'unwritable') {
    await stopListening();
    return { verdict: 'unwritable', file: 'server-record', failure: recordWrite.failure };
  }

  return {
    verdict:    'serving',
    pageServer: {
      url,
      port,
      stop: async () => {
        await stopListening();
        return serverRecordWriter.remove();
      },
    },
  };
}
