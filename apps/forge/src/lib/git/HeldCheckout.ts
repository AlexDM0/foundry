/**
 * A git write into a checkout that another process holds a file of open. Windows cannot replace a held file, so git stops part way with
 * `unable to unlink old '<path>'`; POSIX unlinks a held file and never fails this way. Such a failure is told apart from the others and
 * tried again a bounded number of times, after the caller puts back what git already wrote.
 */
import type { GitRunFailure }                          from './@types/GitProblem.ts';
import { GitProcess, type GitHookPolicy, type GitRun } from './GitProcess.ts';

export const HELD_CHECKOUT_RETRY_TRIES = 3;

export const HELD_CHECKOUT_RETRY_STEP_MILLISECONDS = 500;

const HELD_FILE_LINE = /unable to unlink old '(.+?)'(?=:|$)/gm;

export interface CheckoutWritePrimitives {
  runGit: typeof GitProcess.run;
  pause:  (milliseconds: number) => void;
}

// Looked up on each call, so a spy a spec sets on `GitProcess.run` reaches this write too.
export const REAL_CHECKOUT_WRITE_PRIMITIVES: CheckoutWritePrimitives = Object.freeze({
  runGit: (...gitRun: Parameters<typeof GitProcess.run>) => GitProcess.run(...gitRun),
  pause:  (milliseconds: number) => Bun.sleepSync(milliseconds),
});

export interface CheckoutWriteRequest {
  directory:         string;
  gitArguments:      readonly string[];
  hookPolicy:        GitHookPolicy;
  ceilingDirectory?: string;
  /** Runs after each held-file failure, before the next try and before the last verdict. */
  afterHeldFailure:  () => void;
}

export type CheckoutWriteVerdict =
  | { verdict: 'written' }
  | { verdict: 'failed'; problem: GitRunFailure }
  | { verdict: 'target-file-held'; problem: GitRunFailure; heldFiles: string[] };

function heldFilesOf(finishedRun: GitRun | null): string[] {
  if (finishedRun === null) return [];
  const heldFiles = [...finishedRun.standardError.matchAll(HELD_FILE_LINE)].map((match) => match[1] ?? '');
  return [...new Set(heldFiles)].filter((path) => path !== '');
}

function writeRetryingWhileHeld(
  request: CheckoutWriteRequest, primitives: CheckoutWritePrimitives = REAL_CHECKOUT_WRITE_PRIMITIVES, attempt = 1
): CheckoutWriteVerdict {
  const run = primitives.runGit(request.directory, request.gitArguments, request.hookPolicy, undefined, request.ceilingDirectory);
  if (GitProcess.succeeded(run)) return { verdict: 'written' };
  const problem   = GitProcess.failureOf(run, request.gitArguments);
  const heldFiles = heldFilesOf(run);
  if (heldFiles.length === 0) return { verdict: 'failed', problem };
  request.afterHeldFailure();
  if (attempt >= HELD_CHECKOUT_RETRY_TRIES) return { verdict: 'target-file-held', problem, heldFiles };
  primitives.pause(HELD_CHECKOUT_RETRY_STEP_MILLISECONDS);
  return writeRetryingWhileHeld(request, primitives, attempt + 1);
}

export const HeldCheckout = Object.freeze({ heldFilesOf, writeRetryingWhileHeld });
