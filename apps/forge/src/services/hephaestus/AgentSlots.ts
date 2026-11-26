/**
 * The machine-wide cap on agent jobs, modelled on the gate run slots: one file `slot-<n>` per slot in `<monitor>/agent-slots/`, created
 * exclusively and naming the board, the job and the Hephaestus process answering for it. A slot whose Hephaestus is gone is taken over, so a
 * crashed Hephaestus frees its slots at the next claim of any Hephaestus, without a release.
 */
import { mkdirSync, readdirSync } from 'node:fs';
import { join }                   from 'node:path';

import { AgentSlotIngestion, type AgentSlotHolding, type AgentSlotReading } from '../../adapters/agent-slot/AgentSlotIngestion.ts';
import { createAgentSlotWriter }                                            from '../../adapters/agent-slot/AgentSlotWriter.ts';
import { createFileAtomically, removeHeldFile }                             from '../../lib/atomic-file/AtomicFile.ts';
import type { FileReplace }                                                 from '../../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                                         from '../../lib/atomic-file/FileReplaceFor.ts';
import type { PlatformPorts }                                               from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                                             from '../../lib/process-identity/ProcessIdentity.ts';

export const AGENT_SLOTS_FOLDER = 'agent-slots';

const SLOT_FILE_PATTERN = /^slot-\d+$/;

/** A reservation is held during one pass for a launch the Playbook may make, and becomes the launched job's slot or is released. */
const RESERVATION_PREFIX = 'reserved-';

export interface AgentSlotsOptions {
  monitorFolder:    string;
  limit:            number;
  /** The Hephaestus that claims: written on every slot it takes. */
  ownProcess:       ProcessIdentity | null;
  /** Whether a recorded Hephaestus still runs; `null`, an unreadable record, is never live. */
  hephaestusIsLive: (hephaestus: ProcessIdentity | null) => boolean;
  fileReplace?:     FileReplace;
  /** Where a slot that could not be read and is taken over is logged. */
  log:              (line: string) => void;
}

export interface AgentSlots {
  /** The holdings whose Hephaestus still runs, in every slot file, also those above a limit lowered since they were taken. */
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

/** A slot as it was judged, with the text it was judged by. */
type JudgedSlot = Exclude<AgentSlotReading, { verdict: 'absent' }> & { storedText: string };

function holdingOf(reading: AgentSlotReading): AgentSlotHolding | null {
  return reading.verdict === 'readable' ? reading.holding : null;
}

function storedTextOf(reading: AgentSlotReading): string | null {
  return reading.verdict === 'absent' ? null : reading.storedText;
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

  function readingOf(slotPath: string): AgentSlotReading {
    return new AgentSlotIngestion(slotPath).read();
  }

  function liveHoldingOf(slotPath: string): AgentSlotHolding | null {
    const holding = holdingOf(readingOf(slotPath));
    return holding !== null && options.hephaestusIsLive(holding.hephaestus) ? holding : null;
  }

  function liveHoldings(): AgentSlotHolding[] {
    return existingSlotPaths().flatMap((slotPath) => liveHoldingOf(slotPath) ?? []);
  }

  function slotPathHeldBy(trackerId: string, jobId: string): string | null {
    return existingSlotPaths().find((slotPath) => {
      const holding = holdingOf(readingOf(slotPath));
      return holding?.trackerId === trackerId && holding.jobId === jobId;
    }) ?? null;
  }

  /**
   * Moved aside before it is removed, so of two Hephaestus processes taking over one stale slot only the first removes it; a slot changed
   * since it was judged goes back as it was.
   */
  function freedIfStale(slotPath: string, judged: JudgedSlot): void {
    const holding = holdingOf(judged);
    if (holding !== null && options.hephaestusIsLive(holding.hephaestus)) return;
    const asidePath = `${slotPath}.${process.pid}.stale`;
    try {
      if (fileReplace.replaceFile(slotPath, asidePath).verdict === 'held') return;
    } catch {
      return;
    }
    const movedText = storedTextOf(readingOf(asidePath));
    if (movedText !== judged.storedText && movedText !== null && createFileAtomically(slotPath, movedText, fileReplace) !== 'created') return;
    removeHeldFile(asidePath, fileReplace);
    if (judged.verdict === 'unreadable') options.log(`The agent slot ${slotPath} could not be read (${judged.reason}); it was taken over.`);
  }

  /** A slot whose bytes could not be read at all is left for a later claim. */
  function judgedSlotOf(slotPath: string): JudgedSlot | null {
    const reading = readingOf(slotPath);
    if (reading.verdict === 'absent') return null;
    const { storedText } = reading;
    return storedText === null ? null : { ...reading, storedText };
  }

  /**
   * A job's own slot stays its slot while the Hephaestus it names runs. One that names a gone Hephaestus, as after a restart or a restart
   * while the job ran on, is taken over for this Hephaestus, so other Hephaestus processes count it again.
   */
  function jobKeepsItsSlot(slotPath: string, trackerId: string, jobId: string): boolean {
    const judged = judgedSlotOf(slotPath);
    if (judged === null) return false;
    const holding = holdingOf(judged);
    if (holding !== null && options.hephaestusIsLive(holding.hephaestus)) return true;
    freedIfStale(slotPath, judged);
    return createAgentSlotWriter(slotPath, fileReplace).create({ trackerId, jobId, hephaestus: options.ownProcess }) === 'created';
  }

  function tryAcquire(trackerId: string, jobId: string): boolean {
    mkdirSync(folder, { recursive: true });
    const heldSlotPath = slotPathHeldBy(trackerId, jobId);
    if (heldSlotPath !== null && jobKeepsItsSlot(heldSlotPath, trackerId, jobId)) return true;
    // A limit lowered under the live holdings leaves no slot free until they end, whichever slot files they hold.
    if (liveHoldings().length >= options.limit) return false;
    const ownHolding = { trackerId, jobId, hephaestus: options.ownProcess };
    for (const slotPath of slotPathsUnderTheLimit) {
      const writer = createAgentSlotWriter(slotPath, fileReplace);
      if (writer.create(ownHolding) === 'created') return true;
      const judged = judgedSlotOf(slotPath);
      if (judged === null) continue;
      freedIfStale(slotPath, judged);
      if (writer.create(ownHolding) === 'created') return true;
    }
    return false;
  }

  function keepOnly(trackerId: string, jobIds: readonly string[]): void {
    const kept = new Set(jobIds);
    for (const slotPath of existingSlotPaths()) {
      const holding = holdingOf(readingOf(slotPath));
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
      createAgentSlotWriter(reservedPath, fileReplace).write({ trackerId, jobId, hephaestus: options.ownProcess });
      reservationIndex += 1;
    }
  }

  return {
    liveHoldings, tryAcquire, keepOnly, reserve, assignReservations
  };
}

/** A slot's Hephaestus is live while the process it recorded still runs: the same id and the same start. */
function hephaestusIsLiveWith({ processSupervision }: PlatformPorts): (hephaestus: ProcessIdentity | null) => boolean {
  return (hephaestus) => {
    if (hephaestus === null) return false;
    const current = processSupervision.identityOf(hephaestus.processId);
    return current !== null && processSupervision.sameProcess(current, hephaestus);
  };
}

/** The agent jobs in flight on this machine, every board's: a read alone, which takes over no slot. */
function liveHoldingCountIn(ports: PlatformPorts, monitorFolder: string): number {
  return createAgentSlots({
    // A read alone takes no slot over, so it has nothing to log.
    monitorFolder, limit: 0, ownProcess: null, hephaestusIsLive: hephaestusIsLiveWith(ports), log: () => {}
  }).liveHoldings().length;
}

export const AgentSlots = Object.freeze({ createAgentSlots, hephaestusIsLiveWith, liveHoldingCountIn });
