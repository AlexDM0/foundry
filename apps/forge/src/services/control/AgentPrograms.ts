/**
 * The program a forge's agent runs: the forge's choice read through the machine's config, kept as the choice names it and checked where it
 * lies; where the vendor's installers put it; and, before a choice is kept, its one run with the vendor's version arguments.
 */
import { dirname } from 'node:path';

import type { JobNotLaunched, JobNotLaunchedCause } from '../../domain/tracker-model/@types/Job.ts';
import type { AgentProgramChoice, PipelineAgent }   from '../../domain/tracker-model/@types/Pipeline.ts';
import type { AgentAdapter }                        from '../../lib/agent-launch/AgentAdapter.ts';
import type { LaunchEnvironment }                   from '../../lib/agent-launch/LaunchEnvironment.ts';
import type { ExecutableResolver }                  from '../../lib/executable-resolver/ExecutableResolver.ts';
import type { ProgramCheckRun }                     from '../../lib/program-check/ProgramCheck.ts';
import type { ProgramFolders }                      from '../../lib/program-folders/ProgramFolders.ts';
import { ProgramSearchUtil }                        from '../../lib/program-folders/utils/ProgramSearchUtil.ts';
import type { AgentProgramPlace }                   from '../../shared/@types/AgentFacts.ts';
import type { AgentProgramCheck }                   from '../../shared/@types/AgentProgramCheck.ts';

/** A failed run's first line is shown in a sentence, so a program that floods its output does not flood the sentence. */
const FAILED_RUN_OUTPUT_LINE_LIMIT_CHARACTERS = 200;

/** The program a launch starts, or why the job is not launched. */
export type AgentProgramResolution =
  | { verdict: 'found'; programPath: string }
  | { verdict: 'not-launched'; notLaunched: JobNotLaunched };

export interface AgentProgramSource {
  agent:              Readonly<PipelineAgent> | null;
  /** The vendor of the agent adapter this forge runs. */
  adapterVendor:      string;
  /** The machine's program of the agent's vendor, `null` when the machine names none. */
  machineProgramPath: string | null;
  resolver:           ExecutableResolver;
  /** A program anywhere in these roots is code a job could have written. */
  forbiddenRoots:     readonly string[];
}

/** What a run of a program with its version arguments needs. */
export interface AgentProgramCheckContext {
  adapter:              AgentAdapter;
  resolver:             ExecutableResolver;
  forbiddenRoots:       readonly string[];
  /** The folders of the forge's approved tools now, which a launch puts before the program's own folder, as the run does. */
  toolFolders:          () => readonly string[];
  launchEnvironment:    LaunchEnvironment;
  inheritedEnvironment: Readonly<Record<string, string | undefined>>;
  run:                  ProgramCheckRun;
  timeoutMilliseconds:  number;
}

/** The program a choice names: its pinned path, or the machine's program of its vendor; `null` when it follows a machine that names none. */
function chosenPathOf(program: Readonly<AgentProgramChoice>, machineProgramPath: string | null): string | null {
  return 'pinned' in program ? program.pinned : machineProgramPath;
}

/** `programAt` answers only the refusals of a configured path; a lookup's own causes never reach here, and read as nothing there. */
function notLaunchedCauseOf(cause: Exclude<ReturnType<ExecutableResolver['programAt']>, { verdict: 'found' }>['cause']): JobNotLaunchedCause {
  switch (cause) {
    case 'relative-path':
    case 'inside-forbidden-root':
    case 'batch-target':
    case 'not-there':
    case 'not-executable':
    case 'no-adapter':
      return cause;
    default:
      return 'not-there';
  }
}

/**
 * Where the program a choice names may not lie: the forge's own repository, and, for the machine's program, which every forge that follows
 * it runs, every registered forge's repository too.
 */
function forbiddenRootsOf(agent: Readonly<PipelineAgent> | null, ownRepositoryRoot: string, registeredRepositoryRoots: readonly string[]): string[] {
  const followsTheMachine = agent !== null && !('pinned' in agent.program);
  return followsTheMachine ? [...new Set([ownRepositoryRoot, ...registeredRepositoryRoots])] : [ownRepositoryRoot];
}

function resolutionOf(source: AgentProgramSource): AgentProgramResolution {
  const { agent } = source;
  if (agent === null) return { verdict: 'not-launched', notLaunched: { cause: 'no-agent-chosen', programPath: null } };
  const programPath = chosenPathOf(agent.program, source.machineProgramPath);
  if (agent.vendor !== source.adapterVendor) return { verdict: 'not-launched', notLaunched: { cause: 'other-vendor', programPath } };
  if (programPath === null) return { verdict: 'not-launched', notLaunched: { cause: 'no-machine-program', programPath: null } };
  const program = source.resolver.programAt(programPath, source.forbiddenRoots);
  if (program.verdict === 'refused') return { verdict: 'not-launched', notLaunched: { cause: notLaunchedCauseOf(program.cause), programPath } };
  return { verdict: 'found', programPath: program.path };
}

/** The first line a failed run printed, cut to a sentence's length; `null` when it printed nothing. */
function firstOutputLineOf(output: string): string | null {
  const line = output.split(/\r?\n/u).map((candidate) => candidate.trim()).find((candidate) => candidate !== '');
  return line === undefined ? null : line.slice(0, FAILED_RUN_OUTPUT_LINE_LIMIT_CHARACTERS);
}

/** The run's search path is the launch's: the approved tools' folders, then the program's own, then the system's. */
async function checkOf(programPath: string, context: AgentProgramCheckContext): Promise<AgentProgramCheck> {
  const program = context.resolver.programAt(programPath, context.forbiddenRoots);
  if (program.verdict === 'refused') return { verdict: 'does-not-run', programPath, cause: notLaunchedCauseOf(program.cause) };
  const { launchEnvironment } = context;
  const searchFolders = [...context.toolFolders(), dirname(programPath)];
  const environment = launchEnvironment.withSearchFolders(launchEnvironment.launchEnvironmentOf(context.inheritedEnvironment, {}), searchFolders);
  const answer = await context.run({
    programPath, arguments: context.adapter.versionArguments, environment, timeoutMilliseconds: context.timeoutMilliseconds
  });
  if (answer.kind === 'did-not-start') return { verdict: 'does-not-run', programPath, cause: 'did-not-start' };
  if (answer.kind === 'timed-out') return { verdict: 'does-not-run', programPath, cause: 'timed-out' };
  if (answer.exitCode !== 0) {
    const outputLine = firstOutputLineOf(answer.output);
    return {
      verdict: 'does-not-run', programPath, cause: 'failed', ...(outputLine === null ? {} : { outputLine })
    };
  }
  const version = context.adapter.versionOf(answer.output);
  return version === null ? { verdict: 'does-not-run', programPath, cause: 'not-this-agent' } : { verdict: 'runs', programPath, version };
}

/** A choice is checked through the program it names now: a choice that follows a machine naming none, or another vendor, never runs. */
async function choiceCheckOf(agent: Readonly<PipelineAgent>, machineProgramPath: string | null, context: AgentProgramCheckContext): Promise<AgentProgramCheck> {
  const programPath = chosenPathOf(agent.program, machineProgramPath);
  if (agent.vendor !== context.adapter.vendor) return { verdict: 'does-not-run', programPath, cause: 'other-vendor' };
  if (programPath === null) return { verdict: 'does-not-run', programPath: null, cause: 'no-machine-program' };
  return checkOf(programPath, context);
}

/** The vendor's own folders, then this platform's program folders, each with the vendor's program file name. */
function placesOf(adapter: AgentAdapter, programFolders: ProgramFolders, homeDirectory: string, resolver: ExecutableResolver): AgentProgramPlace[] {
  return ProgramSearchUtil.programPlacesOf(programFolders, homeDirectory, adapter)
    .map((path) => ({ path, found: resolver.programAt(path, []).verdict === 'found' }));
}

export const AgentPrograms = Object.freeze({
  chosenPathOf, forbiddenRootsOf, resolutionOf, checkOf, choiceCheckOf, placesOf
});
