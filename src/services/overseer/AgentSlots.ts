/**
 * The machine-wide cap on agent jobs, modelled on the gate run slots: one file `slot-<n>` per slot in `<monitor>/agent-slots/`, created
 * exclusively and naming the board, the job and the Overseer process answering for it. A slot whose Overseer is gone is taken over, so a
 * crashed Overseer frees its slots at the next claim of any Overseer, without a release.
 */
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join }                                 from 'node:path';

import { createFileAtomically, removeHeldFile, writeFileAtomically } from '../../lib/atomic-file/AtomicFile.ts';
import type { FileReplace }                                          from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                                  from '../../lib/atomic-file/FileReplaceFor.ts';
import type { PlatformPorts }                                        from '../../lib/platform-ports/PlatformPortsFor.ts';
import { type ProcessIdentity, storedIdentityOf }                    from '../../lib/process-identity/ProcessIdentity.ts';

export const AGENT_SLOTS_FOLDER = 'agent-slots';

const AGENT_SLOT_VERSION = 1;

const SLOT_FILE_PATTERN = /^slot-\d+$/;

/** A reservation is held during one pass for a launch the Playbook may make, and becomes the launched job's slot or is released. */
const RESERVATION_PREFIX = 'reserved-';

export interface AgentSlotHolding {
  trackerId: string;
  /** The job the slot is for, or a reservation's `reserved-<n>`. */
  jobId:     string;
  overseer:  ProcessIdentity | null;
}

export interface AgentSlotsOptions {
  monitorFolder:  string;
  limit:          number;
  /** The Overseer that claims: written on every slot it takes. */
  ownProcess:     ProcessIdentity | null;
  /** Whether a recorded Overseer still runs; `null`, an unreadable record, is never live. */
  overseerIsLive: (overseer: ProcessIdentity | null) => boolean;
  fileReplace?:   FileReplace;
}

export interface AgentSlots {
  /** The holdings whose Overseer still runs, in every slot file, also those above a limit lowered since they were taken. */
  liveHoldings:       () => AgentSlotHolding[];
  /** Whether the job holds a slot after the call: one it held already, or a free one under the limit it took. */
  tryAcquire:         (trackerId: string, jobId: string) => boolean;
  /** Frees every slot of the board whose job is not named, its reservations among them. */
  keepOnly:           (trackerId: string, jobIds: readonly string[]) => void;
  /** Takes up to `count` free slots as reservations, and answers how many it took. */
  reserve:            (trackerId: string, count: number) => number;
  /** Hands each launched job one of the board's reservations; a job with none left holds no slot. */
  assignReservations: (trackerId: string, launchedJobIds: readonly string[]) => void;
}

function slotTextOf(holding: AgentSlotHolding): string {
  return `${JSON.stringify({
    version: AGENT_SLOT_VERSION, trackerId: holding.trackerId, jobId: holding.jobId, overseer: holding.overseer
  })}\n`;
}

/** An unreadable or other-version slot reads as no holding, which no Overseer answers for, so it is taken over. */
function holdingOf(slotText: string): AgentSlotHolding | null {
  let stored: unknown;
  try {
    stored = JSON.parse(slotText);
  } catch {
    return null;
  }
  if (typeof stored !== 'object' || stored === null) return null;
  const {
    version, trackerId, jobId, overseer
  } = stored as Record<string, unknown>;
  if (version !== AGENT_SLOT_VERSION || typeof trackerId !== 'string' || typeof jobId !== 'string') return null;
  return { trackerId, jobId, overseer: storedIdentityOf(overseer) };
}

function slotTextIn(slotPath: string): string | null {
  try {
    return readFileSync(slotPath, 'utf8');
  } catch {
    return null;
  }
}

function reservationIdOf(index: number): string {
  return `${RESERVATION_PREFIX}${index}`;
}

function createAgentSlots(options: AgentSlotsOptions): AgentSlots {
  const folder = join(options.monitorFolder, AGENT_SLOTS_FOLDER);
  const fileReplace = options.fileReplace ?? fileReplaceOfThisProcess();
  const slotPathsUnderTheLimit = Array.from({ length: options.limit }, (_unused, index) => join(folder, `slot-${index + 1}`));

  function existingSlotPaths(): string[] {
    try {
      return readdirSync(folder).filter((name) => SLOT_FILE_PATTERN.test(name)).map((name) => join(folder, name));
    } catch {
      return [];
    }
  }

  function liveHoldingOf(slotPath: string): AgentSlotHolding | null {
    const slotText = slotTextIn(slotPath);
    const holding = slotText === null ? null : holdingOf(slotText);
    return holding !== null && options.overseerIsLive(holding.overseer) ? holding : null;
  }

  function liveHoldings(): AgentSlotHolding[] {
    return existingSlotPaths().flatMap((slotPath) => liveHoldingOf(slotPath) ?? []);
  }

  function slotPathHeldBy(trackerId: string, jobId: string): string | null {
    return existingSlotPaths().find((slotPath) => {
      const slotText = slotTextIn(slotPath);
      const holding = slotText === null ? null : holdingOf(slotText);
      return holding?.trackerId === trackerId && holding.jobId === jobId;
    }) ?? null;
  }

  /** Moved aside before it is removed, so of two Overseers taking over one stale slot only the first removes it. */
  function freedIfStale(slotPath: string, slotText: string): void {
    const holding = holdingOf(slotText);
    if (holding !== null && options.overseerIsLive(holding.overseer)) return;
    const asidePath = `${slotPath}.${process.pid}.stale`;
    try {
      if (fileReplace.replaceFile(slotPath, asidePath).verdict === 'held') return;
    } catch {
      return;
    }
    const movedText = slotTextIn(asidePath);
    if (movedText !== slotText && movedText !== null && createFileAtomically(slotPath, movedText, fileReplace) !== 'created') return;
    removeHeldFile(asidePath, fileReplace);
  }

  function tryAcquire(trackerId: string, jobId: string): boolean {
    mkdirSync(folder, { recursive: true });
    if (slotPathHeldBy(trackerId, jobId) !== null) return true;
    // A limit lowered under the live holdings leaves no slot free until they end, whichever slot files they hold.
    if (liveHoldings().length >= options.limit) return false;
    const ownText = slotTextOf({ trackerId, jobId, overseer: options.ownProcess });
    for (const slotPath of slotPathsUnderTheLimit) {
      if (createFileAtomically(slotPath, ownText, fileReplace) === 'created') return true;
      const current = slotTextIn(slotPath);
      if (current === null) continue;
      freedIfStale(slotPath, current);
      if (createFileAtomically(slotPath, ownText, fileReplace) === 'created') return true;
    }
    return false;
  }

  function keepOnly(trackerId: string, jobIds: readonly string[]): void {
    const kept = new Set(jobIds);
    for (const slotPath of existingSlotPaths()) {
      const slotText = slotTextIn(slotPath);
      const holding = slotText === null ? null : holdingOf(slotText);
      if (holding?.trackerId === trackerId && !kept.has(holding.jobId)) removeHeldFile(slotPath, fileReplace);
    }
  }

  function reserve(trackerId: string, count: number): number {
    let reserved = 0;
    while (reserved < count && tryAcquire(trackerId, reservationIdOf(reserved + 1))) reserved += 1;
    return reserved;
  }

  function assignReservations(trackerId: string, launchedJobIds: readonly string[]): void {
    let reservationIndex = 1;
    for (const jobId of launchedJobIds) {
      const reservedPath = slotPathHeldBy(trackerId, reservationIdOf(reservationIndex));
      if (reservedPath === null) return;
      writeFileAtomically(reservedPath, slotTextOf({ trackerId, jobId, overseer: options.ownProcess }), fileReplace);
      reservationIndex += 1;
    }
  }

  return {
    liveHoldings, tryAcquire, keepOnly, reserve, assignReservations
  };
}

/** A slot's Overseer is live while the process it recorded still runs: the same id and the same start. */
function overseerIsLiveWith({ processSupervision }: PlatformPorts): (overseer: ProcessIdentity | null) => boolean {
  return (overseer) => {
    if (overseer === null) return false;
    const current = processSupervision.identityOf(overseer.processId);
    return current !== null && processSupervision.sameProcess(current, overseer);
  };
}

/** The agent jobs in flight on this machine, every board's: a read alone, which takes over no slot. */
function liveHoldingCountIn(ports: PlatformPorts, monitorFolder: string): number {
  return createAgentSlots({
    monitorFolder, limit: 0, ownProcess: null, overseerIsLive: overseerIsLiveWith(ports)
  }).liveHoldings().length;
}

export const AgentSlots = Object.freeze({ createAgentSlots, overseerIsLiveWith, liveHoldingCountIn });
