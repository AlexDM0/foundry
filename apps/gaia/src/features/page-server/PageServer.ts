/**
 * Gaia's server on 127.0.0.1 (PLAN 8.1): every request passes the Host and Origin guards, each route its own guard, and every answer
 * carries the page's CSP, a refusal and a failure included. Once it holds the port it writes a fresh token, then opens its routes; it refuses
 * to start where Gaia already answers.
 */
import { healthProbeVerdictFor, HEALTH_PROBE_TIMEOUT_MILLISECONDS }            from '../../adapters/gaia-server/GaiaServerClient.ts';
import type { ForgeCounts }                                                    from '../../adapters/gaia-server/HealthDocument.ts';
import { ApiPathUtil, type EndpointOfPath }                                    from '../../lib/api-paths/ApiPathUtil.ts';
import { pageContentSecurityPolicyFor, withContentSecurityPolicy }             from '../../lib/local-http-guards/ContentSecurityPolicy.ts';
import { hostGuardVerdictFor }                                                 from '../../lib/local-http-guards/HostGuard.ts';
import { originGuardVerdictFor }                                               from '../../lib/local-http-guards/OriginGuard.ts';
import { createSessionCodes, type SessionCodes }                               from '../../lib/local-http-guards/SessionCodes.ts';
import { bearerTokenMatches }                                                  from '../../lib/local-http-guards/TokenCheck.ts';
import { monotonicMillisecondsOfNow }                                          from '../../services/Clock.ts';
import type { ClockTimers }                                                    from '../../services/Clock.ts';
import type { FleetStore }                                                     from '../../services/FleetStore.ts';
import { GAIA_ENDPOINT_VERSIONS }                                              from '../../shared/constants/GaiaSystemVersions.ts';
import { BOARD_PICTURE_UPLOAD_LIMIT_BYTES }                                    from '../../shared/constants/Limits.ts';
import type { BoardRelayLog }                                                  from './@types/BoardRelayLogEntry.ts';
import { createBoardStreams, type BoardStreams }                               from './BoardStreams.ts';
import { createFleetBroker, type FleetBroker }                                 from './FleetBroker.ts';
import type { ForgeAccessSources }                                             from './ForgeAccess.ts';
import { refusalAnswerOf }                                                     from './RefusalAnswer.ts';
import { writeFreshServerToken }                                               from './ServerToken.ts';
import { boardCommandAnswerFor }                                               from './routes/BoardCommandRoute.ts';
import { pictureAnswerFor, pictureUploadAnswerFor }                            from './routes/BoardPictureRoutes.ts';
import { createBoardStateRoute, type BoardStateRoute }                         from './routes/BoardStateRoute.ts';
import { boardEventsAnswerFor, jobStreamAnswerFor, profileStreamAnswerFor }    from './routes/BoardStreamRoutes.ts';
import { commandAnswerFor, type CommandCarrier }                               from './routes/CommandsRoute.ts';
import { createForgeCrashLogRoute, type ForgeCrashLogRoute }                   from './routes/ForgeCrashLogRoute.ts';
import { healthAnswerOf }                                                      from './routes/HealthRoute.ts';
import { pageFileAnswerFor, type PageFilesSource }                             from './routes/PageFilesRoute.ts';
import { sessionCodeAnswerOf, sessionCookieNameFor, sessionExchangeAnswerFor } from './routes/SessionRoutes.ts';
import { versionsAnswerOf }                                                    from './routes/VersionsRoute.ts';
import { BoardRelayEndpointUtil, type BoardRelayEndpointName }                 from './utils/BoardRelayEndpointUtil.ts';

export interface PageServerOptions {
  /** `0` binds any free port, as a spec asks for. */
  readonly port:                            number;
  readonly homeDirectory:                   string;
  readonly fleetStore:                      FleetStore;
  readonly forgeCounts:                     () => ForgeCounts;
  readonly pageFiles:                       PageFilesSource;
  /** The command port: forge-control's carrier, which `Main.ts` wires, since no feature reaches another. */
  readonly carryCommand:                    CommandCarrier;
  /** What the board's relay reaches a forge's Overseer with: the registry, the forge watch's readings and the forge client. */
  readonly forgeAccessSources:              ForgeAccessSources;
  /** Where the board's relay logs an event it dropped, a handshake at another version and a board it could not read. */
  readonly logBoardRelay:                   BoardRelayLog;
  readonly timers:                          ClockTimers;
  /** Milliseconds on a monotonic clock for a session code's life; the clock's own when not given. */
  readonly monotonicNow?:                   () => number;
  readonly heartbeatIntervalMilliseconds?:  number;
  readonly healthProbeTimeoutMilliseconds?: number;
}

export interface PageServer {
  readonly url:  URL;
  readonly port: number;
  /** Ends every event stream, the fleet's and each relayed board stream with the forge stream it follows, and closes the listener and its connections. */
  readonly stop: () => Promise<void>;
}

export type PageServerStartVerdict =
  | { readonly verdict: 'serving'; readonly pageServer: PageServer }
  | { readonly verdict: 'gaia-already-serving'; readonly url: URL }
  | { readonly verdict: 'port-unavailable'; readonly port: number; readonly failure: string }
  | { readonly verdict: 'unwritable'; readonly file: 'token'; readonly failure: string };

type RouteAccess = 'open' | 'token' | 'session-or-token';

interface PageServerRoute {
  readonly method:           'GET' | 'POST';
  /** Asked of the endpoint below `/api/` without its version, such as `fleet`. */
  readonly matchesEndpoint:  (endpoint: string) => boolean;
  /** Served at `/api/v<version>/<endpoint>` alone; `null` for the one route served only at its unversioned path, `/api/versions`. */
  readonly version:          number | null;
  readonly access:           RouteAccess;
  /** A stream is quiet between events by design, so Bun's idle timeout is off for it rather than left to the heartbeat's timing. */
  readonly isStream:         boolean;
  /** The largest body the route reads, since Bun's own bound is one for every route and is raised to the largest of them. */
  readonly maximumBodyBytes: number;
  readonly answer:           (request: Request, endpoint: string, maximumBodyBytes: number) => Response | Promise<Response>;
}

const LOOPBACK_ADDRESS = '127.0.0.1';

const API_PATH_PREFIX = '/api/';

/** The largest body a route reads but the picture upload; a session code or a command is a few hundred bytes. */
const ROUTE_BODY_BOUND_BYTES = 65_536;

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
  readonly broker:          FleetBroker;
  readonly boardStreams:    BoardStreams;
  readonly boardStateRoute: BoardStateRoute;
  readonly crashLogRoute:   ForgeCrashLogRoute;
  readonly sessionCodes:    SessionCodes;
  readonly token:           string;
  readonly options:         PageServerOptions;
}

interface Routing {
  readonly context: RouteContext;
  readonly routes:  readonly PageServerRoute[];
}

function fleetAnswerOf(broker: FleetBroker): Response {
  return new Response(broker.fleetDocumentJson(), { headers: { 'content-type': JSON_CONTENT_TYPE, 'cache-control': 'no-store' } });
}

function exactly(expectedEndpoint: string): (endpoint: string) => boolean {
  return (endpoint) => endpoint === expectedEndpoint;
}

/** The forge and the item a relay endpoint names; the route matched it, so it names both as its pattern asks. */
function relayValuesOf(endpointName: BoardRelayEndpointName, endpoint: string): { readonly trackerId: string; readonly itemId: string } {
  const values = BoardRelayEndpointUtil.valuesOf(endpointName, endpoint);
  if (values === null) throw new Error(`The ${endpointName} route answered ${endpoint}, which it does not match.`);
  return { trackerId: values.trackerId, itemId: values.itemId ?? '' };
}

function boardRelayRoutesOf(context: RouteContext): readonly PageServerRoute[] {
  const {
    boardStreams, boardStateRoute, crashLogRoute, options
  } = context;
  const forgeAccess = options.forgeAccessSources;
  const streamSources = { forgeAccess, boardStreams };
  const relayRoute = (
    method: PageServerRoute['method'],
    endpointName: BoardRelayEndpointName,
    version: number,
    answer: PageServerRoute['answer'],
    shape: { readonly isStream?: boolean; readonly maximumBodyBytes?: number } = {},
  ): PageServerRoute => ({
    method,
    matchesEndpoint:  BoardRelayEndpointUtil.matches(endpointName),
    version,
    access:           'session-or-token',
    isStream:         shape.isStream ?? false,
    maximumBodyBytes: shape.maximumBodyBytes ?? ROUTE_BODY_BOUND_BYTES,
    answer,
  });
  return [
    relayRoute('GET', 'board', GAIA_ENDPOINT_VERSIONS.forgeBoard, (_request, endpoint) => boardStateRoute.answerFor(relayValuesOf('board', endpoint).trackerId)),
    relayRoute('GET', 'boardEvents', GAIA_ENDPOINT_VERSIONS.forgeBoardEvents, (request, endpoint) => {
      return boardEventsAnswerFor(request, relayValuesOf('boardEvents', endpoint).trackerId, streamSources);
    }, { isStream: true }),
    relayRoute('GET', 'jobStream', GAIA_ENDPOINT_VERSIONS.forgeJobStream, (request, endpoint) => {
      const { trackerId, itemId } = relayValuesOf('jobStream', endpoint);
      return jobStreamAnswerFor(request, trackerId, itemId, streamSources);
    }, { isStream: true }),
    relayRoute('GET', 'profileStream', GAIA_ENDPOINT_VERSIONS.forgeProfileStream, (request, endpoint) => {
      const { trackerId, itemId } = relayValuesOf('profileStream', endpoint);
      return profileStreamAnswerFor(request, trackerId, itemId, streamSources);
    }, { isStream: true }),
    relayRoute('POST', 'pictures', GAIA_ENDPOINT_VERSIONS.forgePictureUpload, (request, endpoint, maximumBodyBytes) => {
      return pictureUploadAnswerFor(request, relayValuesOf('pictures', endpoint).trackerId, forgeAccess, maximumBodyBytes);
    }, { maximumBodyBytes: BOARD_PICTURE_UPLOAD_LIMIT_BYTES }),
    relayRoute('GET', 'picture', GAIA_ENDPOINT_VERSIONS.forgePicture, (_request, endpoint) => {
      const { trackerId, itemId } = relayValuesOf('picture', endpoint);
      return pictureAnswerFor(trackerId, itemId, forgeAccess);
    }),
    relayRoute('POST', 'commands', GAIA_ENDPOINT_VERSIONS.forgeCommands, (request, endpoint, maximumBodyBytes) => {
      return boardCommandAnswerFor(request, relayValuesOf('commands', endpoint).trackerId, forgeAccess, maximumBodyBytes);
    }),
    relayRoute('GET', 'crashLog', GAIA_ENDPOINT_VERSIONS.forgeCrashLog, (_request, endpoint) => {
      const { trackerId, itemId } = relayValuesOf('crashLog', endpoint);
      return crashLogRoute.answerFor(trackerId, itemId);
    }),
  ];
}

function routesOf(context: RouteContext): readonly PageServerRoute[] {
  const { broker, sessionCodes, options } = context;
  const route = (shape: Omit<PageServerRoute, 'maximumBodyBytes'>): PageServerRoute => ({ ...shape, maximumBodyBytes: ROUTE_BODY_BOUND_BYTES });
  return [
    route({
      method:          'GET',
      matchesEndpoint: exactly('versions'),
      version:         null,
      access:          'open',
      isStream:        false,
      answer:          () => versionsAnswerOf(),
    }),
    route({
      method:          'GET',
      matchesEndpoint: exactly('health'),
      version:         GAIA_ENDPOINT_VERSIONS.health,
      access:          'open',
      isStream:        false,
      answer:          () => healthAnswerOf(options.forgeCounts()),
    }),
    route({
      method:          'POST',
      matchesEndpoint: exactly('session-codes'),
      version:         GAIA_ENDPOINT_VERSIONS.sessionCodes,
      access:          'token',
      isStream:        false,
      answer:          () => sessionCodeAnswerOf(sessionCodes),
    }),
    route({
      method:          'POST',
      matchesEndpoint: exactly('session'),
      version:         GAIA_ENDPOINT_VERSIONS.session,
      access:          'open',
      isStream:        false,
      answer:          (request, _endpoint, maximumBodyBytes) => sessionExchangeAnswerFor(request, sessionCodes, maximumBodyBytes),
    }),
    route({
      method:          'GET',
      matchesEndpoint: exactly('fleet'),
      version:         GAIA_ENDPOINT_VERSIONS.fleet,
      access:          'session-or-token',
      isStream:        false,
      answer:          () => fleetAnswerOf(broker),
    }),
    route({
      method:          'GET',
      matchesEndpoint: exactly('events'),
      version:         GAIA_ENDPOINT_VERSIONS.events,
      access:          'session-or-token',
      isStream:        true,
      answer:          () => broker.openEventStream(),
    }),
    route({
      method:          'POST',
      matchesEndpoint: exactly('commands'),
      version:         GAIA_ENDPOINT_VERSIONS.commands,
      access:          'session-or-token',
      isStream:        false,
      answer:          (request, _endpoint, maximumBodyBytes) => commandAnswerFor(request, options.carryCommand, maximumBodyBytes),
    }),
    ...boardRelayRoutesOf(context),
  ];
}

/** A route answers at its own version alone, and the unversioned-only route at no version. */
function routeServesPath(route: PageServerRoute, { endpoint, version }: EndpointOfPath): boolean {
  return route.matchesEndpoint(endpoint) && version === route.version;
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
  const endpointOfPath = ApiPathUtil.endpointOfPath(pathname);
  const isPageFile = request.method === 'GET' && !pathname.startsWith(API_PATH_PREFIX);
  if (endpointOfPath === null) return isPageFile ? pageFileAnswerFor(context.options.pageFiles, pathname) : refusalAnswerOf('not-found');
  const routesOfPath = routes.filter((route) => routeServesPath(route, endpointOfPath));
  if (routesOfPath.length === 0) return refusalAnswerOf('not-found');
  const route = routesOfPath.find((candidate) => candidate.method === request.method);
  if (route === undefined) return refusalAnswerOf('method-not-allowed');
  if (!accessIsGranted(request, route.access, context)) return refusalAnswerOf(refusalOfAccess(route.access));
  if (route.isStream) server.timeout(request, NO_IDLE_TIMEOUT);
  return route.answer(request, endpointOfPath.endpoint, route.maximumBodyBytes);
}

export async function startPageServer(options: PageServerOptions): Promise<PageServerStartVerdict> {
  if (options.port !== 0) {
    const probeVerdict = await healthProbeVerdictFor(options.port, options.healthProbeTimeoutMilliseconds ?? HEALTH_PROBE_TIMEOUT_MILLISECONDS);
    if (probeVerdict === 'gaia-answers') return { verdict: 'gaia-already-serving', url: urlOfPort(options.port) };
  }

  const contentSecurityPolicy = pageContentSecurityPolicyFor();
  const boardStreams = createBoardStreams({
    timers: options.timers,
    log:    options.logBoardRelay,
    ...options.heartbeatIntervalMilliseconds === undefined ? {} : { heartbeatIntervalMilliseconds: options.heartbeatIntervalMilliseconds },
  });
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
      maxRequestBodySize: BOARD_PICTURE_UPLOAD_LIMIT_BYTES,
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
    boardStreams.stop();
    return { verdict: 'port-unavailable', port: options.port, failure: failureOf(error) };
  }

  const stopListening = async (): Promise<void> => {
    broker.stop();
    boardStreams.stop();
    // Graceful, so each stream the broker just ended still sends its last bytes; a command still in flight holds the stop until it answers.
    await server.stop(false);
  };

  // The token is written only once the port is held, and every route answers a failure until then: a start that loses the port leaves the
  // token of the Gaia that holds it, and a caller that finds the health route answering reads this start's token.
  const tokenWrite = await writeFreshServerToken(options.homeDirectory);
  if (tokenWrite.verdict === 'unwritable') {
    await stopListening();
    return { verdict: 'unwritable', file: 'token', failure: tokenWrite.failure };
  }

  const port = server.port ?? options.port;
  const url  = urlOfPort(port);
  const context: RouteContext = {
    broker,
    boardStreams,
    boardStateRoute: createBoardStateRoute(options.forgeAccessSources, options.logBoardRelay),
    crashLogRoute:   createForgeCrashLogRoute(options.forgeAccessSources, options.logBoardRelay),
    sessionCodes:    createSessionCodes({ cookieName: sessionCookieNameFor(port), now: options.monotonicNow ?? monotonicMillisecondsOfNow }),
    token:           tokenWrite.token,
    options,
  };
  routing = { context, routes: routesOf(context) };

  return {
    verdict:    'serving',
    pageServer: { url, port, stop: stopListening },
  };
}
