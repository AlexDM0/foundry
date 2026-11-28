import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname }                         from 'node:path';
import type { Epic }                       from '../../domain/tracker-model/@types/Epic.ts';
import { writeFileAtomically }             from '../../lib/atomic-file/AtomicFile.ts';
import { EpicDocumentUtil }                from './utils/EpicDocumentUtil.ts';

/** Writes through `src/lib/atomic-file/AtomicFile.ts`; an epic whose frontmatter would read back unchanged keeps the stored frontmatter text. */
export function createEpicFileWriter(): {
  write(epic: Readonly<Epic>, location: string): void;
  remove(location: string): void;
  contentsOf(epic: Readonly<Epic>, location: string): string;
} {
  /** Reads the stored file at `location`, so it is taken before anything replaces it. */
  function contentsOf(epic: Readonly<Epic>, location: string): string {
    const storedFrontmatterText = unchangedStoredFrontmatterTextOf(epic, location);
    return storedFrontmatterText === null
      ? EpicDocumentUtil.epicDocumentTextOf(epic.frontmatter, epic.body, epic.lineEnding)
      : `${storedFrontmatterText}${epic.body}`;
  }

  function write(epic: Readonly<Epic>, location: string): void {
    mkdirSync(dirname(location), { recursive: true });
    writeFileAtomically(location, contentsOf(epic, location));
  }

  function remove(location: string): void {
    rmSync(location, { force: true });
  }

  return { write, remove, contentsOf };
}

function unchangedStoredFrontmatterTextOf(epic: Readonly<Epic>, location: string): string | null {
  let storedText: string;
  try {
    storedText = readFileSync(location, 'utf8');
  } catch {
    return null;
  }
  const stored = EpicDocumentUtil.parsedEpicDocumentOf(storedText);
  if (stored.verdict !== 'parsed') return null;

  const frontmatterTextOf = (frontmatter: Epic['frontmatter']): string => EpicDocumentUtil.epicDocumentTextOf(frontmatter, '', stored.lineEnding);
  if (frontmatterTextOf(stored.frontmatter) !== frontmatterTextOf(epic.frontmatter)) return null;
  return storedText.slice(0, storedText.length - stored.body.length);
}
