/**
 * The machine-wide cap on concurrent gate runs: one file per slot in the monitor folder, created exclusively and naming its holder and the
 * process answering for it. A slot whose holder is no longer live is taken over, so a crashed Overseer, an ended gate Watcher or one that
 * died before it claimed frees its slot without a release.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join }                       from 'node:path';

import { createFileAtomically, removeHeldFile, writeFileAtomically } from '../../lib/atomic-file/AtomicFile.ts';
import type { FileReplace }                                          from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                                  from '../../lib/atomic-file/FileReplaceFor.ts';
import { failureMeansTheFileIsHeld }                                 from '../../lib/atomic-file/HeldFileFailure.ts';
import type { PlatformPorts }                                        from '../../lib/platform-ports/PlatformPortsFor.ts';
import { type ProcessIdentity, storedIdentityOf }                    from '../../lib/process-identity/ProcessIdentity.ts';
import { heldSlotCreateMeansTakenInThisProcess }                     from './HeldSlotCreateFor.ts';
import { WatcherFleet }                                              from './WatcherFleet.ts';

const GATE_WATCHER_INSTANCE = 1;

/** A slot's holder and the process answering for it while its gate Watcher has not claimed: the acquirer until the spawn is recorded. */
export interface GateRunHolding {
  holder:  string;
  process: ProcessIdentity | null;
}

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
}

export interface GateRunSlots {
  /** Whether `holder` holds a slot after the call: one it held already, or a free one it took. */
  tryAcquire:           (holder: string) => boolean;
  /** The spawned gate Watcher answers for the slot from here on; `null` for a spawn already gone. */
  recordSpawnedProcess: (holder: string, spawnedProcess: ProcessIdentity | null) => void;
  release:              (holder: string) => void;
  /** Waits until `holder` holds a slot, and answers its release. */
  acquire:              (holder: string) => Promise<() => void>;
}

const SLOT_FILE_PREFIX = 'slot-';
const HOLDING_SEPARATOR = '\n';

function slotTextIn(slotPath: string): string | null {
  try {
    return readFileSync(slotPath, 'utf8');
  } catch {
    return null;
  }
}

function slotTextOf(holding: GateRunHolding): string {
  return holding.process === null ? holding.holder : `${holding.holder}${HOLDING_SEPARATOR}${JSON.stringify(holding.process)}`;
}

/** An unreadable process line reads as no process, so the holder is judged by its Watcher alone. */
function holdingOf(slotText: string): GateRunHolding {
  const separatorIndex = slotText.indexOf(HOLDING_SEPARATOR);
  if (separatorIndex < 0) return { holder: slotText, process: null };
  let recordedProcess: unknown = null;
  try {
    recordedProcess = JSON.parse(slotText.slice(separatorIndex + HOLDING_SEPARATOR.length));
  } catch {
    recordedProcess = null;
  }
  return { holder: slotText.slice(0, separatorIndex), process: storedIdentityOf(recordedProcess) };
}

function holderIn(slotPath: string): string | null {
  const slotText = slotTextIn(slotPath);
  return slotText === null ? null : holdingOf(slotText).holder;
}

const IN_PROCESS_HOLDER_PREFIX = 'process:';
const HOLDER_SEPARATOR = ':';

/** A gate an Overseer runs itself, such as a merge gate: live while that Overseer's process is. */
function inProcessHolderOf(label: string): string {
  return `${IN_PROCESS_HOLDER_PREFIX}${process.pid}${HOLDER_SEPARATOR}${label}`;
}

function processIsStillRunning({ processSupervision }: PlatformPorts, recorded: ProcessIdentity | null): boolean {
  if (recorded === null) return false;
  const current = processSupervision.identityOf(recorded.processId);
  return current !== null && processSupervision.sameProcess(current, recorded);
}

/**
 * A gate Watcher's holder is its Watcher folder: live while its Watcher is, and before it claimed, while the recorded process still runs. A holder
 * whose job folder is gone is never live.
 */
function gateRunHolderIsLive(ports: PlatformPorts, holding: GateRunHolding): boolean {
  const { holder } = holding;
  if (holder.startsWith(IN_PROCESS_HOLDER_PREFIX)) {
    return !ports.processSupervision.processIsGone(Number(holder.slice(IN_PROCESS_HOLDER_PREFIX.length).split(HOLDER_SEPARATOR)[0]));
  }
  if (!existsSync(dirname(holder))) return false;
  const { verdict } = WatcherFleet.livenessOf(ports, holder, GATE_WATCHER_INSTANCE);
  if (verdict === 'live') return true;
  return verdict === 'unclaimed' && processIsStillRunning(ports, holding.process);
}

function createGateRunSlots(options: GateRunSlotsOptions): GateRunSlots {
  const slotPaths = Array.from({ length: options.limit }, (_unused, index) => join(options.folder, `${SLOT_FILE_PREFIX}${index + 1}`));
  const fileReplace = options.fileReplace ?? fileReplaceOfThisProcess();
  const heldCreateMeansTaken = options.heldCreateMeansTaken ?? heldSlotCreateMeansTakenInThisProcess();
  let acquirerIdentity: ProcessIdentity | null | undefined;

  function acquirer(): ProcessIdentity | null {
    acquirerIdentity ??= options.ports.processSupervision.identityOf(process.pid);
    return acquirerIdentity;
  }

  /** On Windows a create over a slot that is being deleted fails as a held file, so that slot reads as taken; elsewhere those codes are faults. */
  function createdExclusively(slotPath: string, slotText: string): boolean {
    try {
      return createFileAtomically(slotPath, slotText, fileReplace) === 'created';
    } catch (failure) {
      if (heldCreateMeansTaken && failureMeansTheFileIsHeld(failure)) return false;
      throw failure;
    }
  }

  /** Moved aside before it is removed, so of two Overseers taking over one stale slot only the first removes it. */
  function freedIfStale(slotPath: string, slotText: string): void {
    if (options.holderIsLive(holdingOf(slotText))) return;
    const asidePath = `${slotPath}.${process.pid}.stale`;
    try {
      if (fileReplace.replaceFile(slotPath, asidePath).verdict === 'held') return;
    } catch {
      return;
    }
    const movedText = slotTextIn(asidePath);
    if (movedText !== slotText && movedText !== null && !createdExclusively(slotPath, movedText)) return;
    removeHeldFile(asidePath, fileReplace);
  }

  function tryAcquire(holder: string): boolean {
    mkdirSync(options.folder, { recursive: true });
    if (slotPaths.some((slotPath) => holderIn(slotPath) === holder)) return true;
    const ownText = slotTextOf({ holder, process: acquirer() });
    for (const slotPath of slotPaths) {
      if (createdExclusively(slotPath, ownText)) return true;
      const current = slotTextIn(slotPath);
      if (current === null) continue;
      freedIfStale(slotPath, current);
      if (createdExclusively(slotPath, ownText)) return true;
    }
    return false;
  }

  function recordSpawnedProcess(holder: string, spawnedProcess: ProcessIdentity | null): void {
    for (const slotPath of slotPaths) {
      if (holderIn(slotPath) === holder) writeFileAtomically(slotPath, slotTextOf({ holder, process: spawnedProcess }));
    }
  }

  function release(holder: string): void {
    for (const slotPath of slotPaths) {
      if (holderIn(slotPath) === holder) removeHeldFile(slotPath);
    }
  }

  async function acquire(holder: string): Promise<() => void> {
    while (!tryAcquire(holder)) await Bun.sleep(options.retryMilliseconds);
    return () => release(holder);
  }

  return {
    tryAcquire, recordSpawnedProcess, release, acquire
  };
}

export const GateRunSlots = Object.freeze({
  createGateRunSlots,
  gateRunHolderIsLive,
  inProcessHolderOf,
});
