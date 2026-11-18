/**
 * The one module that reads `process.env`; nothing else may.
 * Every read is a getter rather than a value captured at import, and nothing is memoised, so a spec
 * can redirect a variable in-process. The product's own variables are named from its environment prefix, so a build linked beside the
 * released program never reads the released program's root.
 */
import { delimiter } from 'node:path';

import { SystemVersionUtil }     from 'system-versions/SystemVersionUtil';
import type { VersionsDocument } from 'system-versions/VersionsDocument';

import { CLAUDE_API_KEY_VARIABLE }                             from '../lib/claude-code/ClaudeApiKeyVariable.ts';
import { CLAUDE_CONFIG_FOLDER_VARIABLE, claudeConfigFolderOf } from '../lib/claude-code/ClaudeConfigFolder.ts';
import { OperationRefusal }                                    from './OperationRefusal.ts';
import { PRODUCT_NAMES, type ProductNames }                    from './constants/ProductNames.ts';
import { ROOT_OVERRIDE_VARIABLE }                              from './constants/RootOverrideVariable.ts';

export function everyToolRequiredVariableOf({ ENVIRONMENT_PREFIX }: Pick<ProductNames, 'ENVIRONMENT_PREFIX'>): string {
  return `${ENVIRONMENT_PREFIX}REQUIRE_EVERY_TOOL`;
}

export function fakeAgentVariableOf({ ENVIRONMENT_PREFIX }: Pick<ProductNames, 'ENVIRONMENT_PREFIX'>): string {
  return `${ENVIRONMENT_PREFIX}FAKE_AGENT`;
}

export const FAKE_AGENT_VARIABLE = fakeAgentVariableOf(PRODUCT_NAMES);

/**
 * Launches every session the Overseer starts as the scripted fake agent rather than a vendor's CLI, so a spec-spawned binary spends no
 * subscription; `cli/testing/CliProcess.ts` sets it on every child. Read like the every-tool switch.
 */
export function fakeAgentIsOn(): boolean {
  return switchIsOn(FAKE_AGENT_VARIABLE);
}

export const FAKE_AGENT_KEEPS_WORKING_VARIABLE = `${PRODUCT_NAMES.ENVIRONMENT_PREFIX}FAKE_AGENT_KEEPS_WORKING`;

/** Under the fake-agent switch, keeps every fake session working until its stdin closes, as `.readme-graphics/bridge-demo.sh` shows a running board. */
export function fakeAgentKeepsWorking(): boolean {
  return switchIsOn(FAKE_AGENT_KEEPS_WORKING_VARIABLE);
}

export const FAKE_AGENT_REPORTS_VARIABLE = `${PRODUCT_NAMES.ENVIRONMENT_PREFIX}FAKE_AGENT_REPORTS`;

/** Under the fake-agent switch, each fake builder and reviewer commits and reports as its role asks, so a scratch ticket runs to its landing. */
export function fakeAgentReports(): boolean {
  return switchIsOn(FAKE_AGENT_REPORTS_VARIABLE);
}

export const FAKE_AGENT_NETWORK_OUTAGE_VARIABLE = `${PRODUCT_NAMES.ENVIRONMENT_PREFIX}FAKE_AGENT_NETWORK_OUTAGE`;

/** Under the fake-agent switch, each fake session ends its first turn on a network outage, its retries spent, as P23 recorded. */
export function fakeAgentEndsOnNetworkOutage(): boolean {
  return switchIsOn(FAKE_AGENT_NETWORK_OUTAGE_VARIABLE);
}

export function overseerPollIntervalVariableOf({ ENVIRONMENT_PREFIX }: Pick<ProductNames, 'ENVIRONMENT_PREFIX'>): string {
  return `${ENVIRONMENT_PREFIX}OVERSEER_POLL_INTERVAL_MILLISECONDS`;
}

export const OVERSEER_POLL_INTERVAL_VARIABLE = overseerPollIntervalVariableOf(PRODUCT_NAMES);

const WHOLE_MILLISECONDS = /^[1-9]\d*$/u;

/**
 * A test setting: the milliseconds between the Overseer's ready, Baton pass and stop polls, in place of the limits in
 * `src/shared/constants/OverseerLimits.ts`. Empty or whitespace reads as unset; any value but a positive whole number is refused.
 */
export function overseerPollIntervalOverride(): number | undefined {
  const value = nonBlankValueOf(OVERSEER_POLL_INTERVAL_VARIABLE)?.trim();
  if (value === undefined) return undefined;
  if (!WHOLE_MILLISECONDS.test(value)) {
    throw new OperationRefusal('refused', { kind: 'malformed-overseer-poll-interval', variable: OVERSEER_POLL_INTERVAL_VARIABLE, value });
  }
  return Number(value);
}

export function versionsAnswerVariableOf({ ENVIRONMENT_PREFIX }: Pick<ProductNames, 'ENVIRONMENT_PREFIX'>): string {
  return `${ENVIRONMENT_PREFIX}VERSIONS_ANSWER`;
}

export const VERSIONS_ANSWER_VARIABLE = versionsAnswerVariableOf(PRODUCT_NAMES);

const VERSIONS_ANSWER_SEPARATOR = '/';

/**
 * A test setting for a client's recordings: what `GET /api/versions` answers, `<current>/<minimum supported>` such as `1.3/1.0`, in place
 * of `FORGE_SYSTEM_VERSIONS`, so a client records a forge ahead of it or of another major, which no real forge is. Empty or whitespace
 * reads as unset; any other value but two `major.minor` versions, the minimum not newer than the current, is refused.
 */
export function versionsAnswerOverride(): VersionsDocument | undefined {
  const value = nonBlankValueOf(VERSIONS_ANSWER_VARIABLE)?.trim();
  if (value === undefined) return undefined;
  const [currentText, minimumText, ...rest] = value.split(VERSIONS_ANSWER_SEPARATOR);
  const current = SystemVersionUtil.versionOfText(currentText ?? '');
  const minimumSupported = SystemVersionUtil.versionOfText(minimumText ?? '');
  if (rest.length > 0 || current === null || minimumSupported === null || SystemVersionUtil.isOlder(current, minimumSupported)) {
    throw new OperationRefusal('refused', { kind: 'malformed-versions-answer', variable: VERSIONS_ANSWER_VARIABLE, value });
  }
  return { current, minimumSupported };
}

export function flintBrainMaximumVariableOf({ ENVIRONMENT_PREFIX }: Pick<ProductNames, 'ENVIRONMENT_PREFIX'>): string {
  return `${ENVIRONMENT_PREFIX}FLINT_BRAIN_MAXIMUM_MILLISECONDS`;
}

export const FLINT_BRAIN_MAXIMUM_VARIABLE = flintBrainMaximumVariableOf(PRODUCT_NAMES);

/**
 * A test setting for a client's recordings: how long one run of Flint's brain lasts, in place of `FLINT_BRAIN_MAXIMUM_RUN_MILLISECONDS`, so
 * a recording sees a run end on its own. Any value but a positive whole number reads as unset, and a run keeps its whole maximum.
 */
export function flintBrainMaximumOverride(): number | undefined {
  const value = nonBlankValueOf(FLINT_BRAIN_MAXIMUM_VARIABLE)?.trim();
  return value !== undefined && WHOLE_MILLISECONDS.test(value) ? Number(value) : undefined;
}

export function flintBrainWithheldVariableOf({ ENVIRONMENT_PREFIX }: Pick<ProductNames, 'ENVIRONMENT_PREFIX'>): string {
  return `${ENVIRONMENT_PREFIX}WITHOUT_FLINT_BRAIN`;
}

export const FLINT_BRAIN_WITHHELD_VARIABLE = flintBrainWithheldVariableOf(PRODUCT_NAMES);

/**
 * A test setting for a client's recordings: the forge answers as one that cannot run Flint's brain confined, with no brain in its monitor
 * snapshot and a start refused `no-flint`. Read like the every-tool switch.
 */
export function flintBrainIsWithheld(): boolean {
  return switchIsOn(FLINT_BRAIN_WITHHELD_VARIABLE);
}

export const EVERY_TOOL_REQUIRED_VARIABLE = everyToolRequiredVariableOf(PRODUCT_NAMES);

const USER_SHELL_VARIABLE = 'SHELL';
const COMMAND_INTERPRETER_VARIABLE = 'ComSpec';
const SYSTEM_ROOT_VARIABLE = 'SystemRoot';
const EXECUTABLE_SEARCH_PATH_VARIABLE = 'PATH';
const BUN_INSTALL_FOLDER_VARIABLE = 'BUN_INSTALL';

/**
 * Turns every spec the tool guard (`src/testing/ToolGuard.ts`) would skip for a missing tool into a failure, for a run on a machine that
 * must prove every claim. Any value but empty, whitespace or `0` requires, so a `true` or `yes` is never a silent skip.
 */
export function everyToolIsRequired(): boolean {
  return switchIsOn(EVERY_TOOL_REQUIRED_VARIABLE);
}

/** A copy of the whole environment, for a child process that should inherit it with a variable or two replaced; a variable without a value is left out. */
export function environmentCopy(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

export const NO_ORPHANS_VARIABLE = 'BUN_FEATURE_FLAG_NO_ORPHANS';

/** The whole environment less Bun's flag that ends a process with its parent, for a Watcher or an Overseer, which must outlive theirs. */
export function outlivingProgramEnvironment(): Record<string, string> {
  return Object.fromEntries(Object.entries(environmentCopy()).filter(([name]) => name !== NO_ORPHANS_VARIABLE));
}

function switchIsOn(variable: string): boolean {
  const value = process.env[variable]?.trim();
  return value !== undefined && value.length > 0 && value !== '0';
}

/**
 * Overrides the walk `src/services/tracker/Workspace.ts` would do; an empty or whitespace-only value reads as unset, because an empty root is
 * a relative path.
 */
export function agentProgressRootOverride(): string | undefined {
  return nonBlankValueOf(ROOT_OVERRIDE_VARIABLE);
}

export function jobIdVariableOf({ ENVIRONMENT_PREFIX }: Pick<ProductNames, 'ENVIRONMENT_PREFIX'>): string {
  return `${ENVIRONMENT_PREFIX}JOB_ID`;
}

export function hatchDirectoryVariableOf({ ENVIRONMENT_PREFIX }: Pick<ProductNames, 'ENVIRONMENT_PREFIX'>): string {
  return `${ENVIRONMENT_PREFIX}HATCH_DIRECTORY`;
}

export function launchingProgramVariableOf({ ENVIRONMENT_PREFIX }: Pick<ProductNames, 'ENVIRONMENT_PREFIX'>): string {
  return `${ENVIRONMENT_PREFIX}LAUNCHING_PROGRAM`;
}

export const LAUNCHING_PROGRAM_VARIABLE = launchingProgramVariableOf(PRODUCT_NAMES);

/** The compiled launcher that started this process, which sets it on the program it starts; empty or whitespace-only reads as unset. */
export function launchingProgram(): string | undefined {
  return nonBlankValueOf(LAUNCHING_PROGRAM_VARIABLE);
}

/** The whole environment plus the launcher's own path, for the program the launcher starts, so the monitor registry can name the launcher. */
export function launchedProgramEnvironment(launcherPath: string): Record<string, string> {
  return { ...environmentCopy(), [LAUNCHING_PROGRAM_VARIABLE]: launcherPath };
}

export function gateReportVariableOf({ ENVIRONMENT_PREFIX }: Pick<ProductNames, 'ENVIRONMENT_PREFIX'>): string {
  return `${ENVIRONMENT_PREFIX}GATE_REPORT`;
}

/** Set on every gate line the Overseer runs, never read here: the path where the gate may write its report (`GateReportFile.ts`). */
export const GATE_REPORT_VARIABLE = gateReportVariableOf(PRODUCT_NAMES);

export const JOB_ID_VARIABLE = jobIdVariableOf(PRODUCT_NAMES);

export const HATCH_DIRECTORY_VARIABLE = hatchDirectoryVariableOf(PRODUCT_NAMES);

/** The Overseer's job this process runs under, set on every session it launches; empty or whitespace-only reads as unset. */
export function overseerJobId(): string | undefined {
  return nonBlankValueOf(JOB_ID_VARIABLE);
}

/** The job's Hatch folder, the one place outside its working directory the session may write; empty or whitespace-only reads as unset. */
export function hatchDirectory(): string | undefined {
  return nonBlankValueOf(HATCH_DIRECTORY_VARIABLE);
}

/** `CLAUDE_CONFIG_DIR`, which moves Claude Code's user folder; empty or whitespace-only reads as unset. */
export function claudeConfigFolderVariable(): string | undefined {
  return nonBlankValueOf(CLAUDE_CONFIG_FOLDER_VARIABLE);
}

/**
 * Whether `ANTHROPIC_API_KEY` holds a key, which API billing needs before any session starts; empty or whitespace-only reads as unset. Only
 * presence is answered: the value goes to a session through its Watcher's own environment, never through the Overseer's code or files.
 */
export function apiBillingKeyIsSet(): boolean {
  return nonBlankValueOf(CLAUDE_API_KEY_VARIABLE) !== undefined;
}

/** The one answer to where Claude Code keeps its transcripts and user files for this process: `CLAUDE_CONFIG_DIR`, else `<home>/.claude`. */
export function claudeConfigFolder(homeDirectory: string): string {
  return claudeConfigFolderOf(homeDirectory, claudeConfigFolderVariable());
}

function nonBlankValueOf(variable: string): string | undefined {
  const value = process.env[variable];
  if (value === undefined || value.trim().length === 0) return undefined;
  return value;
}

/** The folders of `PATH`, in order, empty entries left out: the executables a gate's cache path must never let a branch replace. */
export function executableSearchPath(): string[] {
  return (process.env[EXECUTABLE_SEARCH_PATH_VARIABLE] ?? '').split(delimiter).filter((folder) => folder !== '');
}

/** A write to this process's environment outside a spec, for the test preload that puts each program trap ahead of the real program. */
export function prependToExecutableSearchPath(folder: string): void {
  process.env[EXECUTABLE_SEARCH_PATH_VARIABLE] = [folder, ...executableSearchPath()].join(delimiter);
}

/** For the real-system spec file that takes one program trap off `PATH` for its own cases. */
export function removeFromExecutableSearchPath(folder: string): void {
  process.env[EXECUTABLE_SEARCH_PATH_VARIABLE] = executableSearchPath().filter((searchFolder) => searchFolder !== folder).join(delimiter);
}

const TEMPORARY_FOLDER_VARIABLE = 'TMPDIR';

/** A write to this process's environment outside a spec, for the test preload that gives the run, and every child it starts, a temp folder of its own. */
export function moveTemporaryFolderTo(folder: string): void {
  process.env[TEMPORARY_FOLDER_VARIABLE] = folder;
}

/** The user's shell, which runs a gate's checks line; an empty or whitespace-only value reads as unset, and the caller picks a default. */
export function userShell(): string | undefined {
  return nonBlankValueOf(USER_SHELL_VARIABLE);
}

/** `BUN_INSTALL`, the folder Bun's installer and `bun link` put Bun's `bin` folder in; empty or whitespace-only reads as unset. */
export function bunInstallFolder(): string | undefined {
  return nonBlankValueOf(BUN_INSTALL_FOLDER_VARIABLE);
}

/** Windows' `ComSpec`, the cmd.exe that runs a gate's line there; an empty or whitespace-only value reads as unset. */
export function commandInterpreter(): string | undefined {
  return nonBlankValueOf(COMMAND_INTERPRETER_VARIABLE);
}

/** Windows' `SystemRoot`, whose `System32\cmd.exe` runs a gate's line when `ComSpec` is no absolute path; empty or whitespace reads as unset. */
export function systemRoot(): string | undefined {
  return nonBlankValueOf(SYSTEM_ROOT_VARIABLE);
}
