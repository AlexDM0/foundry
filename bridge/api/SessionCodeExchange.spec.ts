/**
 * The session code exchange against a fake fetch and address. What matters: the code leaves the address bar before the exchange goes
 * out, it travels only in the JSON body of `POST /api/session` and never in a URL, and a page with no code in its fragment sends nothing.
 */
import { describe, expect, test } from 'bun:test';

import { SessionCodeExchange } from './SessionCodeExchange.ts';

const EXAMPLE_CODE = '0a1b2c3d';

interface RecordedCall {
  readonly path: string;
  readonly init: RequestInit | undefined;
}

function recordingFetch(status: number) {
  const calls: RecordedCall[] = [];
  const events: string[] = [];
  const fetchOf = (path: string, init?: RequestInit): Promise<Response> => {
    calls.push({ path, init });
    events.push('fetch');
    return Promise.resolve(new Response('{}', { status }));
  };
  return { calls, events, fetchOf };
}

describe('SessionCodeExchange', () => {
  test('clears the fragment first, then posts the code in a JSON body to a path with no query string', async () => {
    const { calls, events, fetchOf } = recordingFetch(200);
    const addresses: string[] = [];
    const outcome = await SessionCodeExchange.exchangeCodeInFragment(
      { hash: `#session=${EXAMPLE_CODE}`, pathname: '/', search: '' },
      (address) => {
        addresses.push(address);
        events.push('replace');
      },
      fetchOf,
    );
    expect(outcome).toBe('exchanged');
    expect(events).toEqual(['replace', 'fetch']);
    expect(addresses).toEqual(['/']);
    expect(calls.map((call) => call.path)).toEqual([SessionCodeExchange.SESSION_PATH]);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ code: EXAMPLE_CODE }));
    expect(calls.every((call) => !call.path.includes(EXAMPLE_CODE) && !call.path.includes('?'))).toBe(true);
  });

  test('a fragment that is a tab route, or none, sends nothing and keeps the address', async () => {
    for (const hash of ['', '#kanban', '#session=', '#tickets/42']) {
      const { calls, fetchOf } = recordingFetch(200);
      const addresses: string[] = [];
      expect(await SessionCodeExchange.exchangeCodeInFragment({ hash, pathname: '/', search: '' }, (address) => addresses.push(address), fetchOf)).toBe('no-code');
      expect(calls).toEqual([]);
      expect(addresses).toEqual([]);
    }
  });

  test('a spent code is refused, and a failed fetch is unreachable, the fragment cleared either way', async () => {
    const addresses: string[] = [];
    const location = { hash: `#session=${EXAMPLE_CODE}`, pathname: '/', search: '' };
    expect(await SessionCodeExchange.exchangeCodeInFragment(location, (address) => addresses.push(address), recordingFetch(401).fetchOf)).toBe('refused');
    const failingFetch = (): Promise<Response> => Promise.reject(new Error('offline'));
    expect(await SessionCodeExchange.exchangeCodeInFragment(location, (address) => addresses.push(address), failingFetch)).toBe('unreachable');
    expect(addresses).toEqual(['/', '/']);
  });
});
