/**
 * The session token every write to the Overseer's API carries: fetched from `/api/session-token` with the page's session cookie once, and
 * again after a 401, since an Overseer start rotates it. A post is retried once with the fresh token; a token refused 401 means the page's
 * session cookie is unknown to the Overseer.
 */
import { HTTP_STATUS } from './constants/HttpStatus.ts';

export type FetchFunction = (input: string, init?: RequestInit) => Promise<Response>;

export type TokenPost =
  | { readonly verdict: 'answered'; readonly response: Response }
  /** `/api/session-token` answered 401: the page's session cookie is unknown to the Overseer. */
  | { readonly verdict: 'no-session' }
  /** No token came, or nothing answered: the Overseer is gone or refused the page. */
  | { readonly verdict: 'unreachable' };

export interface SessionTokenSource {
  /** `headers` gain the bearer token; a fetch that throws is `unreachable`. */
  readonly post: (path: string, headers: Readonly<Record<string, string>>, body: BodyInit) => Promise<TokenPost>;
}

const SESSION_TOKEN_PATH = '/api/session-token';

type TokenReading = { verdict: 'token'; token: string } | { verdict: 'no-session' } | { verdict: 'unreachable' };

function create(fetchOf: FetchFunction = (input, init) => fetch(input, init)): SessionTokenSource {
  let token: string | null = null;

  const tokenReading = async (): Promise<TokenReading> => {
    if (token !== null) return { verdict: 'token', token };
    const response = await fetchOf(SESSION_TOKEN_PATH, { credentials: 'same-origin' });
    if (response.status === HTTP_STATUS.UNAUTHORIZED) return { verdict: 'no-session' };
    if (response.status !== HTTP_STATUS.OK) return { verdict: 'unreachable' };
    const body = await response.json() as { token?: unknown };
    if (typeof body.token !== 'string') return { verdict: 'unreachable' };
    ({ token } = body);
    return { verdict: 'token', token: body.token };
  };

  const postOnce = async (path: string, headers: Readonly<Record<string, string>>, body: BodyInit): Promise<TokenPost> => {
    const reading = await tokenReading();
    if (reading.verdict !== 'token') return reading;
    const response = await fetchOf(path, { method: 'POST', headers: { ...headers, 'authorization': `Bearer ${reading.token}` }, body });
    return { verdict: 'answered', response };
  };

  const post = async (path: string, headers: Readonly<Record<string, string>>, body: BodyInit): Promise<TokenPost> => {
    try {
      const first = await postOnce(path, headers, body);
      if (first.verdict !== 'answered' || first.response.status !== HTTP_STATUS.UNAUTHORIZED) return first;
      token = null;
      return await postOnce(path, headers, body);
    } catch {
      return { verdict: 'unreachable' };
    }
  };

  return { post };
}

export const SessionTokenSource = Object.freeze({ create });
