/**
 * The process-table boundary played in this process, for a spec of the decisions made over a process's life rather than of the kernel's signals.
 * A process is an entry here, so nothing starts; `stopTree` removes it unless the spec said it outlives the signal.
 */
import type { PlatformPorts }                           from '../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity, ProcessTreeStopOutcome } from '../lib/process-identity/ProcessIdentity.ts';

export interface FakeProcessTable {
  /** The native ports with this table in the place of the process table. */
  readonly ports:            PlatformPorts;
  readonly bornProcess:      () => ProcessIdentity;
  /** It ends by itself, as a process that exits. */
  readonly endProcess:       (identity: ProcessIdentity) => void;
  /** Its `stopTree` is answered and it stays, as a process in the spec's own group does. */
  readonly outlivesStop:     (identity: ProcessIdentity) => void;
  /** Every `stopTree`, in order. */
  readonly stoppedProcesses: () => readonly ProcessIdentity[];
}

const FIRST_FAKE_PROCESS_ID = 5_000_000;
const FAKE_BOOT = 'example-boot';
const FAKE_START_STAMP = '2';

export function createFakeProcessTable(nativePorts: PlatformPorts): FakeProcessTable {
  const liveProcesses = new Map<number, ProcessIdentity>();
  const stopOutlivers = new Set<number>();
  const stopped: ProcessIdentity[] = [];
  let lastProcessId = FIRST_FAKE_PROCESS_ID;

  const stopTree = (identity: ProcessIdentity): ProcessTreeStopOutcome => {
    stopped.push(identity);
    if (!stopOutlivers.has(identity.processId)) liveProcesses.delete(identity.processId);
    return { verdict: 'group-gone' };
  };

  return {
    ports: {
      ...nativePorts,
      processSupervision: {
        ...nativePorts.processSupervision,
        identityOf:    (processId) => liveProcesses.get(processId) ?? null,
        // The spec's own process holds the tracker lock, which now asks this table too.
        processIsGone: (processId) => processId !== process.pid && !liveProcesses.has(processId),
        stopTree,
      },
    },
    bornProcess: () => {
      lastProcessId += 1;
      const identity = { processId: lastProcessId, startStamp: FAKE_START_STAMP, bootIdentity: FAKE_BOOT };
      liveProcesses.set(lastProcessId, identity);
      return identity;
    },
    endProcess:       (identity) => { liveProcesses.delete(identity.processId); },
    outlivesStop:     (identity) => { stopOutlivers.add(identity.processId); },
    stoppedProcesses: () => stopped,
  };
}
