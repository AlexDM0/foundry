/**
 * Why an agent's program does not run, as one clause the board, the notices and the command line all read: it names the agent and the
 * path, and never a command line, since User runs no command.
 */
import type { JobNotLaunchedCause }      from '../../lib/tracker-model/@types/Job.ts';
import type { AgentProgramRefusalCause } from '../@types/AgentProgramCheck.ts';

function programClauseOf(cause: AgentProgramRefusalCause, agentName: string, programPath: string | null): string {
  const program = `the ${agentName} at ${programPath ?? 'no path'}`;
  switch (cause) {
    case 'no-agent-chosen':
      return 'no agent is chosen for this board';
    case 'other-vendor':
      return `the board's agent is not ${agentName}, the agent that runs here`;
    case 'no-machine-program':
      return `the board follows this machine's ${agentName}, and the machine names none`;
    case 'relative-path':
      return `${program} is not an absolute path`;
    case 'inside-forbidden-root':
      return `${program} lies inside a tracked repository, where a job could have written it`;
    case 'batch-target':
      return `${program} is a batch file, which takes no quoted argument`;
    case 'not-there':
      return `${program} is not there`;
    case 'not-executable':
      return `${program} is not a program this user may run`;
    case 'no-adapter':
      return 'no program can run on this platform';
    case 'did-not-start':
      return `${program} did not start`;
    case 'timed-out':
      return `${program} did not answer in time`;
    case 'failed':
      return `${program} failed when asked for its version`;
    case 'not-this-agent':
      return `the program at ${programPath ?? 'no path'} did not answer as ${agentName}`;
  }
}

function notLaunchedClauseOf(cause: JobNotLaunchedCause, agentName: string, programPath: string | null): string {
  return programClauseOf(cause, agentName, programPath);
}

export const AgentProgramWordingUtil = Object.freeze({ programClauseOf, notLaunchedClauseOf });
