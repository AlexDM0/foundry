/**
 * The bearer-token check: the `Authorization: Bearer <token>` of a request against the server's token, compared in constant time. Both
 * sides are digested first, so neither the offered token's bytes nor its length shortens the compare.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

const BEARER_PREFIX = 'Bearer ';

function digestOf(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function tokensMatch(offeredToken: string, expectedToken: string): boolean {
  return timingSafeEqual(digestOf(offeredToken), digestOf(expectedToken));
}

/** `false` while the server holds no token yet, and for a request with no bearer token. An empty token matches nothing. */
export function bearerTokenMatches(request: Request, expectedToken: string | null): boolean {
  const authorization = request.headers.get('authorization');
  if (expectedToken === null || expectedToken === '' || authorization === null || !authorization.startsWith(BEARER_PREFIX)) return false;
  return tokensMatch(authorization.slice(BEARER_PREFIX.length), expectedToken);
}
