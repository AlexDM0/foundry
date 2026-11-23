/**
 * The platform ports of a default spec: the native ports with the process table and the gate confinement answered from their recordings,
 * so a default spec starts no `ps`, `sysctl` or sandbox. The preload `src/testing/RecordedBoundariesGuard.ts` starts each case with only
 * the spec's own process in the table, and fails the case on a call that no recording answers.
 */
import type { PlatformPorts }                                              from '../lib/platform-ports/PlatformPortsFor.ts';
import { boundaryIsRecordedFor }                                           from './BoundaryRecordings.ts';
import { nativePlatformPorts }                                             from './NativePlatformPorts.ts';
import { recordedGateConfinement }                                         from './RecordedGateConfinement.ts';
import { type ControlledRecordedProcessTable, createRecordedProcessTable } from './RecordedProcessTable.ts';
import { BOUNDARY_OF_RECORDING_REQUIREMENT }                               from './ToolGuard.ts';

interface DefaultSpecPorts {
  readonly ports:                      PlatformPorts;
  readonly processTable:               ControlledRecordedProcessTable;
  readonly unansweredConfinementCalls: string[];
}

let defaultSpecPorts: DefaultSpecPorts | null = null;

function defaultSpecPortsMadeOnce(): DefaultSpecPorts {
  if (defaultSpecPorts !== null) return defaultSpecPorts;
  const processTable = createRecordedProcessTable(nativePlatformPorts());
  const unansweredConfinementCalls: string[] = [];
  const unansweredConfinementError = (call: string, reason: string): Error => {
    const unanswered = `${call} has no recorded answer: ${reason}`;
    unansweredConfinementCalls.push(unanswered);
    return new Error(unanswered);
  };
  const ports = Object.freeze({ ...processTable.table.ports, gateConfinement: recordedGateConfinement(unansweredConfinementError) });
  defaultSpecPorts = { ports, processTable, unansweredConfinementCalls };
  bearTheSpecsOwnProcess(processTable);
  return defaultSpecPorts;
}

/** The spec's own process is always in the table, also for a spec file's setup before its first case. */
function bearTheSpecsOwnProcess(processTable: ControlledRecordedProcessTable): void {
  if (boundaryIsRecordedFor(BOUNDARY_OF_RECORDING_REQUIREMENT['process-table-recording'], process.platform)) processTable.table.callerProcess();
}

/** One frozen record for the whole run, as a process builds its ports once, so what a port keeps per record lasts across commands. */
export function defaultSpecPlatformPorts(): PlatformPorts {
  return defaultSpecPortsMadeOnce().ports;
}

/** Before each case: the table forgets every process but the spec's own; where no process table is recorded, every call fails instead. */
export function startCaseWithOnlyTheSpecsOwnProcess(): void {
  const { processTable } = defaultSpecPortsMadeOnce();
  processTable.forgetProcesses();
  bearTheSpecsOwnProcess(processTable);
}

/** Each call the recordings did not answer since the last take, described; the list is then empty. */
export function takeUnansweredDefaultPortCalls(): string[] {
  const { processTable, unansweredConfinementCalls } = defaultSpecPortsMadeOnce();
  return [...processTable.takeUnansweredCalls(), ...unansweredConfinementCalls.splice(0)];
}
