/**
 * Where the recording of a boundary lives and what stamps it. `bun run record <boundary>` runs the boundary's real-system specs and
 * writes their recorded answers to one frozen table for each OS, stamped with the version of the outside system the boundary talks to.
 * `bun run verify` makes no real call: it compares the stamps with the installed versions only.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { tmpdir }     from 'node:os';
import { join }       from 'node:path';

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');

/**
 * `sandbox`: the gate sandbox of the OS, stamped with the `bwrap` version on Linux and with the OS version elsewhere. `claude`: the Claude
 * Code program, whose stream-json lines the fake agent plays. `agent-progress`: the on-disk program that answers `version --json`, stamped
 * with its install and answer versions. `opener`: the program that opens a URL in the default browser. `setup tools`: the programs that
 * setup runs, Bun, git and the autostart tool of the OS, each named with its version.
 */
export type RecordedSystem = 'agent-progress' | 'bun' | 'claude' | 'eslint' | 'git' | 'gpg' | 'opener' | 'operating system' | 'sandbox' | 'setup tools';

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
const SANDBOX: RecordedSystem = 'sandbox';
const CLAUDE: RecordedSystem = 'claude';
const AGENT_PROGRESS: RecordedSystem = 'agent-progress';
const ESLINT: RecordedSystem = 'eslint';
const GPG: RecordedSystem = 'gpg';
const OPENER: RecordedSystem = 'opener';
const SETUP_TOOLS: RecordedSystem = 'setup tools';
const HASH_CHARACTERS = 16;

/** The outside system whose version stamps the recording of each boundary in `BOUNDARY_SPECS`, both lists exact. */
export const SYSTEM_OF_BOUNDARY: Readonly<Record<string, RecordedSystem>> = {
  '.platform-probes/':                           OPERATING_SYSTEM,
  'agent-progress.ts':                           BUN,
  'bridge/api/CommandClient.ts':                 BUN,
  'bridge/api/IdentityClient.ts':                BUN,
  'bridge/api/PictureUploadClient.ts':           BUN,
  'bridge/api/SessionCodeExchange.ts':           BUN,
  'bridge/api/SessionTokenSource.ts':            BUN,
  'bridge/testing/HeadlessBridgeCheck.ts':       BUN,
  'bunfig.toml':                                 BUN,
  'cli/ApplyCommandOfVerb.ts':                   BUN,
  'cli/CommandTable.ts':                         BUN,
  'cli/OpenInTheDefaultBrowser.ts':              OPENER,
  'cli/overseer/OverseerForeground.ts':          OPERATING_SYSTEM,
  'cli/overseer/OverseerRemote.ts':              OPERATING_SYSTEM,
  'cli/overseer/routes/':                        BUN,
  'cli/setup/':                                  SETUP_TOOLS,
  'cli/testing/CliProcess.ts':                   BUN,
  'eslint.config.js':                            ESLINT,
  'launcher.ts':                                 BUN,
  'package.json':                                BUN,
  'setup.sh':                                    SETUP_TOOLS,
  'setup.ts':                                    SETUP_TOOLS,
  'src/lib/claude-code/ClaudeCodeAdapter.ts':    BUN,
  'src/lib/executable-resolver/':                OPERATING_SYSTEM,
  'src/lib/gate-confinement/':                   SANDBOX,
  'src/lib/git/GitProcess.ts':                   GIT,
  'src/lib/owner-only-files/':                   OPERATING_SYSTEM,
  'src/lib/process-identity/':                   OPERATING_SYSTEM,
  'src/lib/quiet-watch/QuietWatch.ts':           BUN,
  'src/lib/shell-line/':                         OPERATING_SYSTEM,
  'src/lib/talos/LocalEndpointFor.ts':           OPERATING_SYSTEM,
  'src/lib/talos/PosixSocketEndpoint.ts':        OPERATING_SYSTEM,
  'src/lib/talos/SynchronousCallsThread.ts':     OPERATING_SYSTEM,
  'src/lib/talos/Talos.ts':                      OPERATING_SYSTEM,
  'src/lib/talos/UnsupportedLocalEndpoint.ts':   OPERATING_SYSTEM,
  'src/lib/talos/WindowsPipeEndpoint.ts':        OPERATING_SYSTEM,
  'src/services/lifecycle/GateRun.ts':           OPERATING_SYSTEM,
  'src/services/overseer/GpgDirectories.ts':     GPG,
  'src/services/overseer/GuardCommand.ts':       BUN,
  'src/services/overseer/InstallChangeWatch.ts': AGENT_PROGRESS,
  'src/services/overseer/LeaseRenewal.ts':       OPERATING_SYSTEM,
  'src/services/overseer/OverseerServer.ts':     BUN,
  'src/services/overseer/TalosStart.ts':         OPERATING_SYSTEM,
  'src/shared/Environment.ts':                   BUN,
  'src/shared/ToolRuntimeUtil.ts':               BUN,
  'src/testing/BoundaryRecordings.ts':           BUN,
  'src/testing/BoundarySpecs.ts':                BUN,
  'src/testing/CheckRecordingStamps.ts':         BUN,
  'src/testing/fake-agent/':                     CLAUDE,
  'src/testing/FakeAgentAdapter.ts':             BUN,
  'src/testing/InstalledSystemVersion.ts':       BUN,
  'src/testing/ProcessesInFolder.ts':            OPERATING_SYSTEM,
  'src/testing/RecordBoundary.ts':               BUN,
  'src/testing/RecordedAnswers.ts':              BUN,
  'src/testing/RecordingStamps.ts':              BUN,
  'src/testing/SharedCaseDeadlinePreload.ts':    BUN,
  'src/testing/TestRunLeakCheck.ts':             GIT,
  'src/testing/TestRunReport.ts':                BUN,
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

/** What the stamp check lists and the tool guard skips with, for a boundary with no recording for `os`. */
export function unfinishedBoundaryWordingOf(boundary: string, os: string): string {
  return `${boundary} is not finished for ${os}`;
}

export function boundaryIsRecordedFor(boundary: string, os: string): boolean {
  return existsSync(join(REPOSITORY_ROOT, recordingPathOf(boundary, os)));
}

/** The file the record command collects answers in while the specs run, one for each checkout, outside it. */
export function answersInProgressPathOf(repositoryRoot: string, temporaryFolder: string = tmpdir()): string {
  const checkoutHash = createHash('sha256').update(repositoryRoot).digest('hex').slice(0, HASH_CHARACTERS);
  return join(temporaryFolder, `agent-progress-recording-${checkoutHash}.jsonl`);
}
