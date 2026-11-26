/**
 * The machine-wide cap on concurrent gate runs: one file per slot in the monitor folder, created exclusively and naming its holder, a child
 * folder, and the process answering for it. A slot whose holder is no longer live is taken over, so a crashed Hephaestus, an ended gate line
 * or one that died before it claimed frees its slot without a release.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join }         from 'node:path';

import { GateRunSlotIngestion, type GateRunHolding, type GateRunSlotReading } from '../../adapters/gate-run-slot/GateRunSlotIngestion.ts';
import { createGateRunSlotWriter }                                            from '../../adapters/gate-run-slot/GateRunSlotWriter.ts';
import { createFileAtomically, removeHeldFile }                               from '../../lib/atomic-file/AtomicFile.ts';
import type { FileReplace }                                                   from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                                           from '../../lib/atomic-file/FileReplaceFor.ts';
import { failureMeansTheFileIsHeld }                                          from '../../lib/atomic-file/HeldFileFailure.ts';
import type { PlatformPorts }                                                 from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                                               from '../../lib/process-identity/ProcessIdentity.ts';
import type { BoardChildren }                                                 from './BoardChildren.ts';
import { heldSlotCreateMeansTakenInThisProcess }                              from './HeldSlotCreateFor.ts';
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
  /** Where a slot that could not be read and is taken over is logged. */
  log:                   (line: string) => void;
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

/** A slot whose bytes could not be read at all is left for a later claim. */
function judgedSlotOf(slotPath: string): JudgedSlot | null {
  const reading = readingOf(slotPath);
  if (reading.verdict === 'absent') return null;
  const { storedText } = reading;
  return storedText === null ? null : { ...reading, storedText };
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

  /**
   * Moved aside before it is removed, so of two Hephaestus processes taking over one stale slot only the first removes it; a slot changed
   * since it was judged goes back as it was. An unreadable slot names no holder to judge, so it is taken over.
   */
  function freedIfStale(slotPath: string, judged: JudgedSlot): void {
    if (judged.verdict === 'readable' && options.holderIsLive(judged.holding)) return;
    const asidePath = `${slotPath}.${process.pid}.stale`;
    try {
      if (fileReplace.replaceFile(slotPath, asidePath).verdict === 'held') return;
    } catch {
      return;
    }
    const moved = readingOf(asidePath);
    const movedText = moved.verdict === 'absent' ? null : moved.storedText;
    if (movedText !== judged.storedText && movedText !== null && !createdExclusively(() => createFileAtomically(slotPath, movedText, fileReplace))) return;
    removeHeldFile(asidePath, fileReplace);
    if (judged.verdict === 'unreadable') options.log(`The gate run slot ${slotPath} could not be read (${judged.reason}); it was taken over.`);
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
      const judged = judgedSlotOf(slotPath);
      if (judged === null) continue;
      freedIfStale(slotPath, judged);
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
