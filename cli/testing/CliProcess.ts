/**
 * Spawns the real binary for the one claim an in-process `runCommandLine` cannot make: that `agent-progress.ts` itself works, shebang, executable
 * bit and exit code included, for a spec that must set the child's environment, which no spec may set in-process, and for one whose
 * command must run in its own process beside another. `src/testing/BoundarySpecs.ts` lists its callers, and
 * `cli/overseer/OverseerCommand.integration.spec.ts` starts Overseers through it that run until stopped.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join }                from 'node:path';

import { CLAUDE_CONFIG_FOLDER_VARIABLE } from '../../src/lib/claude-code/ClaudeConfigFolder.ts';
import {
  environmentCopy,
  fakeAgentVariableOf,
  overseerPollIntervalVariableOf,
  rootOverrideVariableOf,
} from '../../src/shared/Environment.ts';
import { ORIGINAL_PRODUCT_NAMES, SIDE_BY_SIDE_PRODUCT_NAMES } from '../../src/shared/constants/ProductNames.ts';
import { claudeLaunchTrapFolders }                            from '../../src/testing/ClaudeLaunchTrap.ts';
import type { RecordedGit, RecordedGitStage }                 from '../../src/testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }     from '../../src/testing/ScratchWorkspace.ts';
import { requireTrackerIsolation }                            from '../../src/testing/TrackerIsolation.ts';

export interface AgentProgressResult {
  exitCode:       number;
  standardOutput: string;
  standardError:  string;
}

export interface RunAgentProgressOptions {
  currentDirectory:       string;
  /** The child's whole environment, beside a `PATH` reaching Bun and git; absent, it inherits this process's. */
  environment?:           Record<string, string>;
  standardInput?:         string;
  /** The child's `HOME`, checked to be a scratch directory; absent, a fresh scratch folder removed after the run. A `HOME` in `environment` never wins. */
  homeDirectory?:         string;
  /** The child runs under the other program's product names, through `cli/testing/OtherProductNamesPreload.ts`. */
  runsAsTheOtherProgram?: boolean;
  /** The child starts no git: it answers this stage from the recorded git answers, and a call it could not answer fails the run. */
  recordedGitStage?:      RecordedGitStage;
  /** The child starts no git: a long-running child, such as an Overseer, answers each call from this set, in any order and as often as it asks. */
  recordedGitAnswerSet?:  RecordedGitStage;
}

const RECORDED_GIT_MODULE = join(import.meta.dir, '..', '..', 'src', 'testing', 'RecordedGit.ts');

interface RecordedGitPreload {
  preloadArguments:   readonly string[];
  /** Throws naming each git call the child could not answer, and each step of the stage it never asked. */
  requireStagePlayed: () => void;
  remove:             () => void;
}

/** A preload file of its own for one child, since a child reads no stage from this process: it is written into the preload's text. */
function recordedGitPreloadOf({ recordedGitStage, recordedGitAnswerSet }: RunAgentProgressOptions): RecordedGitPreload {
  if (recordedGitStage !== undefined && recordedGitAnswerSet !== undefined) throw new Error('a child plays either a recorded git stage or an answer set, not both');
  const answers = recordedGitStage ?? recordedGitAnswerSet;
  if (answers === undefined) return { preloadArguments: [], requireStagePlayed: () => undefined, remove: () => undefined };
  const playerName = recordedGitStage === undefined ? 'answerRecordedGitInThisProcess' : 'playRecordedGitInThisProcess';
  const folder = createScratchDirectory('recorded-git-preload');
  const reportPath = join(folder, 'unanswered.txt');
  const preloadPath = join(folder, 'RecordedGitPreload.ts');
  writeFileSync(reportPath, '');
  writeFileSync(preloadPath, [
    `import { ${playerName} } from ${JSON.stringify(RECORDED_GIT_MODULE)};`,
    `${playerName}(${JSON.stringify(answers)}, ${JSON.stringify(reportPath)});`,
  ].join('\n'));
  return {
    preloadArguments:   ['--preload', preloadPath],
    requireStagePlayed: () => {
      const report = readFileSync(reportPath, 'utf8').trim();
      if (report.length > 0) throw new Error(`the child's git did not play its recorded stage:\n${report}`);
    },
    remove: () => removeScratchDirectory(folder),
  };
}

/** Either program's, so a spec handing the child the other program's root still cannot point it outside the scratch root. */
const ROOT_OVERRIDE_VARIABLES = [ORIGINAL_PRODUCT_NAMES, SIDE_BY_SIDE_PRODUCT_NAMES].map((productNames) => rootOverrideVariableOf(productNames));

/** On under either program's names, so no spawned binary launches a vendor's agent; applied last, so no spec's environment turns it off. */
const FAKE_AGENT_SWITCHES = Object.fromEntries([ORIGINAL_PRODUCT_NAMES, SIDE_BY_SIDE_PRODUCT_NAMES].map((productNames) => [fakeAgentVariableOf(productNames), '1']));

const SHORT_OVERSEER_POLL_INTERVAL_MILLISECONDS = '25';

/** Under either program's names, so a spawned Overseer and its `oversee` callers poll fast; a spec's environment may set its own. */
const SHORT_OVERSEER_POLL_INTERVALS = Object.fromEntries(
  [ORIGINAL_PRODUCT_NAMES, SIDE_BY_SIDE_PRODUCT_NAMES].map((productNames) => [overseerPollIntervalVariableOf(productNames), SHORT_OVERSEER_POLL_INTERVAL_MILLISECONDS]),
);

function bunAndGitSearchPath(): string {
  const gitExecutable = Bun.which('git');
  return [dirname(process.execPath), ...(gitExecutable === null ? [] : [dirname(gitExecutable)])].join(delimiter);
}

/**
 * Built rather than inherited, because only `src/shared/Environment.ts` reads this process's environment. The `claude` trap leads the
 * child's `PATH` whatever the spec's environment says, so a binary that reached the vendor's adapter all the same would still be caught.
 */
export function childEnvironmentOf(environment: Record<string, string> | undefined, homeDirectory: string): Record<string, string> {
  // The developer's Claude config folder stays behind with their home, so a spawned binary reads only the scratch home's transcripts.
  const inheritedOrBuilt = environment === undefined
    ? Object.fromEntries(Object.entries(environmentCopy()).filter(([name]) => name !== CLAUDE_CONFIG_FOLDER_VARIABLE))
    : { PATH: bunAndGitSearchPath(), ...environment };
  return {
    ...SHORT_OVERSEER_POLL_INTERVALS,
    ...inheritedOrBuilt,
    ...FAKE_AGENT_SWITCHES,
    PATH: [...claudeLaunchTrapFolders(), inheritedOrBuilt['PATH'] ?? ''].join(delimiter),
    HOME: homeDirectory,
  };
}

/** The existence check is the point: a wrong number of `..` segments still resolves, and the spawn would then fail as a Bun entry-point error. */
function agentProgressEntryPoint(): string {
  const entryPoint = join(import.meta.dir, '..', '..', 'agent-progress.ts');
  if (!existsSync(entryPoint)) {
    throw new Error(`The CLI entry point is not at ${entryPoint}; cli/testing/CliProcess.ts has to be told where it moved to.`);
  }
  return entryPoint;
}

export interface StartedAgentProgress {
  /** The first line the child prints on standard output, or `null` when it exits before printing one. */
  firstOutputLine: Promise<string | null>;
  /** The exit code and both streams, once the child ends. */
  finished:        Promise<AgentProgressResult>;
  processId:       number;
}

async function firstLineAndRestOf(stream: ReadableStream<Uint8Array>, onFirstLine: (line: string | null) => void): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  let reported = false;
  for await (const chunk of stream) {
    text += decoder.decode(chunk, { stream: true });
    const lineEnd = text.indexOf('\n');
    if (!reported && lineEnd >= 0) {
      reported = true;
      onFirstLine(text.slice(0, lineEnd));
    }
  }
  if (!reported) onFirstLine(null);
  return text;
}

/**
 * A long-running command, such as a foreground Overseer, in its own process beside the spec: the spec reads its first output line while
 * it runs and its result once something stops it. Its `HOME` is the one the options name, never removed here, since the child outlives
 * this call.
 */
export function startAgentProgress(commandLineArguments: readonly string[], options: RunAgentProgressOptions & { homeDirectory: string }): StartedAgentProgress {
  requireTrackerIsolation(options.currentDirectory);
  requireTrackerIsolation(options.homeDirectory);
  const recordedGit = recordedGitPreloadOf(options);
  const spawned = Bun.spawn(['bun', ...recordedGit.preloadArguments, agentProgressEntryPoint(), ...commandLineArguments], {
    cwd:    options.currentDirectory,
    stdin:  'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env:    childEnvironmentOf(options.environment, options.homeDirectory),
  });
  let reportFirstLine: (line: string | null) => void = () => undefined;
  const firstOutputLine = new Promise<string | null>((resolve) => { reportFirstLine = resolve; });
  const finished = Promise.all([
    firstLineAndRestOf(spawned.stdout, reportFirstLine),
    new Response(spawned.stderr).text(),
    spawned.exited,
  ]).then(([standardOutput, standardError, exitCode]) => {
    try {
      recordedGit.requireStagePlayed();
    } finally {
      recordedGit.remove();
    }
    return { exitCode, standardOutput, standardError };
  });
  return { firstOutputLine, finished, processId: spawned.pid };
}

/**
 * Both streams are read to completion before the exit code is awaited, since a pipe that fills while nobody drains it is a hang, not a failure.
 * The child always gets a scratch `HOME`, so no spawned command can write the real home's monitor registry.
 */
export async function runAgentProgress(commandLineArguments: readonly string[], options: RunAgentProgressOptions): Promise<AgentProgressResult> {
  const preloadArguments = options.runsAsTheOtherProgram === true ? ['--preload', join(import.meta.dir, 'OtherProductNamesPreload.ts')] : [];
  const recordedGit = recordedGitPreloadOf(options);
  try {
    const result = await runIsolated(['bun', ...preloadArguments, ...recordedGit.preloadArguments, agentProgressEntryPoint()], commandLineArguments, options);
    recordedGit.requireStagePlayed();
    return result;
  } finally {
    recordedGit.remove();
  }
}

/**
 * `runAgentProgress` in a spec whose own git plays `recordedGit`: the isolation check here asks git for the root of each directory it is
 * handed that holds no tracker, and `isolationCheckStage` answers those questions.
 */
export async function runAgentProgressBesideRecordedGit(
  recordedGit: RecordedGit, isolationCheckStage: RecordedGitStage, commandLineArguments: readonly string[], options: RunAgentProgressOptions,
): Promise<AgentProgressResult> {
  return await recordedGit.playStage(isolationCheckStage, async () => runAgentProgress(commandLineArguments, options));
}

/**
 * A command line the Overseer renders to start the binary, such as the network guard hook, run as written: its first part is the program,
 * spawned by its path with the same isolation and environment as `runAgentProgress`.
 */
export async function runRenderedCommandLine(renderedCommandLine: readonly string[], options: RunAgentProgressOptions): Promise<AgentProgressResult> {
  return await runIsolated(renderedCommandLine, [], options);
}

async function runIsolated(programCommand: readonly string[], commandLineArguments: readonly string[], options: RunAgentProgressOptions): Promise<AgentProgressResult> {
  requireTrackerIsolation(options.currentDirectory);
  for (const variable of ROOT_OVERRIDE_VARIABLES) {
    const overriddenRoot = options.environment?.[variable];
    if (overriddenRoot !== undefined) requireTrackerIsolation(overriddenRoot);
  }
  if (options.homeDirectory !== undefined) requireTrackerIsolation(options.homeDirectory);
  const homeDirectory = options.homeDirectory ?? createScratchDirectory('cli-process-home');
  try {
    const spawned = Bun.spawn([...programCommand, ...commandLineArguments], {
      cwd:    options.currentDirectory,
      stdin:  options.standardInput === undefined ? 'ignore' : new Blob([options.standardInput]),
      stdout: 'pipe',
      stderr: 'pipe',
      env:    childEnvironmentOf(options.environment, homeDirectory),
    });
    const [standardOutput, standardError, exitCode] = await Promise.all([
      new Response(spawned.stdout).text(),
      new Response(spawned.stderr).text(),
      spawned.exited,
    ]);
    return { exitCode, standardOutput, standardError };
  } finally {
    if (options.homeDirectory === undefined) removeScratchDirectory(homeDirectory);
  }
}
