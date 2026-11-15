/**
 * The client of Gaia's own server against servers of this spec on loopback ports. The health: an answer that says Gaia, at any health
 * version, is Gaia, with its forge counts only at the known version; any other answer is another program; a port where nothing listens
 * answers nothing. The session code: asked with the token as a bearer, issued only as a code, refused with the status otherwise. Both are
 * asked at their versioned paths, and at their unversioned ones of a Gaia from before versioned paths, which answers a versioned path 404.
 * The page server's spec proves the routes themselves, and the launcher's recording spec this client against a real `gaia serve`.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { healthProbeVerdictFor, healthReadingFor, sessionCodeFor } from './GaiaServerClient.ts';
import { healthDocumentOf }                                        from './HealthDocument.ts';

const SHORT_BOUND_MILLISECONDS = 500;
const EXAMPLE_TOKEN = 'example-token-0123456789abcdef';
const EXAMPLE_CODE = '0123456789abcdef';
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;

/** A Gaia from before versioned paths: its routes at their unversioned paths alone, and `not-found` for anything else under `/api/`. */
function gaiaBeforeVersionedPaths(routes: Readonly<Record<string, () => Response>>, pathsAsked: string[]): (request: Request) => Response {
  return (request) => {
    const { pathname } = new URL(request.url);
    pathsAsked.push(pathname);
    const route = Object.hasOwn(routes, pathname) ? routes[pathname] : undefined;
    return route === undefined ? Response.json({ refusal: 'not-found' }, { status: HTTP_NOT_FOUND }) : route();
  };
}

let servers: Bun.Server<undefined>[] = [];

afterEach(async () => {
  for (const server of servers) await server.stop(true);
  servers = [];
});

function portAnswering(answer: (request: Request) => Response): number {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answer });
  servers.push(server);
  return server.port ?? 0;
}

async function freedPort(): Promise<number> {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
  const port = server.port ?? 0;
  await server.stop(true);
  return port;
}

describe('the health probe', () => {
  test('knows Gaia by its health answer, also at another health version', async () => {
    expect(await healthProbeVerdictFor(portAnswering(() => Response.json({ application: 'gaia', healthVersion: 2 })), SHORT_BOUND_MILLISECONDS)).toBe('gaia-answers');
  });

  test('takes a JSON answer of another application for another program', async () => {
    expect(await healthProbeVerdictFor(portAnswering(() => Response.json({ application: 'example-application' })), SHORT_BOUND_MILLISECONDS))
      .toBe('another-program-answers');
  });

  test('takes an answer that is no JSON for another program', async () => {
    expect(await healthProbeVerdictFor(portAnswering(() => new Response('<!doctype html>')), SHORT_BOUND_MILLISECONDS)).toBe('another-program-answers');
  });

  test('answers nothing for a port where nothing listens', async () => {
    expect(await healthProbeVerdictFor(await freedPort(), SHORT_BOUND_MILLISECONDS)).toBe('nothing-answers');
  });
});

describe('the health reading', () => {
  test('carries the forge counts of Gaia\'s health at the known version', async () => {
    const port = portAnswering(() => Response.json(healthDocumentOf({ forgesRegistered: 5, forgesAnswered: 3 })));
    expect(await healthReadingFor(port, SHORT_BOUND_MILLISECONDS)).toEqual({ verdict: 'gaia-answers', forgeCounts: { forgesRegistered: 5, forgesAnswered: 3 } });
  });

  test('is asked at the versioned health path, and at /api/health of a Gaia from before versioned paths', async () => {
    const pathsAskedOfThisGaia: string[] = [];
    const thisGaia = portAnswering((request) => {
      pathsAskedOfThisGaia.push(new URL(request.url).pathname);
      return Response.json(healthDocumentOf({ forgesRegistered: 1, forgesAnswered: 1 }));
    });
    const pathsAskedOfAnOlderGaia: string[] = [];
    const olderHealth = (): Response => Response.json(healthDocumentOf({ forgesRegistered: 2, forgesAnswered: 0 }));
    const olderGaia = portAnswering(gaiaBeforeVersionedPaths({ '/api/health': olderHealth }, pathsAskedOfAnOlderGaia));

    expect(await healthReadingFor(thisGaia, SHORT_BOUND_MILLISECONDS)).toEqual({ verdict: 'gaia-answers', forgeCounts: { forgesRegistered: 1, forgesAnswered: 1 } });
    expect(await healthReadingFor(olderGaia, SHORT_BOUND_MILLISECONDS)).toEqual({ verdict: 'gaia-answers', forgeCounts: { forgesRegistered: 2, forgesAnswered: 0 } });
    expect([pathsAskedOfThisGaia, pathsAskedOfAnOlderGaia]).toEqual([['/api/v1/health'], ['/api/v1/health', '/api/health']]);
  });

  test('carries no forge counts for a Gaia at another health version', async () => {
    const port = portAnswering(() => Response.json({ ...healthDocumentOf({ forgesRegistered: 5, forgesAnswered: 3 }), healthVersion: 2 }));
    expect(await healthReadingFor(port, SHORT_BOUND_MILLISECONDS)).toEqual({ verdict: 'gaia-answers', forgeCounts: null });
  });
});

describe('the session code', () => {
  test('is asked at the session-codes route with the token as a bearer, and answered as issued', async () => {
    const requests: { readonly method: string; readonly path: string; readonly authorization: string | null }[] = [];
    const port = portAnswering((request) => {
      requests.push({ method: request.method, path: new URL(request.url).pathname, authorization: request.headers.get('authorization') });
      return Response.json({ code: EXAMPLE_CODE });
    });
    expect(await sessionCodeFor(port, EXAMPLE_TOKEN, SHORT_BOUND_MILLISECONDS)).toEqual({ verdict: 'issued', code: EXAMPLE_CODE });
    expect(requests).toEqual([{ method: 'POST', path: '/api/v1/session-codes', authorization: `Bearer ${EXAMPLE_TOKEN}` }]);
  });

  test('is asked at /api/session-codes of a Gaia from before versioned paths', async () => {
    const pathsAsked: string[] = [];
    const olderGaia = portAnswering(gaiaBeforeVersionedPaths({ '/api/session-codes': () => Response.json({ code: EXAMPLE_CODE }) }, pathsAsked));
    expect(await sessionCodeFor(olderGaia, EXAMPLE_TOKEN, SHORT_BOUND_MILLISECONDS)).toEqual({ verdict: 'issued', code: EXAMPLE_CODE });
    expect(pathsAsked).toEqual(['/api/v1/session-codes', '/api/session-codes']);
  });

  test('is refused with the status of an answer that issues no code', async () => {
    const refusingPort = portAnswering(() => Response.json({ refusal: 'not-holder-of-token' }, { status: HTTP_UNAUTHORIZED }));
    const strangePort  = portAnswering(() => Response.json({ code: 'not a code' }));
    expect(await sessionCodeFor(refusingPort, EXAMPLE_TOKEN, SHORT_BOUND_MILLISECONDS)).toEqual({ verdict: 'refused', status: HTTP_UNAUTHORIZED });
    expect(await sessionCodeFor(strangePort, EXAMPLE_TOKEN, SHORT_BOUND_MILLISECONDS)).toEqual({ verdict: 'refused', status: 200 });
  });

  test('is refused with its status, not unreachable, when the port answers with success and a body that is no JSON', async () => {
    const htmlPort = portAnswering(() => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }));
    expect(await sessionCodeFor(htmlPort, EXAMPLE_TOKEN, SHORT_BOUND_MILLISECONDS)).toEqual({ verdict: 'refused', status: 200 });
  });

  test('is unreachable where nothing listens', async () => {
    expect(await sessionCodeFor(await freedPort(), EXAMPLE_TOKEN, SHORT_BOUND_MILLISECONDS)).toEqual({ verdict: 'unreachable' });
  });
});
