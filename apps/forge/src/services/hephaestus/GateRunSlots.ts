/**
 * The machine-wide cap on concurrent gate runs: one file per slot in the monitor folder, created exclusively and naming its holder. A stale
 * slot, its holder no longer live or the slot unreadable, is taken over under a taking marker, so a crashed holder frees it without a release.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join }         from 'node:path';

import type { HephaestusLog }                                                 from '../../adapters/@types/HephaestusLogRecord.ts';
import type { GateRunSlotProblem }                                            from '../../adapters/gate-run-slot/@types/GateRunSlotProblem.ts';
import { GateRunSlotIngestion, type GateRunHolding, type GateRunSlotReading } from '../../adapters/gate-run-slot/GateRunSlotIngestion.ts';
import { createGateRunSlotWriter }                                            from '../../adapters/gate-run-slot/GateRunSlotWriter.ts';
import { removeHeldFile }                                                     from '../../lib/atomic-file/AtomicFile.ts';
import type { FileReplace }                                                   from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                                           from '../../lib/atomic-file/FileReplaceFor.ts';
import { failureMeansTheFileIsHeld }                                          from '../../lib/atomic-file/HeldFileFailure.ts';
import type { PlatformPorts }                                                 from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                                               from '../../lib/process-identity/ProcessIdentity.ts';
import type { BoardChildren }                                                 from './BoardChildren.ts';
import { heldSlotCreateMeansTakenInThisProcess }                              from './HeldSlotCreateFor.ts';
import { type SlotTaker, StaleSlotTakeOver }                                  from './StaleSlotTakeOver.ts';
import { liveLinesUnder }                                                     from './TalosLines.ts';

export interface GateRunSlotsOptions {
  ports:                 PlatformPorts;
  folder:                string;
  limit:                 number;
  holderIsLive:          (holding: GateRunHolding) => boolean;
  retryMilliseconds:     number;
  /** The moves a slot is created and freed through; the port of this process when not given. */
  fileReplace?:          FileReplace;
  /** Whether a held-file failure on a slot create means a taken slot rather than a fault; this process's platform decides when not given. */
  heldCreateMeansTaken?: boolean;
  /** Where a stale slot taken over is logged, and a slot left in place, once, when its bytes cannot be read at all. */
  log:                   HephaestusLog;
}

export interface GateRunSlots {
  /** Whether `holder` holds a slot after the call: one it held already, or a free one it took. */
  tryAcquire:               (holder: string) => boolean;
  /**
   * `tryAcquire` for a gate profile, which comes after every real gate: refused while a gate this process waits on, or one refused since
   * the round began, still has no slot. A refused profile counts as no waiting gate.
   */
  tryAcquireAfterRealGates: (holder: string) => boolean;
  /** A drive pass's round of real gate starts begins: a gate refused in an earlier round and not tried again waits no longer. */
  startRound:               () => void;
  /** The Talos that runs the gate line answers for the slot from here on; `null` for one already gone. */
  recordSpawnedProcess:     (holder: string, spawnedProcess: ProcessIdentity | null) => void;
  release:                  (holder: string) => void;
  /** Waits until `holder` holds a slot, and answers its release; throws `GateSlotWaitStoppedError` once `stopSignal` aborts first. */
  acquire:                  (holder: string, stopSignal?: AbortSignal) => Promise<() => void>;
}

/** The run that waited for a gate slot was stopped before it got one. */
export class GateSlotWaitStoppedError extends Error {
  constructor(holder: string) {
    super(`the wait for a gate slot for ${holder} was stopped`);
    this.name = 'GateSlotWaitStoppedError';
  }
}

/** Sleeps the retry interval, or less when the stop signal aborts meanwhile. */
async function sleepUnlessStopped(milliseconds: number, stopSignal: AbortSignal | undefined): Promise<void> {
  if (stopSignal === undefined) {
    await Bun.sleep(milliseconds);
    return;
  }
  await new Promise<void>((resolve) => {
    const wakeOnStop = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      stopSignal.removeEventListener('abort', wakeOnStop);
      resolve();
    }, milliseconds);
    stopSignal.addEventListener('abort', wakeOnStop, { once: true });
  });
}

const SLOT_FILE_PREFIX = 'slot-';

/** A slot as it was judged, with the text it was judged by. */
type JudgedSlot = Exclude<GateRunSlotReading, { verdict: 'absent' }> & { storedText: string };

function readingOf(slotPath: string): GateRunSlotReading {
  return new GateRunSlotIngestion(slotPath).read();
}

/** A slot whose bytes could not be read at all is left for a later claim, and handed to `bytesUnreadable`. */
function judgedSlotOf(slotPath: string, bytesUnreadable: (slotPath: string, problem: GateRunSlotProblem) => void): JudgedSlot | null {
  const reading = readingOf(slotPath);
  if (reading.verdict === 'absent') return null;
  if (reading.verdict === 'readable') return reading;
  if (reading.storedText !== null) return { ...reading, storedText: reading.storedText };
  bytesUnreadable(slotPath, reading.problem);
  return null;
}

/** An unreadable slot names no holder. */
function holderIn(slotPath: string): string | null {
  const reading = readingOf(slotPath);
  return reading.verdict === 'readable' ? reading.holding.holder : null;
}

function processIsStillRunning({ processSupervision }: PlatformPorts, recorded: ProcessIdentity | null): boolean {
  if (recorded === null) return false;
  const current = processSupervision.identityOf(recorded.processId);
  return current !== null && processSupervision.sameProcess(current, recorded);
}

/**
 * Every holder is a child folder: a gate line's own folder is live while its newest child is. A run's folder, whose lines run in step
 * folders below it, is live while a line below it is, and between its lines while the recorded acquirer still runs; so is a line's folder
 * before any child record exists. A holder whose parent folder is gone is never live.
 */
function gateRunHolderIsLive(children: BoardChildren, ports: PlatformPorts, holding: GateRunHolding): boolean {
  const { holder } = holding;
  if (!existsSync(dirname(holder))) return false;
  const newestInstance = children.newestInstanceIn(holder);
  if (newestInstance !== null) return children.livenessOf(holder, newestInstance).verdict === 'live';
  return liveLinesUnder(children, holder).length > 0 || processIsStillRunning(ports, holding.process);
}

function createGateRunSlots(options: GateRunSlotsOptions): GateRunSlots {
  const slotPaths = Array.from({ length: options.limit }, (_unused, index) => join(options.folder, `${SLOT_FILE_PREFIX}${index + 1}`));
  const fileReplace = options.fileReplace ?? fileReplaceOfThisProcess();
  const heldCreateMeansTaken = options.heldCreateMeansTaken ?? heldSlotCreateMeansTakenInThisProcess();
  let acquirerIdentity: ProcessIdentity | null | undefined;
  const realGatesRefusedThisRound = new Set<string>();
  const realGatesWaitingInThisProcess = new Set<string>();
  const unreadableSlotPathsLogged = new Set<string>();

  function logUnreadableSlotOnce(slotPath: string, problem: GateRunSlotProblem): void {
    if (!unreadableSlotPathsLogged.has(slotPath)) {
      options.log({ kind: 'gate-run-slot-unreadable', slotPath, problem });
    }
    unreadableSlotPathsLogged.add(slotPath);
  }

  function acquirer(): ProcessIdentity | null {
    acquirerIdentity ??= options.ports.processSupervision.identityOf(process.pid);
    return acquirerIdentity;
  }

  /** On Windows a create over a slot that is being deleted fails as a held file, so that slot reads as taken; elsewhere those codes are faults. */
  function createdExclusively(create: () => 'created' | 'already-exists'): boolean {
    try {
      return create() === 'created';
    } catch (failure) {
      if (heldCreateMeansTaken && failureMeansTheFileIsHeld(failure)) return false;
      throw failure;
    }
  }

  /** A taking marker names the holding its taker is about to claim, so it is judged by the process of that taker, this one. */
  function slotTakerFor(ownHolding: GateRunHolding): SlotTaker {
    return {
      fileReplace,
      storedTextAt: (path) => {
        const reading = readingOf(path);
        return reading.verdict === 'absent' ? null : reading.storedText;
      },
      createdMarker: (markerPath) => createdExclusively(() => createGateRunSlotWriter(markerPath, fileReplace).create(ownHolding)),
      markerAt:      (markerPath) => {
        const marker = readingOf(markerPath);
        if (marker.verdict === 'absent' || marker.storedText === null) return null;
        return { storedText: marker.storedText, takerIsLive: marker.verdict === 'readable' && processIsStillRunning(options.ports, marker.holding.process) };
      },
    };
  }

  /** An unreadable slot names no holder to judge, so it is taken over. */
  function freedIfStale(slotPath: string, judged: JudgedSlot, ownHolding: GateRunHolding): void {
    if (judged.verdict === 'readable' && options.holderIsLive(judged.holding)) return;
    if (!StaleSlotTakeOver.staleSlotFreed(slotPath, judged.storedText, slotTakerFor(ownHolding))) return;
    const reason = judged.verdict === 'unreadable'
      ? { kind: 'unreadable', problem: judged.problem } as const
      : { kind: 'holder-not-live', holder: judged.holding.holder } as const;
    options.log({ kind: 'gate-run-slot-taken-over', slotPath, reason });
  }

  function tryAcquire(holder: string): boolean {
    const acquired = takeSlot(holder);
    if (acquired) realGatesRefusedThisRound.delete(holder);
    else realGatesRefusedThisRound.add(holder);
    return acquired;
  }

  function tryAcquireAfterRealGates(holder: string): boolean {
    if (realGatesRefusedThisRound.size > 0 || realGatesWaitingInThisProcess.size > 0) return false;
    return takeSlot(holder);
  }

  function startRound(): void {
    realGatesRefusedThisRound.clear();
  }

  function takeSlot(holder: string): boolean {
    mkdirSync(options.folder, { recursive: true });
    if (slotPaths.some((slotPath) => holderIn(slotPath) === holder)) return true;
    const ownHolding = { holder, process: acquirer() };
    for (const slotPath of slotPaths) {
      const writer = createGateRunSlotWriter(slotPath, fileReplace);
      if (createdExclusively(() => writer.create(ownHolding))) return true;
      const judged = judgedSlotOf(slotPath, logUnreadableSlotOnce);
      if (judged === null) continue;
      freedIfStale(slotPath, judged, ownHolding);
      if (createdExclusively(() => writer.create(ownHolding))) return true;
    }
    return false;
  }

  function recordSpawnedProcess(holder: string, spawnedProcess: ProcessIdentity | null): void {
    for (const slotPath of slotPaths) {
      if (holderIn(slotPath) === holder) createGateRunSlotWriter(slotPath).write({ holder, process: spawnedProcess });
    }
  }

  function release(holder: string): void {
    for (const slotPath of slotPaths) {
      if (holderIn(slotPath) === holder) removeHeldFile(slotPath);
    }
  }

  async function acquire(holder: string, stopSignal?: AbortSignal): Promise<() => void> {
    realGatesWaitingInThisProcess.add(holder);
    try {
      while (!tryAcquire(holder)) {
        if (stopSignal?.aborted === true) {
          // A stopped gate waits no longer, so it holds no gate profile back either.
          realGatesRefusedThisRound.delete(holder);
          throw new GateSlotWaitStoppedError(holder);
        }
        await sleepUnlessStopped(options.retryMilliseconds, stopSignal);
      }
    } finally {
      realGatesWaitingInThisProcess.delete(holder);
    }
    return () => release(holder);
  }

  return {
    tryAcquire, tryAcquireAfterRealGates, startRound, recordSpawnedProcess, release, acquire
  };
}

export const GateRunSlots = Object.freeze({
  createGateRunSlots,
  gateRunHolderIsLive,
});
