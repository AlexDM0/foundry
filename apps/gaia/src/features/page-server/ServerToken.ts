/**
 * Gaia's own bearer token: 32 fresh random bytes as hex at every start. A holder of the token is a process of the same user, such as the
 * launcher, which buys the page's session with it.
 */
import { randomBytes } from 'node:crypto';

import { writeServerToken } from '../../adapters/gaia-files/ServerTokenWriter.ts';

export type ServerTokenWriteVerdict =
  | { readonly verdict: 'written'; readonly token: string }
  | { readonly verdict: 'unwritable'; readonly failure: string };

const TOKEN_BYTES = 32;

/** Writes a fresh token over the one before, atomically, so a reader holds the old token or the new one, never a part. */
export async function writeFreshServerToken(homeDirectory: string): Promise<ServerTokenWriteVerdict> {
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const written = await writeServerToken(homeDirectory, token);
  return written.verdict === 'written' ? { verdict: 'written', token } : written;
}
