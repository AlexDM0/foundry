/**
 * The Bridge's browser sessions, held in the Overseer's memory: `open` asks for a one-time code with the token, the browser exchanges the
 * code once, within `SESSION_CODE_LIFETIME_SECONDS`, for a session secret it keeps in an HttpOnly cookie. Only digests are kept, so a
 * lookup's timing tells nothing of a secret.
 */
import { createHash, randomBytes } from 'node:crypto';

import { SESSION_CODE_LIFETIME_SECONDS } from '../../shared/constants/OverseerLimits.ts';

export interface BrowserSessions {
  /** A fresh code, good for one exchange within its life. */
  issueCode:    () => string;
  /** The session secret a code buys, spending the code; `null` for a code never issued, already spent or past its life. */
  exchangeCode: (code: string) => string | null;
  holdsSession: (sessionSecret: string) => boolean;
}

const SECRET_BYTES = 32;
const MILLISECONDS_PER_SECOND = 1000;
const SESSION_CODE_LIFETIME_MILLISECONDS = SESSION_CODE_LIFETIME_SECONDS * MILLISECONDS_PER_SECOND;

function digestOf(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function freshSecret(): string {
  return randomBytes(SECRET_BYTES).toString('hex');
}

export function createBrowserSessions(now: () => Date): BrowserSessions {
  const issuedAtOfUnspentCodeDigest = new Map<string, number>();
  const sessionDigests = new Set<string>();
  // A clock decides here: a code read from another process's argv must stop buying a session soon after `open` issued it.
  const codeIsPastItsLife = (issuedAt: number): boolean => now().getTime() - issuedAt > SESSION_CODE_LIFETIME_MILLISECONDS;
  return {
    issueCode: () => {
      for (const [codeDigest, issuedAt] of issuedAtOfUnspentCodeDigest) {
        if (codeIsPastItsLife(issuedAt)) issuedAtOfUnspentCodeDigest.delete(codeDigest);
      }
      const code = freshSecret();
      issuedAtOfUnspentCodeDigest.set(digestOf(code), now().getTime());
      return code;
    },
    exchangeCode: (code) => {
      const codeDigest = digestOf(code);
      const issuedAt = issuedAtOfUnspentCodeDigest.get(codeDigest);
      if (issuedAt === undefined) return null;
      issuedAtOfUnspentCodeDigest.delete(codeDigest);
      if (codeIsPastItsLife(issuedAt)) return null;
      const sessionSecret = freshSecret();
      sessionDigests.add(digestOf(sessionSecret));
      return sessionSecret;
    },
    holdsSession: (sessionSecret) => sessionDigests.has(digestOf(sessionSecret)),
  };
}
