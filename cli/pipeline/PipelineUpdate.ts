/** `pipeline update` opens an update record on the stored pipeline, which a later Apply replaces. */
import type { CommandContext } from '../CommandContext.ts';
import type { ArgumentParser } from '../arguments/ArgumentParser.ts';
import { applySetupCommand }   from './SetupCommandLine.ts';
import { PIPELINE_USAGE }      from './constants/PipelineUsage.ts';

export async function startPipelineUpdate(commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  commandArguments.rejectUnknownOptions(['json'], PIPELINE_USAGE.update);
  commandArguments.rejectExtraPositionals(1, PIPELINE_USAGE.update);
  await applySetupCommand(commandArguments, context, { kind: 'pipeline-update-start' });
}
