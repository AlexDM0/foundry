/** `pipeline discard <S>` drops every proposed change of the draft; the record and its agent stay. */
import type { CommandContext }          from '../CommandContext.ts';
import type { ArgumentParser }          from '../arguments/ArgumentParser.ts';
import { applySetupCommand, setupIdOf } from './SetupCommandLine.ts';
import { PIPELINE_USAGE }               from './constants/PipelineUsage.ts';

export async function discardPipelineDraft(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE.discard;
  commandArguments.rejectUnknownOptions(['json'], usage);
  commandArguments.rejectExtraPositionals(2, usage);
  await applySetupCommand(commandArguments, context, { kind: 'pipeline-draft-discard', setupId: setupIdOf(commandArguments.positionals()[1], usage) });
}
