/**
 * What a command about the forge's agent needs settled before it reaches the board, outside any hold: a chosen program is run once with
 * its version arguments and refused when it does not run, and a tool named alone is found in the places installers put programs.
 */
import { MachineConfigFile }                            from '../../adapters/machine-config/MachineConfigFile.ts';
import type { PipelineAgent, PipelineTool }             from '../../lib/tracker-model/@types/Pipeline.ts';
import type { PipelineDraftEdit }                       from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { AgentProgramCheck }                       from '../../shared/@types/AgentProgramCheck.ts';
import type { ControlCommand }                          from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                             from '../../shared/OperationRefusal.ts';
import { type AgentProgramCheckContext, AgentPrograms } from './AgentPrograms.ts';
import { AgentTools }                                   from './AgentTools.ts';

export interface AgentCommandPreparationContext {
  check:         AgentProgramCheckContext;
  monitorFolder: string;
  /** The folders a tool named alone is looked for in, in order. */
  toolFolders:   readonly string[];
  /** Told each run, so the views read it at once. */
  recordCheck?:  (check: AgentProgramCheck) => void;
}

function refusalOf(check: Extract<AgentProgramCheck, { verdict: 'does-not-run' }>, agentName: string): OperationRefusal {
  return new OperationRefusal('refused', {
    kind: 'agent-program-does-not-run', cause: check.cause, programPath: check.programPath, agentName
  });
}

/** Refused unless the program the choice names now runs and answers as the agent. */
async function requireRunningChoice(agent: Readonly<PipelineAgent>, context: AgentCommandPreparationContext): Promise<void> {
  const machineProgramPath = MachineConfigFile.programPathOf(MachineConfigFile.read(context.monitorFolder), agent.vendor);
  const check = await AgentPrograms.choiceCheckOf(agent, machineProgramPath, context.check);
  context.recordCheck?.(check);
  if (check.verdict === 'does-not-run') throw refusalOf(check, context.check.adapter.displayName);
}

/** Refused unless the program runs and answers as the agent: what `machine-agent-program-set` keeps. */
async function requireRunningProgram(vendor: string, programPath: string, context: AgentCommandPreparationContext): Promise<void> {
  await requireRunningChoice({ vendor, program: { pinned: programPath } }, context);
}

/** A tool sent with no path is found; one found nowhere is refused, naming where forge looked. */
function foundToolsOf(tools: readonly PipelineTool[], context: AgentCommandPreparationContext): PipelineTool[] {
  return tools.map((tool) => {
    if (tool.path !== '') return tool;
    const path = AgentTools.foundPathOf(tool.name, context.toolFolders, context.check.resolver);
    if (path === null) throw new OperationRefusal('refused', { kind: 'tool-not-found', name: tool.name, searchedFolders: [...context.toolFolders] });
    return { name: tool.name, path };
  });
}

function draftEditWithFoundTools(edit: PipelineDraftEdit, context: AgentCommandPreparationContext): PipelineDraftEdit {
  return edit.target === 'tools' && edit.value !== null ? { target: 'tools', value: foundToolsOf(edit.value, context) } : edit;
}

/** The command as the board takes it, or a refusal; a command of no other kind passes as it came. */
async function preparedCommandOf(command: ControlCommand, context: AgentCommandPreparationContext): Promise<ControlCommand> {
  switch (command.kind) {
    case 'pipeline-setup-start':
      if (command.agent !== undefined) await requireRunningChoice(command.agent, context);
      return command;
    case 'pipeline-setup-agent':
    case 'pipeline-agent-set':
      await requireRunningChoice(command.agent, context);
      return command;
    case 'pipeline-tools-set':
      return command.tools === null ? command : { ...command, tools: foundToolsOf(command.tools, context) };
    case 'pipeline-draft-edit':
      return { ...command, edits: command.edits.map((edit) => draftEditWithFoundTools(edit, context)) };
    default:
      return command;
  }
}

/** User's look again runs the program the forge names now, so the views read it at once; the launches are tried whatever it answers. */
async function lookAgain(programPath: string | null, context: AgentCommandPreparationContext): Promise<void> {
  if (programPath === null) return;
  context.recordCheck?.(await AgentPrograms.checkOf(programPath, context.check));
}

export const AgentCommandPreparation = Object.freeze({ preparedCommandOf, requireRunningProgram, lookAgain });
