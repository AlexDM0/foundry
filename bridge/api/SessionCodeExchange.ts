/**
 * The one-time code `open` puts in the fragment, `#session=<code>`, exchanged before anything else loads for the HttpOnly session cookie
 * every data route needs. The fragment is cleared first, so the code leaves no trace in the address bar or the history, and it goes to the
 * Overseer only in a JSON body, never in a URL.
 */
import type { FetchFunction } from './CommandClient.ts';

export interface SessionCodeLocation {
  readonly hash:     string;
  readonly pathname: string;
  readonly search:   string;
}

/** The part of `history` the exchange uses, so a spec can drive it. */
export type ReplaceAddress = (address: string) => void;

export type SessionExchangeOutcome = 'no-code' | 'exchanged' | 'refused' | 'unreachable';

const SESSION_CODE_FRAGMENT = /^#session=([0-9a-f]+)$/;
const SESSION_PATH = '/api/session';

async function exchangeCodeInFragment(
  location: SessionCodeLocation,
  replaceAddress: ReplaceAddress,
  fetchOf: FetchFunction = (input, init) => fetch(input, init),
): Promise<SessionExchangeOutcome> {
  const code = SESSION_CODE_FRAGMENT.exec(location.hash)?.[1];
  if (code === undefined) return 'no-code';
  replaceAddress(`${location.pathname}${location.search}`);
  try {
    const response = await fetchOf(SESSION_PATH, {
      method:      'POST',
      credentials: 'same-origin',
      headers:     { 'content-type': 'application/json' },
      body:        JSON.stringify({ code }),
    });
    return response.ok ? 'exchanged' : 'refused';
  } catch {
    return 'unreachable';
  }
}

export const SessionCodeExchange = Object.freeze({ exchangeCodeInFragment, SESSION_PATH });
