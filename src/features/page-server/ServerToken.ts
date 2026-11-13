/**
 * Gaia's own bearer token, `~/.gaia/token`: 32 fresh random bytes as hex at every start, owner-only in an owner-only folder. A holder of
 * the token is a process of the same user, such as the launcher, which buys the page's session with it.
 */
import { randomBytes } from 'node:crypto';
import { mkdir }       from 'node:fs/promises';
import { dirname }     from 'node:path';

import { serverTokenPathIn } from '../../adapters/gaia-files/ServerTokenFile.ts';
import { AtomicFile }        from '../../lib/atomic-file/AtomicFile.ts';

export type ServerTokenWriteVerdict =
  | { readonly verdict: 'written'; readonly token: string }
  | { readonly verdict: 'unwritable'; readonly failure: string };

const TOKEN_BYTES = 32;

const OWNER_ONLY_FILE_MODE = 0o600;

/** An existing folder keeps its mode: the settings writer makes it owner-only too, and Gaia never widens or narrows a folder it finds. */
const OWNER_ONLY_FOLDER_MODE = 0o700;

function failureOf(error: unknown): string {
  if (error instanceof Error) return (error as NodeJS.ErrnoException).code ?? error.message;
  return String(error);
}

/** Writes a fresh token over the one before, atomically, so a reader holds the old token or the new one, never a part. */
export async function writeFreshServerToken(homeDirectory: string): Promise<ServerTokenWriteVerdict> {
  const tokenPath = serverTokenPathIn(homeDirectory);
  try {
    await mkdir(dirname(tokenPath), { recursive: true, mode: OWNER_ONLY_FOLDER_MODE });
  } catch (error) {
    return { verdict: 'unwritable', failure: failureOf(error) };
  }
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const written = await AtomicFile.write(tokenPath, token, { mode: OWNER_ONLY_FILE_MODE });
  return written.verdict === 'written' ? { verdict: 'written', token } : written;
}
