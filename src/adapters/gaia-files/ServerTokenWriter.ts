/** Writes Gaia's own token to `~/.gaia/token`, atomically, owner-only in an owner-only folder, over the one before. */
import type { AtomicWriteVerdict } from '../../lib/atomic-file/AtomicFile.ts';
import { GaiaFile }                from './GaiaFile.ts';
import { serverTokenPathIn }       from './ServerTokenFile.ts';

const OWNER_ONLY_FILE_MODE = 0o600;

/** An existing folder keeps its mode: the settings writer makes it owner-only too, and Gaia never widens or narrows a folder it finds. */
const OWNER_ONLY_FOLDER_MODE = 0o700;

export async function writeServerToken(homeDirectory: string, token: string): Promise<AtomicWriteVerdict> {
  return GaiaFile.writeText(serverTokenPathIn(homeDirectory), token, { folderMode: OWNER_ONLY_FOLDER_MODE, fileMode: OWNER_ONLY_FILE_MODE });
}
