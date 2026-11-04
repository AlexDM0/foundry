/**
 * The session code exchange against the recorded Overseer API and a fake address. What matters: the code leaves the address bar before the
 * exchange goes out, it travels only in the JSON body of `POST /api/session` and never in a URL, and a page with no code in its fragment
 * sends nothing. The session probe is `refused` only on a 401, so an unreachable Overseer never reads as a lost session.
 */
import { describe, expect, test } from 'bun:test';

// Renamed, since the React hook rule in `bridge/` reads every `use` call as a hook.
import { useRecordedOverseerFetch as recordedOverseerOfThisSpecFile } from '../../src/testing/RecordedOverseerAnswers.ts';
import { SessionCodeExchange }                                        from './SessionCodeExchange.ts';

const recordedOverseer = recordedOverseerOfThisSpecFile();

describe('SessionCodeExchange', () => {
  test('clears the fragment first, then posts the code in a JSON body to a path with no query string', async () => {
    const overseer = recordedOverseer();
    const code = overseer.issueSessionCode();
    const events: string[] = [];
    const addresses: string[] = [];
    const outcome = await SessionCodeExchange.exchangeCodeInFragment(
      { hash: `#session=${code}`, pathname: '/', search: '' },
      (address) => {
        addresses.push(address);
        events.push(`replace, ${overseer.requests.length} requests sent`);
      },
      overseer.fetch,
    );
    expect(outcome).toBe('exchanged');
    expect(overseer.holdsSessionCookie()).toBe(true);
    expect(events).toEqual(['replace, 0 requests sent']);
    expect(addresses).toEqual(['/']);
    expect(overseer.requests.map((request) => request.path)).toEqual([SessionCodeExchange.SESSION_PATH]);
    expect(overseer.requests[0]?.method).toBe('POST');
    expect(overseer.requests[0]?.init?.body).toBe(JSON.stringify({ code }));
    expect(overseer.requests.every((request) => !request.path.includes(code) && !request.path.includes('?'))).toBe(true);
  });

  test('a fragment that is a tab route, or none, sends nothing and keeps the address', async () => {
    for (const hash of ['', '#kanban', '#session=', '#tickets/42']) {
      const overseer = recordedOverseer();
      const addresses: string[] = [];
      expect(await SessionCodeExchange.exchangeCodeInFragment({ hash, pathname: '/', search: '' }, (address) => addresses.push(address), overseer.fetch)).toBe('no-code');
      expect(overseer.requests).toEqual([]);
      expect(addresses).toEqual([]);
    }
  });

  test('a spent code is refused, and an Overseer gone is unreachable, the fragment cleared either way', async () => {
    const overseer = recordedOverseer();
    const code = overseer.issueSessionCode();
    const addresses: string[] = [];
    const location = { hash: `#session=${code}`, pathname: '/', search: '' };
    expect(await SessionCodeExchange.exchangeCodeInFragment(location, (address) => addresses.push(address), overseer.fetch)).toBe('exchanged');
    expect(await SessionCodeExchange.exchangeCodeInFragment(location, (address) => addresses.push(address), overseer.fetch)).toBe('refused');
    overseer.stop();
    expect(await SessionCodeExchange.exchangeCodeInFragment(location, (address) => addresses.push(address), overseer.fetch)).toBe('unreachable');
    expect(addresses).toEqual(['/', '/', '/']);
  });

  test('A4: the session probe asks /api/session-token and is refused only on a 401', async () => {
    const withNoSession = recordedOverseer();
    expect(await SessionCodeExchange.sessionStandingOf(withNoSession.fetch)).toBe('refused');
    expect(withNoSession.requests.map((request) => request.path)).toEqual(['/api/session-token']);
    const withSession = recordedOverseer({ holdsSessionCookie: true });
    expect(await SessionCodeExchange.sessionStandingOf(withSession.fetch)).toBe('unknown');
    withSession.stop();
    expect(await SessionCodeExchange.sessionStandingOf(withSession.fetch)).toBe('unknown');
  });
});
