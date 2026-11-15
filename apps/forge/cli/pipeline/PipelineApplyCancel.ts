/** `pipeline apply-cancel <S>` clears the record's Apply request; the record is editable again and the stored pipeline stays. */
import type { CommandContext }          from '../CommandContext.ts';
import type { ArgumentParser }          from '../arguments/ArgumentParser.ts';
import { applySetupCommand, setupIdOf } from './SetupCommandLine.ts';
import { PIPELINE_USAGE }               from './constants/PipelineUsage.ts';

export async function cancelPipelineApply(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const usage = PIPELINE_USAGE['apply-cancel'];
  commandArguments.rejectUnknownOptions(['json'], usage);
  commandArguments.rejectExtraPositionals(2, usage);
  await applySetupCommand(commandArguments, context, { kind: 'pipeline-apply-cancel', setupId: setupIdOf(commandArguments.positionals()[1], usage) });
}
