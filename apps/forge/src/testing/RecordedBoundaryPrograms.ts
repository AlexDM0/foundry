/**
 * The programs of the recorded boundaries that a default spec reaches only through their recordings: git, and the programs the native
 * process-identity and gate-confinement adapters start. A real-system spec records them, so its file is never judged.
 */
import { basename } from 'node:path';

import { SANDBOX_EXEC_PATH }                        from '../lib/gate-confinement/DarwinSeatbelt.ts';
import { BUBBLEWRAP_EXECUTABLE_NAME }               from '../lib/gate-confinement/LinuxBubblewrap.ts';
import { PROCESS_STATUS_PATH, SYSTEM_CONTROL_PATH } from '../lib/process-identity/DarwinProcessIdentity.ts';
import { INTEGRATION_SPEC_SUFFIX }                  from './BoundarySpecs.ts';

export interface RecordedBoundaryProgram {
  readonly program:         string;
  /** What a default spec reaches the program's answers through instead. */
  readonly recordedThrough: string;
}

const GIT_PROGRAM_NAME = 'git';
const GIT_RECORDING = '`useRecordedGit` of src/testing/RecordedGit.ts';
const NATIVE_PORTS_RECORDING = 'src/testing/DefaultSpecPlatformPorts.ts';

/** A program named by its path is matched by that path; one the adapter looks up by name, by the name of whatever path it resolved to. */
const NATIVE_PORT_PROGRAMS_OF_PLATFORM: Readonly<Record<string, readonly string[]>> = {
  darwin: [PROCESS_STATUS_PATH, SYSTEM_CONTROL_PATH, SANDBOX_EXEC_PATH],
  linux:  [BUBBLEWRAP_EXECUTABLE_NAME],
};

function commandOf(spawnArguments: readonly unknown[]): readonly unknown[] {
  const [commandOrOptions] = spawnArguments;
  if (Array.isArray(commandOrOptions)) return commandOrOptions;
  if (typeof commandOrOptions !== 'object' || commandOrOptions === null) return [];
  const { cmd: command } = commandOrOptions as { cmd?: unknown };
  return Array.isArray(command) ? command : [];
}

/** The recorded boundary program a `Bun.spawn` or `Bun.spawnSync` call starts on `platform`, or `null`; both call forms are read. */
export function recordedBoundaryProgramOf(spawnArguments: readonly unknown[], platform: string): RecordedBoundaryProgram | null {
  const [program] = commandOf(spawnArguments);
  if (typeof program !== 'string') return null;
  if (basename(program) === GIT_PROGRAM_NAME) return { program: GIT_PROGRAM_NAME, recordedThrough: GIT_RECORDING };
  const nativePortPrograms = Object.hasOwn(NATIVE_PORT_PROGRAMS_OF_PLATFORM, platform) ? NATIVE_PORT_PROGRAMS_OF_PLATFORM[platform] ?? [] : [];
  const nativePortProgram = nativePortPrograms.find((candidate) => program === candidate || basename(program) === candidate);
  return nativePortProgram === undefined ? null : { program: nativePortProgram, recordedThrough: NATIVE_PORTS_RECORDING };
}

/** `specPath` is the spec file the run is in; only a default spec is judged. */
export function specIsJudgedForRecordedBoundaryPrograms(specPath: string): boolean {
  return !specPath.endsWith(INTEGRATION_SPEC_SUFFIX);
}
