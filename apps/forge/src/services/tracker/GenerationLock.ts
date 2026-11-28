/**
 * One holder at a time on a lock directory, across processes: a directory of numbered generation records, each created exclusively and never
 * rewritten, so no step removes or replaces a record another process may have just written. A record's age frees nothing; one whose holder is
 * gone or whose shape cannot be read is stale, taken over and logged; a read that fails now holds, as it says nothing of the holder.
 */
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join }                               from 'node:path';

import type { GenerationRecordProblem }                                                  from '../../adapters/generation-record/@types/GenerationRecordProblem.ts';
import { type GenerationRecord, GenerationRecordIngestion, type GenerationRecordHolder } from '../../adapters/generation-record/GenerationRecordIngestion.ts';
import { createGenerationRecordWriter }                                                  from '../../adapters/generation-record/GenerationRecordWriter.ts';
import type { FileReplace }                                                              from '../../lib/atomic-file/FileReplace.ts';
import { LocalTimeUtil }                                                                 from '../../lib/local-time/LocalTimeUtil.ts';
import { OperationRefusal }                                                              from '../../shared/OperationRefusal.ts';
import { LIMITS }                                                                        from '../../shared/constants/Limits.ts';

/** A lock record's holder, as its generation record stores it; declared beside `LockHolderIsGone`, which names it. */
export type LockHolder = GenerationRecordHolder;

/** What a hold checks before each write: it throws once the hold's lock was taken over, so a holder misjudged as gone writes nothing further. */
export interface HoldFence {
  requireStillHeld(): void;
}

type LockPayload = Omit<GenerationRecord, 'state'>;

/** True only when the platform knows the recorded holder's process is gone; `false` whenever it cannot tell. */
export type LockHolderIsGone = (holder: LockHolder) => boolean;

/** Why a lock record was stale: the process it names is gone, or its shape cannot be read; the boundary words it. */
export type StaleLockReason<Problem = GenerationRecordProblem> =
  | { kind: 'holder-gone'; processId: number }
  | { kind: 'unreadable'; problem: Problem };

/** The newest record an acquisition took over, as a typed record the taker's log words. */
export interface StaleLockRecordTakenOver {
  recordPath: string;
  reason:     StaleLockReason;
}

/** Who takes a lock: the holder this process writes, read once when first needed, how it judges a holder it finds, and where its take-overs go. */
export interface LockTaker {
  holderOfThisProcess: () => LockHolder;
  holderIsGone:        LockHolderIsGone;
  /** Called once for each stale record this taker took over, so it is logged. */
  onStaleTakenOver:    (staleTakenOver: StaleLockRecordTakenOver) => void;
}

type AcquireAttempt =
  | { verdict: 'acquired'; generation: number; staleTakenOver?: StaleLockRecordTakenOver }
  | { verdict: 'held' }
  | { verdict: 'contended' };

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

/**
 * What judging the newest record needs: a released record is free without judging its holder, a held one names its holder. `removed` is a
 * record another holder removed after it moved past it, between the listing and this read. `bytes-unreadable` is a read that failed now,
 * which says nothing of the holder, so it fails closed as a listing that fails does.
 */
type GenerationReading =
  | { state: 'released' }
  | { state: 'held'; holder: LockHolder }
  | { state: 'removed' }
  | { state: 'bytes-unreadable' }
  | { state: 'unreadable'; problem: GenerationRecordProblem };

function readGenerationRecord(generationPath: string): GenerationReading {
  const reading = new GenerationRecordIngestion(generationPath).read();
  if (reading.verdict === 'absent') return { state: 'removed' };
  if (reading.verdict === 'bytes-unreadable') return { state: 'bytes-unreadable' };
  if (reading.verdict === 'unreadable') return { state: 'unreadable', problem: reading.problem };
  const { record } = reading;
  return record.state === 'released' ? { state: 'released' } : { state: 'held', holder: record.holder };
}

function generationWasCreated(lockDirectoryPath: string, generation: number, record: GenerationRecord, fileReplace?: FileReplace): boolean {
  return createGenerationRecordWriter(generationPathFor(lockDirectoryPath, generation), fileReplace).create(record) === 'created';
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
  let staleTakenOver: StaleLockRecordTakenOver | undefined;
  if (newest !== undefined) {
    const recordPath = generationPathFor(lockDirectoryPath, newest);
    const reading    = readGenerationRecord(recordPath);
    if (reading.state === 'removed') return { verdict: 'contended' };
    if (reading.state === 'bytes-unreadable') return { verdict: 'held' };
    if (reading.state === 'held' && !holderIsGone(reading.holder)) return { verdict: 'held' };
    if (reading.state === 'held') staleTakenOver = { recordPath, reason: { kind: 'holder-gone', processId: reading.holder.processId } };
    if (reading.state === 'unreadable') staleTakenOver = { recordPath, reason: { kind: 'unreadable', problem: reading.problem } };
  }
  afterStep('newest-judged-free');
  const claimed = generationAfter(newest ?? 0);
  if (claimed === null) return { verdict: 'held' };
  if (!generationWasCreated(lockDirectoryPath, claimed, { ...payload, state: 'held' })) return { verdict: 'contended' };
  afterStep('generation-created');
  if (newerGenerationExists(lockDirectoryPath, claimed)) return { verdict: 'contended' };
  removeGenerationsBelow(lockDirectoryPath, claimed);
  return staleTakenOver === undefined ? { generation: claimed, verdict: 'acquired' } : { generation: claimed, verdict: 'acquired', staleTakenOver };
}

/** A holder that was taken over finds its successor generation taken, and so changes nothing. */
function release(lockDirectoryPath: string, heldGeneration: number, payload: LockPayload, fileReplace?: FileReplace): void {
  const releaseGeneration = generationAfter(heldGeneration);
  if (releaseGeneration === null) return;
  try {
    if (generationWasCreated(lockDirectoryPath, releaseGeneration, { ...payload, state: 'released' }, fileReplace)) removeGenerationsBelow(lockDirectoryPath, releaseGeneration);
  } catch {
    // Nothing is left to release when the record cannot be written.
  }
}

function lockPayloadOf(holder: LockHolder, moment: Date): LockPayload {
  return { acquiredAt: LocalTimeUtil.formatLocalIso(moment), holder };
}

/** The steps `withLockAt` interleaves between processes: a spec replays a race by them, and the landing takes its lock by them without waiting. */
export const LockGenerationSteps = {
  acquireSteps: ACQUIRE_STEPS,
  attemptedAcquire,
  generationPathFor,
  generationsIn,
  lockPayloadOf,
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

/**
 * Run `action` with the lock at `lockDirectoryPath` held, releasing it however `action` ends. A held record is taken over only once the
 * taker judges its holder's process gone, never by its age; one that cannot be read is taken over too, and each take-over is logged.
 * Throws `OperationRefusal('unrepaired')` — exit 2 — its detail `tracker-lock-held` when the retry budget runs out.
 */
export async function withLockAt<ActionResult>(
  lockDirectoryPath: string,
  action: (hold: HoldFence) => Promise<ActionResult> | ActionResult,
  now: () => Date,
  taker: LockTaker,
): Promise<ActionResult> {
  const holder = taker.holderOfThisProcess();
  let heldGeneration: number | null = null;
  for (let attempt = 0; attempt < LIMITS.LOCK_RETRY_COUNT; attempt++) {
    const attemptResult = attemptedAcquire(lockDirectoryPath, lockPayloadOf(holder, now()), taker.holderIsGone);
    if (attemptResult.verdict === 'acquired') {
      heldGeneration = attemptResult.generation;
      if (attemptResult.staleTakenOver !== undefined) taker.onStaleTakenOver(attemptResult.staleTakenOver);
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
    release(lockDirectoryPath, heldGeneration, lockPayloadOf(holder, now()));
  }
}
