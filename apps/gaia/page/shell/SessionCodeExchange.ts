/**
 * The one-time code the launcher puts in the fragment, `#session=<code>`, spent for the session cookie before the page reads anything.
 * The fragment is cleared first, so the code stays in neither the address bar nor the history, and the code travels only in a JSON body.
 */
import { ApiPathUtil }            from '../../src/lib/api-paths/ApiPathUtil.ts';
import { GAIA_ENDPOINT_VERSIONS } from '../../src/shared/constants/GaiaSystemVersions.ts';

export interface SessionCodeLocation {
  readonly hash:     string;
  readonly pathname: string;
  readonly search:   string;
}

export type FetchFunction = (path: string, requestOptions: RequestInit) => Promise<Response>;

/** `no-code` when the fragment holds none: the page reads with the cookie it already has, as after a reload. */
export type SessionExchangeOutcome = 'no-code' | 'exchanged' | 'refused' | 'unreachable';

const SESSION_PATH = ApiPathUtil.versionedPathOf('session', GAIA_ENDPOINT_VERSIONS.session);

const SESSION_CODE_FRAGMENT = /^#session=([0-9a-f]+)$/;

async function exchangeCodeInFragment(
  location: SessionCodeLocation,
  replaceAddress: (address: string) => void,
  sendRequest: FetchFunction,
): Promise<SessionExchangeOutcome> {
  const code = SESSION_CODE_FRAGMENT.exec(location.hash)?.[1];
  if (code === undefined) return 'no-code';
  replaceAddress(`${location.pathname}${location.search}`);
  try {
    const response = await sendRequest(SESSION_PATH, {
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

export const SessionCodeExchange = {
  SESSION_PATH,
  exchangeCodeInFragment,
} as const;
