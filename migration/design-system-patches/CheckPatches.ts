/**
 * Says, for each patch of this folder in apply order, whether it still applies to a design-system package folder. Each patch's `index`
 * lines carry the git blob hash of every file it touches, before and after; the series is replayed over the folder's own hashes, so a
 * patch is told apart as applying, already applied, stale (a file changed outside the series) or blocked (an earlier patch does not apply).
 * Run it as `bun migration/design-system-patches/CheckPatches.ts <package folder>`.
 */
import { createHash }                            from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join }                                  from 'node:path';

/** A git blob hash in full: SHA-1, forty hexadecimal digits. */
const FULL_HASH_LENGTH = 40;

/** The hash git writes in a patch for a file that does not exist on that side. */
export const ABSENT_FILE_HASH = '0'.repeat(FULL_HASH_LENGTH);

const FULL_HASH_PATTERN = `[0-9a-f]{${FULL_HASH_LENGTH}}`;
const FILE_HEADER = /^diff --git a\/\S+ b\/(\S+)$/;
const INDEX_LINE = new RegExp(`^index (${FULL_HASH_PATTERN})\\.\\.(${FULL_HASH_PATTERN})(?: \\d+)?$`);
const PATCH_FILE_NAME = /^\d{2}-[a-z0-9-]+\.patch$/;

export interface PatchedFile {
  readonly path:       string;
  readonly hashBefore: string;
  readonly hashAfter:  string;
}

/** A patch as read from its file: the files it touches, or `null` when a file in it has no full hash to check. */
export interface PatchReading {
  readonly name:  string;
  readonly files: readonly PatchedFile[] | null;
}

export type PatchVerdict =
  | { readonly patch: string; readonly verdict: 'applies' | 'applied' | 'unreadable' }
  | { readonly patch: string; readonly verdict: 'stale'; readonly changedPaths: readonly string[] }
  | { readonly patch: string; readonly verdict: 'blocked'; readonly blockingPatch: string };

export function gitBlobHashOf(content: Uint8Array): string {
  return createHash('sha1').update(`blob ${content.byteLength}\0`).update(content).digest('hex');
}

export function patchReadingOf(name: string, patchText: string): PatchReading {
  const files: PatchedFile[] = [];
  let pathWithoutIndex: string | null = null;
  for (const line of patchText.split('\n')) {
    const fileHeader = FILE_HEADER.exec(line);
    if (fileHeader !== null) {
      if (pathWithoutIndex !== null) return { name, files: null };
      pathWithoutIndex = fileHeader[1] ?? null;
      continue;
    }
    const indexLine = INDEX_LINE.exec(line);
    if (indexLine !== null && pathWithoutIndex !== null) {
      files.push({ path: pathWithoutIndex, hashBefore: indexLine[1] ?? '', hashAfter: indexLine[2] ?? '' });
      pathWithoutIndex = null;
    }
  }
  return { name, files: pathWithoutIndex === null && files.length > 0 ? files : null };
}

interface FileHistory {
  /** The file's hash before the series, then after each patch that touches it. */
  readonly hashes:  string[];
  /** The patch that makes each step: `patches[k]` turns `hashes[k]` into `hashes[k + 1]`. */
  readonly patches: string[];
}

function fileHistoriesOf(readings: readonly PatchReading[]): Map<string, FileHistory> {
  const histories = new Map<string, FileHistory>();
  for (const reading of readings) {
    for (const file of reading.files ?? []) {
      const history = histories.get(file.path) ?? { hashes: [file.hashBefore], patches: [] };
      history.hashes.push(file.hashAfter);
      history.patches.push(reading.name);
      histories.set(file.path, history);
    }
  }
  return histories;
}

/** Where a file stands for one patch: changed outside the series, waiting on an earlier patch, next for this one, or past it. */
interface FileStanding {
  readonly path:          string;
  readonly standing:      'changed' | 'waiting' | 'next' | 'past';
  /** For a waiting file, the earlier patch that would move it on. */
  readonly blockingPatch: string | null;
}

/**
 * Replays the series over a folder: each file stands at the step of its history its hash matches, or at none when it changed outside the
 * series. A patch whose files are all next for it applies and moves them on; one whose files are all past it is applied.
 */
export function seriesVerdictsFor(readings: readonly PatchReading[], folderHashOf: (path: string) => string): PatchVerdict[] {
  const histories = fileHistoriesOf(readings);
  const stepByPath = new Map<string, number>();
  const stepOf = (path: string, history: FileHistory): number => {
    const step = stepByPath.get(path) ?? history.hashes.indexOf(folderHashOf(path));
    stepByPath.set(path, step);
    return step;
  };
  const standingOf = (patch: string, path: string): FileStanding => {
    const history = histories.get(path) ?? { hashes: [], patches: [] };
    const ownStep = history.patches.indexOf(patch);
    const step = stepOf(path, history);
    if (step === -1) return { path, standing: 'changed', blockingPatch: null };
    if (step < ownStep) return { path, standing: 'waiting', blockingPatch: history.patches[step] ?? null };
    return { path, standing: step === ownStep ? 'next' : 'past', blockingPatch: null };
  };
  return readings.map((reading): PatchVerdict => {
    if (reading.files === null) return { patch: reading.name, verdict: 'unreadable' };
    const standings = reading.files.map((file) => standingOf(reading.name, file.path));
    const pathsStanding = (standing: FileStanding['standing']) => standings.filter((file) => file.standing === standing).map(({ path }) => path);
    if (pathsStanding('changed').length > 0) return { patch: reading.name, verdict: 'stale', changedPaths: pathsStanding('changed') };
    const waiting = standings.find((file) => file.standing === 'waiting');
    if (waiting !== undefined) return { patch: reading.name, verdict: 'blocked', blockingPatch: waiting.blockingPatch ?? reading.name };
    if (pathsStanding('next').length === 0) return { patch: reading.name, verdict: 'applied' };
    // A patch applied in part holds files past it beside files it has not reached: git cannot apply it as it is.
    if (pathsStanding('past').length > 0) return { patch: reading.name, verdict: 'stale', changedPaths: pathsStanding('past') };
    for (const { path } of standings) stepByPath.set(path, (stepByPath.get(path) ?? 0) + 1);
    return { patch: reading.name, verdict: 'applies' };
  });
}

export function patchReadingsIn(patchFolder: string): PatchReading[] {
  return readdirSync(patchFolder)
    .filter((name) => PATCH_FILE_NAME.test(name))
    .sort()
    .map((name) => patchReadingOf(name, readFileSync(join(patchFolder, name), 'utf8')));
}

export function patchVerdictsFor(patchFolder: string, packageFolder: string): PatchVerdict[] {
  const folderHashOf = (path: string): string => {
    const filePath = join(packageFolder, path);
    return existsSync(filePath) ? gitBlobHashOf(readFileSync(filePath)) : ABSENT_FILE_HASH;
  };
  return seriesVerdictsFor(patchReadingsIn(patchFolder), folderHashOf);
}

function sentenceFor(verdict: PatchVerdict): string {
  switch (verdict.verdict) {
    case 'applies':    return `${verdict.patch} applies.`;
    case 'applied':    return `${verdict.patch} is applied already.`;
    case 'unreadable': return `${verdict.patch} names a file without its full hashes; write it again with --full-index.`;
    case 'stale':      return `${verdict.patch} is stale: ${verdict.changedPaths.join(', ')} changed since the patch was made.`;
    case 'blocked':    return `${verdict.patch} waits on ${verdict.blockingPatch}, which does not apply.`;
  }
}

function checkedExitCode(remainingArguments: readonly string[]): number {
  const [packageFolder] = remainingArguments;
  if (packageFolder === undefined || remainingArguments.length !== 1) {
    console.error('Usage: bun migration/design-system-patches/CheckPatches.ts <design-system package folder>');
    return 2;
  }
  const verdicts = patchVerdictsFor(import.meta.dir, packageFolder);
  for (const verdict of verdicts) console.log(sentenceFor(verdict));
  return verdicts.length > 0 && verdicts.every(({ verdict }) => verdict === 'applies' || verdict === 'applied') ? 0 : 1;
}

if (import.meta.main) process.exitCode = checkedExitCode(process.argv.slice(2));
