/**
 * Where Gaia's own token lives, `~/.gaia/token`, and its reading. The page server writes a fresh one at every start; a process of the same
 * user, such as the launcher, reads it to buy a window's session. The token is a secret: it travels only as a bearer to 127.0.0.1.
 */
import { join } from 'node:path';

import { AtomicFile }    from '../../lib/atomic-file/AtomicFile.ts';
import { PRODUCT_NAMES } from '../../shared/constants/ProductNames.ts';

const TOKEN_FILE_NAME = 'token';

export function serverTokenPathIn(homeDirectory: string): string {
  return join(homeDirectory, PRODUCT_NAMES.dataFolderName, TOKEN_FILE_NAME);
}

export class ServerTokenFile {
  readonly #homeDirectory: string;

  public constructor(homeDirectory: string) {
    this.#homeDirectory = homeDirectory;
  }

  /** The token, or `null` when the file cannot be read or holds nothing. */
  public async read(): Promise<string | null> {
    const stored = await AtomicFile.read(serverTokenPathIn(this.#homeDirectory));
    if (stored.verdict !== 'readable') return null;
    const token = stored.contents.trim();
    return token === '' ? null : token;
  }
}
