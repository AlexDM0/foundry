/** `pipeline check <S>` asks the Overseer to run the gates the draft changes or adds two times, and to send the result to the agent. */
import type { CommandContext }          from '../CommandContext.ts';
import type { ArgumentParser }          from '../arguments/ArgumentParser.ts';
import { applySetupCommand, setupIdOf } from './SetupCommandLine.ts';
import { PIPELINE_USAGE }               from './constants/PipelineUsage.ts';

export async function checkPipelineDraft(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE.check;
  commandArguments.rejectUnknownOptions(['json'], usage);
  commandArguments.rejectExtraPositionals(2, usage);
  await applySetupCommand(commandArguments, context, { kind: 'pipeline-check', setupId: setupIdOf(commandArguments.positionals()[1], usage) });
}
