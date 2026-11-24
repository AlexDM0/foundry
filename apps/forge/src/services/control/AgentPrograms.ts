/**
 * The program a forge's agent runs: the forge's choice read through the machine's config, kept as the choice names it and checked where it
 * lies; where the vendor's installers put it; and, before a choice is kept, its one run with the vendor's version arguments.
 */
import { dirname } from 'node:path';

import type { AgentAdapter }                        from '../../lib/agent-launch/AgentAdapter.ts';
import type { LaunchEnvironment }                   from '../../lib/agent-launch/LaunchEnvironment.ts';
import type { ExecutableResolver }                  from '../../lib/executable-resolver/ExecutableResolver.ts';
import type { ProgramCheckRun }                     from '../../lib/program-check/ProgramCheck.ts';
import type { ProgramFolders }                      from '../../lib/program-folders/ProgramFolders.ts';
import { ProgramSearchUtil }                        from '../../lib/program-folders/utils/ProgramSearchUtil.ts';
import type { JobNotLaunched, JobNotLaunchedCause } from '../../lib/tracker-model/@types/Job.ts';
import type { AgentProgramChoice, PipelineAgent }   from '../../lib/tracker-model/@types/Pipeline.ts';
import type { AgentProgramPlace }                   from '../../shared/@types/AgentFacts.ts';
import type { AgentProgramCheck }                   from '../../shared/@types/AgentProgramCheck.ts';

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

/** The program's folder is the one folder of the run's search path besides the system's, as at a launch. */
async function checkOf(programPath: string, context: AgentProgramCheckContext): Promise<AgentProgramCheck> {
  const program = context.resolver.programAt(programPath, context.forbiddenRoots);
  if (program.verdict === 'refused') return { verdict: 'does-not-run', programPath, cause: notLaunchedCauseOf(program.cause) };
  const { launchEnvironment } = context;
  const environment = launchEnvironment.withSearchFolders(launchEnvironment.launchEnvironmentOf(context.inheritedEnvironment, {}), [dirname(programPath)]);
  const answer = await context.run({
    programPath, arguments: context.adapter.versionArguments, environment, timeoutMilliseconds: context.timeoutMilliseconds
  });
  if (answer.kind === 'did-not-start') return { verdict: 'does-not-run', programPath, cause: 'did-not-start' };
  if (answer.kind === 'timed-out') return { verdict: 'does-not-run', programPath, cause: 'timed-out' };
  if (answer.exitCode !== 0) return { verdict: 'does-not-run', programPath, cause: 'failed' };
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
  chosenPathOf, resolutionOf, checkOf, choiceCheckOf, placesOf
});
