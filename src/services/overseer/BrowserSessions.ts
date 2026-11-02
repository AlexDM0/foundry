/**
 * The Bridge's browser sessions, held in the Overseer's memory: `open` asks for a one-time code with the token, the browser exchanges the
 * code once for a session secret it keeps in an HttpOnly cookie. Only digests are kept, so a lookup's timing tells nothing of a secret.
 */
import { createHash, randomBytes } from 'node:crypto';

export interface BrowserSessions {
  /** A fresh code, good for one exchange. */
  issueCode:    () => string;
  /** The session secret a code buys, spending the code; `null` for a code never issued or already spent. */
  exchangeCode: (code: string) => string | null;
  holdsSession: (sessionSecret: string) => boolean;
}

const SECRET_BYTES = 32;

function digestOf(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function freshSecret(): string {
  return randomBytes(SECRET_BYTES).toString('hex');
}

export function createBrowserSessions(): BrowserSessions {
  const unspentCodeDigests = new Set<string>();
  const sessionDigests = new Set<string>();
  return {
    issueCode: () => {
      const code = freshSecret();
      unspentCodeDigests.add(digestOf(code));
      return code;
    },
    exchangeCode: (code) => {
      if (!unspentCodeDigests.delete(digestOf(code))) return null;
      const sessionSecret = freshSecret();
      sessionDigests.add(digestOf(sessionSecret));
      return sessionSecret;
    },
    holdsSession: (sessionSecret) => sessionDigests.has(digestOf(sessionSecret)),
  };
}
