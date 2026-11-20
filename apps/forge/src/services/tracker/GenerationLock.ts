/**
 * One holder at a time on a lock directory, across processes. The lock is a directory of numbered generation
 * records, each created exclusively and never rewritten: taking the lock is creating the generation after
 * the newest once that one is released or stale, and releasing is creating the next as a released record,
 * so no step ever removes or replaces a record another process may have just written.
 *
 * A stated exception to "a clock decides nothing": it decides only lock staleness, against a time the tool
 * itself wrote; the fallback to the record's own mtime, reached only when the record is missing,
 * unparseable or holds an unparseable time, fails closed both ways.
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync
} from 'node:fs';
import { join } from 'node:path';

import { createFileAtomically } from '../../lib/atomic-file/AtomicFile.ts';
import type { FileReplace }     from '../../lib/atomic-file/FileReplace.ts';
import { LocalTimeUtil }        from '../../lib/local-time/LocalTimeUtil.ts';
import { OperationRefusal }     from '../../shared/OperationRefusal.ts';
import { LIMITS }               from '../../shared/constants/Limits.ts';

/** What a hold checks before each write: it throws once the hold's lock was taken over, so a stale holder writes nothing further. */
export interface HoldFence {
  requireStillHeld(): void;
}

interface LockPayload {
  processId:  number;
  acquiredAt: string;
}

const GENERATION_STATES = ['held', 'released'] as const;
type GenerationState = typeof GENERATION_STATES[number];

interface GenerationRecord extends LockPayload {
  state: GenerationState;
}

/** The platform's answer whether a holder's process is gone, which reads a zombie as gone; `false` when it cannot tell. */
export type LockHolderIsGone = (processId: number) => boolean;

/** For a caller without the platform's check: every holder reads as live, so only a stale stamp frees the lock. */
export const NO_LOCK_HOLDER_READS_AS_GONE: LockHolderIsGone = () => false;

type AcquireAttempt = { verdict: 'acquired'; generation: number } | { verdict: 'held' } | { verdict: 'contended' };

const ACQUIRE_STEPS = ['newest-judged-free', 'generation-created'] as const;
type AcquireStep = typeof ACQUIRE_STEPS[number];

const GENERATION_FILE_PREFIX    = 'generation-';
const GENERATION_DIGITS_PATTERN = /^[1-9]\d*$/;

function generationNumberOf(fileName: string): number | null {
  if (!fileName.startsWith(GENERATION_FILE_PREFIX)) return null;
  const digits = fileName.slice(GENERATION_FILE_PREFIX.length);
  if (!GENERATION_DIGITS_PATTERN.test(digits)) return null;
  const generation = Number(digits);
  return Number.isSafeInteger(generation) ? generation : null;
}

/** `null` past the largest safe integer, whose successor no listing could see: the caller then fails closed. */
function generationAfter(generation: number): number | null {
  const successor = generation + 1;
  return Number.isSafeInteger(successor) ? successor : null;
}

function generationPathFor(lockDirectoryPath: string, generation: number): string {
  return join(lockDirectoryPath, `${GENERATION_FILE_PREFIX}${generation}`);
}

/** Ascending; `null` when the directory cannot be listed, which every caller reads as held. */
function generationsIn(lockDirectoryPath: string): number[] | null {
  try {
    return readdirSync(lockDirectoryPath)
      .map(generationNumberOf)
      .filter((generation): generation is number => generation !== null)
      .sort((a, b) => a - b);
  } catch {
    return null;
  }
}

function readGenerationRecord(generationPath: string): GenerationRecord | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(generationPath, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { processId, acquiredAt, state } = parsed as { processId?: unknown; acquiredAt?: unknown; state?: unknown };
    if (typeof processId !== 'number' || typeof acquiredAt !== 'string') return null;
    const knownState = GENERATION_STATES.find((candidate) => candidate === state);
    if (knownState === undefined) return null;
    return { acquiredAt, processId, state: knownState };
  } catch {
    return null;
  }
}

/**
 * An unreadable record is not free on that ground alone: the tool never writes one, so it is judged on
 * the age of its own mtime and waits when that cannot decide either.
 */
function generationIsFree(generationPath: string, nowMilliseconds: number, holderIsGone: LockHolderIsGone): boolean {
  const record = readGenerationRecord(generationPath);
  if (record === null) return fileIsOlderThanTheStaleThreshold(generationPath, nowMilliseconds);
  if (record.state === 'released' || holderIsGone(record.processId)) return true;
  const acquiredAtMilliseconds = Date.parse(record.acquiredAt);
  if (Number.isNaN(acquiredAtMilliseconds)) return fileIsOlderThanTheStaleThreshold(generationPath, nowMilliseconds);
  return nowMilliseconds - acquiredAtMilliseconds > LIMITS.LOCK_STALE_MILLISECONDS;
}

function fileIsOlderThanTheStaleThreshold(filePath: string, nowMilliseconds: number): boolean {
  try {
    return nowMilliseconds - statSync(filePath).mtimeMs > LIMITS.LOCK_STALE_MILLISECONDS;
  } catch {
    // Fail closed: a `stat` that errors is not an argument for taking someone else's lock.
    return false;
  }
}

function generationWasCreated(lockDirectoryPath: string, generation: number, record: GenerationRecord, fileReplace?: FileReplace): boolean {
  return createFileAtomically(generationPathFor(lockDirectoryPath, generation), JSON.stringify(record), fileReplace) === 'created';
}

function newerGenerationExists(lockDirectoryPath: string, generation: number): boolean {
  const generations = generationsIn(lockDirectoryPath);
  return generations === null || generations.some((existing) => existing > generation);
}

/** Only ever below a generation this process created, which is never the newest another process could be judging. */
function removeGenerationsBelow(lockDirectoryPath: string, generation: number): void {
  for (const existing of generationsIn(lockDirectoryPath) ?? []) {
    if (existing >= generation) continue;
    try {
      unlinkSync(generationPathFor(lockDirectoryPath, existing));
    } catch {
      // Another holder removed it first, which is the state this loop was reaching for.
    }
  }
}

/**
 * The generation after the newest is created only once the newest is judged free, and whoever creates it
 * holds the lock unless a newer one already exists: that newer one means the generation it took had been
 * removed after a holder moved past it. `afterStep` lets a spec interleave.
 */
function attemptedAcquire(
  lockDirectoryPath: string,
  payload: LockPayload,
  nowMilliseconds: number,
  holderIsGone: LockHolderIsGone,
  afterStep: (step: AcquireStep) => void = () => {},
): AcquireAttempt {
  try {
    mkdirSync(lockDirectoryPath, { recursive: true });
  } catch {
    // A path that cannot become the directory is judged by the listing below, which reads it as held.
  }
  const generations = generationsIn(lockDirectoryPath);
  if (generations === null) return { verdict: 'held' };
  const newest = generations.at(-1);
  if (newest !== undefined && !generationIsFree(generationPathFor(lockDirectoryPath, newest), nowMilliseconds, holderIsGone)) return { verdict: 'held' };
  afterStep('newest-judged-free');
  const claimed = generationAfter(newest ?? 0);
  if (claimed === null) return { verdict: 'held' };
  if (!generationWasCreated(lockDirectoryPath, claimed, { ...payload, state: 'held' })) return { verdict: 'contended' };
  afterStep('generation-created');
  if (newerGenerationExists(lockDirectoryPath, claimed)) return { verdict: 'contended' };
  removeGenerationsBelow(lockDirectoryPath, claimed);
  return { generation: claimed, verdict: 'acquired' };
}

/** A holder that was taken over as stale finds its successor generation taken, and so changes nothing. */
function release(lockDirectoryPath: string, heldGeneration: number, payload: LockPayload, fileReplace?: FileReplace): void {
  const releaseGeneration = generationAfter(heldGeneration);
  if (releaseGeneration === null) return;
  try {
    if (generationWasCreated(lockDirectoryPath, releaseGeneration, { ...payload, state: 'released' }, fileReplace)) removeGenerationsBelow(lockDirectoryPath, releaseGeneration);
  } catch {
    // Nothing is left to release when the record cannot be written.
  }
}

/** The steps `withLockAt` interleaves between processes, exposed so a spec can replay a race step by step. */
export const LockGenerationSteps = {
  acquireSteps: ACQUIRE_STEPS,
  attemptedAcquire,
  generationPathFor,
  generationsIn,
  release,
} as const;

/** The hold `action` runs under: `requireStillHeld` refuses `lock-taken-over` (unrepaired) once a newer generation exists. */
function lockHoldOf(lockDirectoryPath: string, heldGeneration: number): HoldFence {
  return {
    requireStillHeld: () => {
      if (newerGenerationExists(lockDirectoryPath, heldGeneration)) throw new OperationRefusal('unrepaired', { kind: 'lock-taken-over', lockDirectoryPath });
    },
  };
}

function lockPayloadAt(moment: Date): LockPayload {
  return { acquiredAt: LocalTimeUtil.formatLocalIso(moment), processId: process.pid };
}

/**
 * Run `action` with the lock at `lockDirectoryPath` held, releasing it however `action` ends. A held record is taken over once its process
 * is gone or its stamp is more than `LIMITS.LOCK_STALE_MILLISECONDS` old, live holder or not; one stamped in the future by a live holder
 * never goes stale. Throws `OperationRefusal('unrepaired')`, its detail `tracker-lock-held` — exit 2 — when the retry budget runs out.
 */
export async function withLockAt<ActionResult>(
  lockDirectoryPath: string,
  action: (hold: HoldFence) => Promise<ActionResult> | ActionResult,
  now: () => Date,
  holderIsGone: LockHolderIsGone,
): Promise<ActionResult> {
  let heldGeneration: number | null = null;
  for (let attempt = 0; attempt < LIMITS.LOCK_RETRY_COUNT; attempt++) {
    // Stamped at each attempt, so the wait before it does not count against the holder's staleness budget.
    const attemptedAt   = now();
    const attemptResult = attemptedAcquire(lockDirectoryPath, lockPayloadAt(attemptedAt), attemptedAt.getTime(), holderIsGone);
    if (attemptResult.verdict === 'acquired') {
      heldGeneration = attemptResult.generation;
      break;
    }
    // Contention retries immediately rather than sleeping: another process just moved the lock, and its newest record decides.
    if (attemptResult.verdict === 'contended') continue;
    await Bun.sleep(LIMITS.LOCK_RETRY_INTERVAL_MILLISECONDS);
  }

  if (heldGeneration === null) {
    throw new OperationRefusal('unrepaired', { kind: 'tracker-lock-held', lockDirectoryPath });
  }

  try {
    return await action(lockHoldOf(lockDirectoryPath, heldGeneration));
  } finally {
    release(lockDirectoryPath, heldGeneration, { acquiredAt: LocalTimeUtil.formatLocalIso(now()), processId: process.pid });
  }
}
