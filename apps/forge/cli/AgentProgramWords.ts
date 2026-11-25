/** How a command line names the forge's agent and its tools: `machine` or a program's path, and `<name>` or `<name>=<path>` per tool. */
import { isAbsolute, resolve } from 'node:path';

import type { PipelineAgent, PipelineTool } from '../src/lib/tracker-model/@types/Pipeline.ts';
import type { CommandContext }              from './CommandContext.ts';
import { refuseUsage }                      from './RecordedIncidentMove.ts';

export const MACHINE_PROGRAM_WORD = 'machine';

/** A path written relative to the folder the command runs in is that folder's; it is kept as written there, never resolved through a link. */
export function programPathFrom(written: string | undefined, context: CommandContext, usage: string): string {
  if (written === undefined || written === '') refuseUsage('Name the program by its path.', usage);
  return isAbsolute(written) ? written : resolve(context.currentDirectory, written);
}

/** This process's agent, running the machine's program or the program at the path written. */
export function agentFrom(written: string | undefined, context: CommandContext, usage: string): PipelineAgent {
  if (written === undefined) refuseUsage(`Name the program: ${MACHINE_PROGRAM_WORD} or its path.`, usage);
  const { vendor } = context.agentAdapter;
  return written === MACHINE_PROGRAM_WORD ? { vendor, program: { follows: 'machine' } } : { vendor, program: { pinned: programPathFrom(written, context, usage) } };
}

/** `<name>` is found by the command before the board takes it, which the empty path stands for; `<name>=<path>` names the path. */
export function toolFrom(written: string, context: CommandContext, usage: string): PipelineTool {
  const separator = written.indexOf('=');
  const name = separator === -1 ? written : written.slice(0, separator);
  if (name === '' || /[\\/\s]/.test(name)) refuseUsage(`"${written}" names no tool: write a program's name, or <name>=<path>.`, usage);
  return { name, path: separator === -1 ? '' : programPathFrom(written.slice(separator + 1), context, usage) };
}
