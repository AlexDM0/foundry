/**
 * Browser sessions bought with one-time codes, held in memory as digests: a holder of the token asks for a code, a page spends it once,
 * within `SESSION_CODE_LIFETIME_MILLISECONDS`, for a session secret that lives only in an `HttpOnly`, `SameSite=Strict` cookie. Keeping
 * digests means a lookup's timing tells nothing of a secret, and a memory dump holds nothing that buys a session.
 */
import { createHash, randomBytes } from 'node:crypto';

export interface SessionCodesOptions {
  /** The cookie's name; it carries the port, because a cookie on 127.0.0.1 reaches every port of it. */
  readonly cookieName: string;
  /** Milliseconds on a monotonic clock, as `performance.now()` gives them. */
  readonly now:        () => number;
}

export type CodeExchangeVerdict =
  | { readonly verdict: 'exchanged'; readonly setCookieHeader: string }
  | { readonly verdict: 'refused' };

export interface SessionCodes {
  /** A fresh code, good for one exchange within its life. */
  readonly issueCode:           () => string;
  /** Refused for a code never issued, already spent or past its life; the refusal never says which. */
  readonly exchangeCode:        (code: string) => CodeExchangeVerdict;
  readonly requestHoldsSession: (request: Request) => boolean;
}

/** Long enough for a browser window to open on the code and post it, short enough that a code seen later buys nothing. */
export const SESSION_CODE_LIFETIME_MILLISECONDS = 30_000;

const SECRET_BYTES = 32;

const COOKIE_PAIR_SEPARATOR = ';';

const COOKIE_NAME_VALUE_SEPARATOR = '=';

function digestOf(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function freshSecret(): string {
  return randomBytes(SECRET_BYTES).toString('hex');
}

/** Every value under the name: a page on another port of 127.0.0.1 can set a cookie of the same name on a longer path, which comes first. */
function cookieValuesIn(request: Request, cookieName: string): string[] {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieValues: string[] = [];
  for (const pair of cookieHeader.split(COOKIE_PAIR_SEPARATOR)) {
    const separatorIndex = pair.indexOf(COOKIE_NAME_VALUE_SEPARATOR);
    if (separatorIndex > 0 && pair.slice(0, separatorIndex).trim() === cookieName) cookieValues.push(pair.slice(separatorIndex + 1).trim());
  }
  return cookieValues;
}

export function createSessionCodes(options: SessionCodesOptions): SessionCodes {
  const issuedAtOfUnspentCodeDigest = new Map<string, number>();
  const sessionDigests              = new Set<string>();
  // A clock decides here: a code seen in a window's address or a process list must stop buying a session soon after it was issued.
  const codeIsPastItsLife = (issuedAt: number): boolean => options.now() - issuedAt > SESSION_CODE_LIFETIME_MILLISECONDS;
  const forgetCodesPastTheirLife = (): void => {
    for (const [codeDigest, issuedAt] of issuedAtOfUnspentCodeDigest) {
      if (codeIsPastItsLife(issuedAt)) issuedAtOfUnspentCodeDigest.delete(codeDigest);
    }
  };
  return {
    issueCode: () => {
      forgetCodesPastTheirLife();
      const code = freshSecret();
      issuedAtOfUnspentCodeDigest.set(digestOf(code), options.now());
      return code;
    },
    exchangeCode: (code) => {
      const codeDigest = digestOf(code);
      const issuedAt   = issuedAtOfUnspentCodeDigest.get(codeDigest);
      if (issuedAt === undefined) return { verdict: 'refused' };
      issuedAtOfUnspentCodeDigest.delete(codeDigest);
      if (codeIsPastItsLife(issuedAt)) return { verdict: 'refused' };
      const sessionSecret = freshSecret();
      sessionDigests.add(digestOf(sessionSecret));
      return { verdict: 'exchanged', setCookieHeader: `${options.cookieName}=${sessionSecret}; Path=/; HttpOnly; SameSite=Strict` };
    },
    requestHoldsSession: (request) => cookieValuesIn(request, options.cookieName)
      .some((sessionSecret) => sessionSecret !== '' && sessionDigests.has(digestOf(sessionSecret))),
  };
}
