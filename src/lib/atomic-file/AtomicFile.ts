/**
 * The boundary to the file system's odd corners: a write goes through a temporary file beside the target, is flushed and renamed over
 * it, so a reader sees the whole old file or the whole new one, never a truncated one; a read answers with a verdict instead of a throw.
 */
import { randomUUID } from 'node:crypto';
import {
  open,
  readFile,
  rename,
  rm,
  type FileHandle,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export interface AtomicWriteOptions {
  /** The target's exact permission bits, set before the rename, so the target never appears with other bits; the umask does not narrow them. */
  readonly mode?: number;
}

export type AtomicWriteVerdict =
  | { readonly verdict: 'written' }
  | { readonly verdict: 'unwritable'; readonly failure: string };

export type AtomicReadVerdict =
  | { readonly verdict: 'readable'; readonly contents: string }
  | { readonly verdict: 'absent' }
  | { readonly verdict: 'unreadable'; readonly failure: string };

const TEMPORARY_FILE_SUFFIX = '.tmp';

/** The system's error code, `ENOENT` and its kin, or the message when the failure carries none. */
function failureOf(error: unknown): string {
  if (error instanceof Error) {
    const { code } = (error as NodeJS.ErrnoException);
    return code ?? error.message;
  }
  return String(error);
}

/** A name of its own beside the target, hidden, so two writers of one target never share a temporary file. */
function temporaryPathBeside(targetPath: string): string {
  return join(dirname(targetPath), `.${basename(targetPath)}.${randomUUID()}${TEMPORARY_FILE_SUFFIX}`);
}

async function writeAndFlush(temporaryFile: FileHandle, contents: string | Uint8Array, options: AtomicWriteOptions): Promise<void> {
  await temporaryFile.writeFile(contents);
  if (options.mode !== undefined) await temporaryFile.chmod(options.mode);
  await temporaryFile.sync();
}

async function write(targetPath: string, contents: string | Uint8Array, options: AtomicWriteOptions = {}): Promise<AtomicWriteVerdict> {
  const temporaryPath = temporaryPathBeside(targetPath);
  let temporaryFile: FileHandle | null = null;
  try {
    temporaryFile = await open(temporaryPath, 'wx', options.mode);
    await writeAndFlush(temporaryFile, contents, options);
    await temporaryFile.close();
    temporaryFile = null;
    await rename(temporaryPath, targetPath);
    return { verdict: 'written' };
  } catch (error) {
    await temporaryFile?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    return { verdict: 'unwritable', failure: failureOf(error) };
  }
}

async function read(targetPath: string): Promise<AtomicReadVerdict> {
  try {
    return { verdict: 'readable', contents: await readFile(targetPath, 'utf8') };
  } catch (error) {
    const failure = failureOf(error);
    return failure === 'ENOENT' ? { verdict: 'absent' } : { verdict: 'unreadable', failure };
  }
}

export const AtomicFile = {
  write,
  read,
} as const;
