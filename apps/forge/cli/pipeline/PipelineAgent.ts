/** `pipeline agent <S> machine|<path>`: the agent the open setup record's pipeline agent runs on, kept only once its program runs. */
import { OperationRefusal }                               from '../../src/shared/OperationRefusal.ts';
import { agentFrom }                                      from '../AgentProgramWords.ts';
import type { CommandContext }                            from '../CommandContext.ts';
import type { ArgumentParser }                            from '../arguments/ArgumentParser.ts';
import { SUBCOMMAND_WITH_TWO_ARGUMENTS_POSITIONAL_COUNT } from '../arguments/constants/SubcommandPositionalCounts.ts';
import { applySetupCommand, setupIdOf }                   from './SetupCommandLine.ts';
import { PIPELINE_USAGE }                                 from './constants/PipelineUsage.ts';

export async function setPipelineAgent(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE.agent;
  commandArguments.rejectUnknownOptions(['json'], usage);
  commandArguments.rejectExtraPositionals(SUBCOMMAND_WITH_TWO_ARGUMENTS_POSITIONAL_COUNT, usage);
  // The agent's program is User's choice of what runs on the machine, never a session's.
  if (context.job !== undefined) throw new OperationRefusal('refused', { kind: 'verb-not-relayable', verb: context.commandVerb, jobId: context.job.jobId });
  const [, setupWord, programWord] = commandArguments.positionals();
  await applySetupCommand(commandArguments, context, { kind: 'pipeline-setup-agent', setupId: setupIdOf(setupWord, usage), agent: agentFrom(programWord, context, usage) });
}
