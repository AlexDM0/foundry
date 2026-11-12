/**
 * The session code exchange. What matters: the fragment is cleared before the code is posted, so no history entry or address keeps it;
 * the code goes only in a JSON body to `/api/session`, never in a URL; Gaia's answer maps to a verdict, a network failure included, and
 * a fragment without a code posts nothing. Gaia's server is stood in for by its answers: a success for a fresh code, a refusal status for a spent one.
 */
import { describe, expect, test } from 'bun:test';

import { type FetchFunction, SessionCodeExchange, type SessionCodeLocation } from './SessionCodeExchange.ts';

const CODE = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

const LOCATION_WITH_CODE: SessionCodeLocation = { hash: `#session=${CODE}`, pathname: '/', search: '' };

interface PostedRequest {
  readonly input: string;
  readonly init:  RequestInit;
}

function serverAnswering(answer: () => Response, events: string[], posted: PostedRequest[]): FetchFunction {
  return (input, init) => {
    events.push('posted');
    posted.push({ input, init });
    return Promise.resolve(answer());
  };
}

describe('exchanging the code in the fragment', () => {
  test('the fragment is cleared first, then the code goes in a JSON body to /api/session, and a fresh code is exchanged', async () => {
    const events: string[] = [];
    const posted: PostedRequest[] = [];
    const outcome = await SessionCodeExchange.exchangeCodeInFragment(
      LOCATION_WITH_CODE,
      (address) => events.push(`replaced with ${JSON.stringify(address)}`),
      serverAnswering(() => new Response(null, { status: 204 }), events, posted),
    );
    expect(outcome).toBe('exchanged');
    expect(events).toEqual(['replaced with "/"', 'posted']);
    expect(posted).toHaveLength(1);
    const [request] = posted;
    expect(request?.input).toBe(SessionCodeExchange.SESSION_PATH);
    expect(request?.input).not.toContain(CODE);
    expect(request?.init.method).toBe('POST');
    expect(JSON.parse(String(request?.init.body))).toEqual({ code: CODE });
  });

  test('the address keeps its path and query and loses only the fragment', async () => {
    const replaced: string[] = [];
    await SessionCodeExchange.exchangeCodeInFragment(
      { hash: `#session=${CODE}`, pathname: '/index.html', search: '?window=1' },
      (address) => replaced.push(address),
      () => Promise.resolve(new Response(null, { status: 204 })),
    );
    expect(replaced).toEqual(['/index.html?window=1']);
  });

  test('a spent code is refused, and a server that does not answer is unreachable', async () => {
    const spent = await SessionCodeExchange.exchangeCodeInFragment(LOCATION_WITH_CODE, () => undefined, () => Promise.resolve(new Response(null, { status: 403 })));
    const silent = await SessionCodeExchange.exchangeCodeInFragment(LOCATION_WITH_CODE, () => undefined, () => Promise.reject(new TypeError('Failed to fetch')));
    expect([spent, silent]).toEqual(['refused', 'unreachable']);
  });

  test('a fragment with no code, or with a route instead, posts nothing and leaves the address alone', async () => {
    const events: string[] = [];
    const posted: PostedRequest[] = [];
    const outcomes = await Promise.all(['', '#attention', '#session=', '#session=not-hex'].map((hash) => SessionCodeExchange.exchangeCodeInFragment(
      { hash, pathname: '/', search: '' },
      () => events.push('replaced'),
      serverAnswering(() => new Response(null, { status: 204 }), events, posted),
    )));
    expect(outcomes).toEqual(['no-code', 'no-code', 'no-code', 'no-code']);
    expect(events).toEqual([]);
  });
});
