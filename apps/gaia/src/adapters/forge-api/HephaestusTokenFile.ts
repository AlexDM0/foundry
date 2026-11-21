/**
 * The ingestion of a Hephaestus's token file (F4): owner-only and fresh at each of Hephaestus's starts, so a caller reads it again before
 * each use. The token is a secret: it travels only as a bearer, never into a reading, an answer or a log line.
 */
import { AtomicFile } from '../../lib/atomic-file/AtomicFile.ts';

export class HephaestusTokenFile {
  readonly #tokenPath: string;

  public constructor(tokenPath: string) {
    this.#tokenPath = tokenPath;
  }

  /** The token, or `null` when the file cannot be read or holds nothing. */
  public async read(): Promise<string | null> {
    const stored = await AtomicFile.read(this.#tokenPath);
    if (stored.verdict !== 'readable') return null;
    const token = stored.contents.trim();
    return token === '' ? null : token;
  }
}
