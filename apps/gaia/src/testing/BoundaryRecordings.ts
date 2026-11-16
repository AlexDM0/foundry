/**
 * The recorded answers of each boundary: which boundaries are recorded, where each recording lives for an OS, what stamps it, and how a
 * recording is read. `bun run record <name>` runs the boundary's real-system spec and writes the recording; `bun run verify` compares the
 * stamps with the installed versions and makes no real call. Test-only.
 */
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { release } from 'node:os';
import { join }    from 'node:path';

import { CONTRACT_VERSIONS }   from '../shared/constants/ContractVersions.ts';
import { ContractVersionUtil } from '../shared/utils/ContractVersionUtil.ts';

import { scratchRoot } from './ScratchRoot.ts';

/**
 * The outside system whose version stamps a recording; `macos` stands for the programs the system ships, such as `osascript`, and `browser`
 * for the Chrome or Edge that Gaia's window opens in.
 */
export type RecordedSystem = 'bun' | 'forge' | 'macos' | 'browser';

export interface RecordedBoundary {
  readonly recordingName:  string;
  readonly boundaryModule: string;
  /** Run only by `bun run record`: `bunfig.toml` keeps every `*.recording.spec.ts` out of a plain `bun test`. */
  readonly recordingSpec:  string;
  readonly system:         RecordedSystem;
}

export const RECORDED_BOUNDARIES: readonly RecordedBoundary[] = [
  {
    recordingName:  'process-run',
    boundaryModule: 'src/lib/process-run/ProcessRun.ts',
    recordingSpec:  'src/lib/process-run/ProcessRun.recording.spec.ts',
    system:         'bun',
  },
  {
    recordingName:  'forge-program',
    boundaryModule: 'src/adapters/forge-program/ForgeProgram.ts',
    recordingSpec:  'src/adapters/forge-program/ForgeProgram.recording.spec.ts',
    system:         'forge',
  },
  {
    recordingName:  'forge-program-done',
    boundaryModule: 'src/adapters/forge-program/ForgeProgram.ts',
    recordingSpec:  'src/adapters/forge-program/ForgeProgram.done.recording.spec.ts',
    system:         'forge',
  },
  {
    recordingName:  'forge-program-refused',
    boundaryModule: 'src/adapters/forge-program/ForgeProgram.ts',
    recordingSpec:  'src/adapters/forge-program/ForgeProgram.refused.recording.spec.ts',
    system:         'forge',
  },
  {
    recordingName:  'path-chooser',
    boundaryModule: 'src/adapters/path-chooser/PathChooser.ts',
    recordingSpec:  'src/adapters/path-chooser/PathChooser.recording.spec.ts',
    system:         'macos',
  },
  {
    recordingName:  'browser-window-watch',
    boundaryModule: 'src/features/launcher/BrowserWindowWatch.ts',
    recordingSpec:  'src/features/launcher/BrowserWindowWatch.recording.spec.ts',
    system:         'browser',
  },
  {
    recordingName:  'launcher-programs',
    boundaryModule: 'src/features/launcher/Launcher.ts',
    recordingSpec:  'src/features/launcher/Launcher.recording.spec.ts',
    system:         'browser',
  },
  {
    recordingName:  'app-install-programs',
    boundaryModule: 'src/features/app-install/AppInstall.ts',
    recordingSpec:  'src/features/app-install/AppInstall.recording.spec.ts',
    system:         'macos',
  },
  {
    recordingName:  'forge-registry',
    boundaryModule: 'src/adapters/forge-registry/RegistryFile.ts',
    recordingSpec:  'src/adapters/forge-registry/RegistryFile.recording.spec.ts',
    system:         'forge',
  },
  {
    recordingName:  'overseer-fetch-other-programs',
    boundaryModule: 'src/lib/forge-client/OverseerFetch.ts',
    recordingSpec:  'src/lib/forge-client/OverseerFetch.otherPrograms.recording.spec.ts',
    system:         'bun',
  },
  {
    recordingName:  'overseer-fetch-supported-forge',
    boundaryModule: 'src/lib/forge-client/OverseerFetch.ts',
    recordingSpec:  'src/lib/forge-client/OverseerFetch.supportedForge.recording.spec.ts',
    system:         'forge',
  },
  {
    recordingName:  'overseer-fetch-flint-brain',
    boundaryModule: 'src/lib/forge-client/OverseerFetch.ts',
    recordingSpec:  'src/lib/forge-client/OverseerFetch.flintBrain.recording.spec.ts',
    system:         'forge',
  },
  {
    recordingName:  'overseer-fetch-versions',
    boundaryModule: 'src/lib/forge-client/OverseerFetch.ts',
    recordingSpec:  'src/lib/forge-client/OverseerFetch.versions.recording.spec.ts',
    system:         'forge',
  },
];

export const RECORDING_SPEC_SUFFIX = '.recording.spec.ts';

/**
 * `recorded`: taken from the real system at `systemVersion`. `authored`: written by hand until a person answers its recording spec, as
 * `path-chooser` waits for one at a Mac's screen.
 */
export type RecordingStamp =
  | {
    readonly recordingName:   string;
    readonly operatingSystem: string;
    readonly system:          RecordedSystem;
    readonly source:          'recorded';
    readonly systemVersion:   string;
  }
  | {
    readonly recordingName:   string;
    readonly operatingSystem: string;
    readonly system:          RecordedSystem;
    readonly source:          'authored';
  };

export interface RecordedAnswer {
  readonly callShape: string;
  readonly answer:    unknown;
}

export interface BoundaryRecording {
  readonly recordingVersion: number;
  /** Absent in a recording taken before minors, which reads as 0. */
  readonly recordingMinor:   number;
  readonly stamp:            RecordingStamp;
  readonly answers:          readonly RecordedAnswer[];
}

export type BoundaryRecordingReading =
  | { readonly verdict: 'readable'; readonly recording: BoundaryRecording }
  | { readonly verdict: 'unreadable'; readonly reason: string };

const RECORDINGS_FOLDER = join('src', 'testing', 'recordings');
export const RECORDING_FILE_SUFFIX = '.json';
const RECORDED_SYSTEMS: ReadonlySet<string> = new Set<RecordedSystem>(['bun', 'forge', 'macos', 'browser']);

export function repositoryRoot(): string {
  return join(import.meta.dir, '..', '..');
}

export function recordedBoundaryNamed(recordingName: string): RecordedBoundary | null {
  return RECORDED_BOUNDARIES.find((boundary) => boundary.recordingName === recordingName) ?? null;
}

export function recordCommandOf(recordingName: string): string {
  return `bun run record ${recordingName}`;
}

export function recordingFileNameOf(recordingName: string): string {
  return `${recordingName}${RECORDING_FILE_SUFFIX}`;
}

/** The recordings of one OS, relative to the repository root. */
export function recordingsFolderOf(operatingSystem: string): string {
  return join(RECORDINGS_FOLDER, operatingSystem);
}

export function recordingPathOf(recordingName: string, operatingSystem: string): string {
  return join(recordingsFolderOf(operatingSystem), recordingFileNameOf(recordingName));
}

/**
 * The installed version of a system, read without starting a process: the running program is the installed Bun, and macOS is the Darwin
 * release the kernel reports. `null` for the forge, whose version only a run of the forge program answers, and for the browser, which
 * updates itself and only a run of it names; their recording specs report the version they recorded from.
 */
export function installedVersionOf(system: RecordedSystem): string | null {
  switch (system) {
    case 'bun': return Bun.version;
    case 'forge': return null;
    case 'macos': return process.platform === 'darwin' ? release() : null;
    case 'browser': return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stampOrNull(value: unknown): RecordingStamp | null {
  if (!isRecord(value)) return null;
  const {
    recordingName,
    operatingSystem,
    system,
    source,
    systemVersion,
  } = value;
  if (typeof recordingName !== 'string' || typeof operatingSystem !== 'string') return null;
  if (typeof system !== 'string' || !RECORDED_SYSTEMS.has(system)) return null;
  const sharedFields = { recordingName, operatingSystem, system: system as RecordedSystem };
  if (source === 'authored') return { ...sharedFields, source };
  if (source === 'recorded' && typeof systemVersion === 'string') return { ...sharedFields, source, systemVersion };
  return null;
}

function answerOrNull(value: unknown): RecordedAnswer | null {
  if (!isRecord(value) || typeof value['callShape'] !== 'string' || !Object.hasOwn(value, 'answer')) return null;
  return { callShape: value['callShape'], answer: value['answer'] };
}

const RECORDING_VERSION_KEYS = { majorKey: 'recordingVersion', minorKey: 'recordingMinor' } as const;

export function boundaryRecordingReadingOf(recordingText: string): BoundaryRecordingReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(recordingText);
  } catch {
    return { verdict: 'unreadable', reason: 'it is no JSON' };
  }
  if (!isRecord(parsed)) return { verdict: 'unreadable', reason: 'it is no JSON object' };
  const versionReading = ContractVersionUtil.versionOf(parsed, RECORDING_VERSION_KEYS);
  if (versionReading.verdict !== 'versioned' || ContractVersionUtil.majorVerdictOf(versionReading.version.major, CONTRACT_VERSIONS.boundaryRecording.major) !== 'known') {
    const { recordingVersion } = parsed;
    return { verdict: 'unreadable', reason: `its recordingVersion is ${String(recordingVersion)}, and Gaia reads ${CONTRACT_VERSIONS.boundaryRecording.major}` };
  }
  const { major: recordingVersion, minor: recordingMinor } = versionReading.version;
  const stamp = stampOrNull(parsed['stamp']);
  if (stamp === null) return { verdict: 'unreadable', reason: 'it has no readable stamp' };
  const listedAnswers = parsed['answers'];
  if (!Array.isArray(listedAnswers)) return { verdict: 'unreadable', reason: 'it has no list of answers' };
  const answers = listedAnswers.map(answerOrNull);
  if (answers.some((answer) => answer === null)) return { verdict: 'unreadable', reason: 'an answer has no call shape or no answer' };
  return {
    verdict:   'readable',
    recording: {
      recordingVersion, recordingMinor, stamp, answers: answers.filter((answer) => answer !== null)
    }
  };
}

/** Where a recording spec collects its answers while `bun run record` runs it: in the scratch root, outside the run's own folder. */
export function answersInProgressPathOf(recordingName: string): string {
  return join(scratchRoot(), `recording-${recordingName}.jsonl`);
}

/** Where a recording spec reports the version of the system it recorded from, for a system whose installed version reads `null`. */
export function systemVersionInProgressPathOf(recordingName: string): string {
  return join(scratchRoot(), `recording-${recordingName}.system-version`);
}

function refuseOutsideTheRecordCommand(recordingName: string): void {
  if (!existsSync(answersInProgressPathOf(recordingName))) {
    throw new Error(`Nothing collects the answers of ${recordingName}: run it with \`${recordCommandOf(recordingName)}\`.`);
  }
}

/** Called by a recording spec for each call shape it records; refuses when the spec runs outside `bun run record`. */
export function recordAnswer(recordingName: string, callShape: string, answer: unknown): void {
  refuseOutsideTheRecordCommand(recordingName);
  appendFileSync(answersInProgressPathOf(recordingName), `${JSON.stringify({ callShape, answer })}\n`);
}

/** Called by a recording spec with the version of the system it recorded from; refuses when the spec runs outside `bun run record`. */
export function recordSystemVersion(recordingName: string, systemVersion: string): void {
  refuseOutsideTheRecordCommand(recordingName);
  writeFileSync(systemVersionInProgressPathOf(recordingName), systemVersion);
}

/** The version a recording spec reported, or `null` when it reported none. */
export function reportedSystemVersionOf(recordingName: string): string | null {
  const versionPath = systemVersionInProgressPathOf(recordingName);
  if (!existsSync(versionPath)) return null;
  const systemVersion = readFileSync(versionPath, 'utf8');
  return systemVersion === '' ? null : systemVersion;
}
