/**
 * How the board's clients reach Gaia's relay: one request with the page's session cookie and nothing else, so no token ever leaves Gaia's
 * server. A spec hands its own sender in place of the browser's `fetch`.
 */
export type RelayRequestSender = (path: string, requestOptions: RequestInit) => Promise<Response>;

export const BROWSER_RELAY_REQUEST_SENDER: RelayRequestSender = (path, requestOptions) => fetch(path, requestOptions);

/** The answer of a request that reached Gaia's server, or `unreachable` when nothing answered. */
export type RelayResponse = { readonly verdict: 'answered'; readonly response: Response } | { readonly verdict: 'unreachable' };

export async function relayResponseOf(sendRequest: RelayRequestSender, path: string, requestOptions: RequestInit): Promise<RelayResponse> {
  try {
    return { verdict: 'answered', response: await sendRequest(path, { ...requestOptions, credentials: 'same-origin', cache: 'no-store' }) };
  } catch {
    return { verdict: 'unreachable' };
  }
}

/** The answer's body as JSON, `undefined` when it is none. */
export async function jsonBodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return undefined;
  }
}
