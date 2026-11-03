/**
 * Where the recording of a boundary lives and what stamps it. `bun run record <boundary>` runs the boundary's real-system specs and
 * writes their recorded answers to one frozen table for each OS, stamped with the version of the outside system the boundary talks to.
 * `bun run verify` makes no real call: it compares the stamps with the installed versions only.
 */
import { createHash } from 'node:crypto';
import { tmpdir }     from 'node:os';
import { join }       from 'node:path';

export type RecordedSystem = 'bun' | 'git' | 'operating system';

export interface RecordingStamp {
  readonly boundary: string;
  readonly system:   RecordedSystem;
  readonly version:  string;
  readonly os:       string;
}

export interface RecordedAnswer {
  readonly callShape: string;
  readonly answer:    unknown;
}

export interface BoundaryRecording {
  readonly stamp:   RecordingStamp;
  readonly answers: readonly RecordedAnswer[];
}

export const RECORDINGS_FOLDER = 'src/testing/recordings';
export const RECORDING_SUFFIX = '.json';

const GIT: RecordedSystem = 'git';
const BUN: RecordedSystem = 'bun';
const OPERATING_SYSTEM: RecordedSystem = 'operating system';
const HASH_CHARACTERS = 16;

/** The outside system whose version stamps the recording of each boundary in `BOUNDARY_SPECS`, both lists exact. */
export const SYSTEM_OF_BOUNDARY: Readonly<Record<string, RecordedSystem>> = {
  '.platform-probes/':                           OPERATING_SYSTEM,
  'agent-progress.ts':                           BUN,
  'bridge/api/CommandClient.ts':                 BUN,
  'bridge/api/IdentityClient.ts':                BUN,
  'bridge/api/SessionCodeExchange.ts':           BUN,
  'bridge/testing/HeadlessBridgeCheck.ts':       BUN,
  'bunfig.toml':                                 BUN,
  'cli/CommandTable.ts':                         BUN,
  'cli/FrozenInstalledSurface.json':             BUN,
  'cli/OpenInTheDefaultBrowser.ts':              OPERATING_SYSTEM,
  'cli/OpenTrackerForWriting.ts':                BUN,
  'cli/constants/InstallVersion.ts':             BUN,
  'cli/overseer/OverseerForeground.ts':          OPERATING_SYSTEM,
  'cli/overseer/OverseerRemote.ts':              OPERATING_SYSTEM,
  'cli/overseer/routes/':                        BUN,
  'cli/setup/':                                  BUN,
  'cli/testing/CliProcess.ts':                   BUN,
  'eslint.config.js':                            BUN,
  'launcher.ts':                                 BUN,
  'package.json':                                BUN,
  'resources/':                                  BUN,
  'setup.sh':                                    OPERATING_SYSTEM,
  'setup.ts':                                    BUN,
  'skills/':                                     BUN,
  'src/lib/executable-resolver/':                OPERATING_SYSTEM,
  'src/lib/gate-confinement/':                   OPERATING_SYSTEM,
  'src/lib/git/GitProcess.ts':                   GIT,
  'src/lib/owner-only-files/':                   OPERATING_SYSTEM,
  'src/lib/process-identity/':                   OPERATING_SYSTEM,
  'src/lib/shell-line/':                         OPERATING_SYSTEM,
  'src/lib/watcher/LocalEndpointFor.ts':         OPERATING_SYSTEM,
  'src/lib/watcher/PosixSocketEndpoint.ts':      OPERATING_SYSTEM,
  'src/lib/watcher/UnsupportedLocalEndpoint.ts': OPERATING_SYSTEM,
  'src/lib/watcher/Watcher.ts':                  OPERATING_SYSTEM,
  'src/lib/watcher/WatcherSocketServer.ts':      OPERATING_SYSTEM,
  'src/lib/watcher/WindowsPipeEndpoint.ts':      OPERATING_SYSTEM,
  'src/services/lifecycle/GateRun.ts':           OPERATING_SYSTEM,
  'src/services/lifecycle/MergeRun.ts':          GIT,
  'src/services/overseer/GpgDirectories.ts':     OPERATING_SYSTEM,
  'src/services/overseer/InstallChangeWatch.ts': OPERATING_SYSTEM,
  'src/services/overseer/OverseerServer.ts':     BUN,
  'src/services/overseer/WatcherBundle.ts':      BUN,
  'src/services/overseer/WatcherFleet.ts':       OPERATING_SYSTEM,
  'src/shared/Environment.ts':                   BUN,
  'src/shared/ToolRuntimeUtil.ts':               BUN,
  'src/testing/BoundaryRecordings.ts':           BUN,
  'src/testing/BoundarySpecs.ts':                BUN,
  'src/testing/CheckRecordingStamps.ts':         BUN,
  'src/testing/FakeAgentAdapter.ts':             BUN,
  'src/testing/FakeGit.ts':                      GIT,
  'src/testing/FakeProcessTable.ts':             OPERATING_SYSTEM,
  'src/testing/FakeWatcherWorld.ts':             OPERATING_SYSTEM,
  'src/testing/InstalledSystemVersion.ts':       BUN,
  'src/testing/RecordBoundary.ts':               BUN,
  'src/testing/RecordedAnswers.ts':              BUN,
  'src/testing/RecordingStamps.ts':              BUN,
  'src/testing/SharedCaseDeadlinePreload.ts':    BUN,
  'src/testing/ToolGuard.ts':                    BUN,
  'src/testing/TrackerIsolation.ts':             BUN,
};

export function recordCommandOf(boundary: string): string {
  return `bun run record ${boundary}`;
}

/** One file for each boundary and OS: a folder boundary drops its last `/`, and each `/` becomes `__`. */
export function recordingFileNameOf(boundary: string): string {
  return `${boundary.replace(/\/$/, '').replaceAll('/', '__')}${RECORDING_SUFFIX}`;
}

export function recordingPathOf(boundary: string, os: string): string {
  return `${RECORDINGS_FOLDER}/${os}/${recordingFileNameOf(boundary)}`;
}

/** The file the record command collects answers in while the specs run, one for each checkout, outside it. */
export function answersInProgressPathOf(repositoryRoot: string): string {
  const checkoutHash = createHash('sha256').update(repositoryRoot).digest('hex').slice(0, HASH_CHARACTERS);
  return join(tmpdir(), `agent-progress-recording-${checkoutHash}.jsonl`);
}
